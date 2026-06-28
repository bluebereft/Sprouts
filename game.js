/* ================================================================
   game.js — Sprouts v0.2.1
   
   Architecture
   ─────────────
   This file is divided into three clearly labelled sections:
   
     STATE    — the single source of truth for game data.
               Unchanged from v0.2.
   
     RENDERER — pure drawing functions that read STATE and write SVG.
               v0.2.1 refactor: circles are created once on game start
               and kept alive. Selection changes patch only the two
               affected circles rather than rebuilding the whole board.
               See the RENDERER section header for full design notes.
   
     UI       — wires up HTML controls and calls into STATE / RENDERER.
               v0.2.1: calls the two new Renderer entry points instead
               of the old render() to match the split responsibility.
   
   Nothing in RENDERER touches the DOM outside the SVG board.
   Nothing in STATE knows about SVG or HTML.
   UI is the only layer that reads HTML elements directly.
   ================================================================ */


/* ================================================================
   STATE
   ─────
   Holds the current game data.
   
   Each dot: { id: number, x: number, y: number, lives: number }
   
   selectedDotId tracks which dot is currently selected (null = none).
   UI never sets this directly — it calls the two selection helpers
   so that future logic (e.g. "can this dot be selected?") lives here.
   
   Unchanged from v0.2.
   ================================================================ */

const State = (() => {

  // The list of dots currently on the board.
  let dots = [];

  // The id of the currently selected dot, or null if none is selected.
  let selectedDotId = null;

  /**
   * Replaces the dot list with a fresh set of evenly spaced dots,
   * and resets any selection.
   *
   * @param {number} count  — how many dots to create (2–6)
   * @param {number} boardW — SVG board width  in px
   * @param {number} boardH — SVG board height in px
   */
  function initDots(count, boardW, boardH) {
    dots          = [];
    selectedDotId = null;   // clear selection when the board resets

    // Place all dots in a horizontal row through the vertical midpoint.
    const midY    = boardH / 2;
    const margin  = boardW * 0.12;
    const usableW = boardW - margin * 2;
    const step    = count > 1 ? usableW / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      dots.push({
        id:    i,
        x:     margin + i * step,
        y:     midY,
        lives: 3,             // standard Sprouts rule
      });
    }
  }

  /** Returns a shallow copy of the dots array (safe to iterate). */
  function getDots() {
    return [...dots];
  }

  /**
   * Returns the id of the currently selected dot, or null.
   * RENDERER and UI call this to know what to draw / display.
   */
  function getSelectedDotId() {
    return selectedDotId;
  }

  /**
   * Selects a dot by id.
   * Call this when a dot is clicked and nothing is selected yet,
   * OR when a different dot is clicked than the one already selected.
   *
   * @param {number} id — the dot's id
   */
  function selectDot(id) {
    selectedDotId = id;
  }

  /**
   * Clears the current selection (no dot selected).
   * Call this when the already-selected dot is clicked again.
   */
  function clearSelection() {
    selectedDotId = null;
  }

  return { initDots, getDots, getSelectedDotId, selectDot, clearSelection };

})();


/* ================================================================
   RENDERER
   ────────
   Reads from State and draws into the SVG board element.
   Never reads from HTML controls.
   
   v0.2.1 design — retained element architecture
   ──────────────────────────────────────────────
   Previously, every selection change called render() which wiped the
   entire SVG and recreated every circle from scratch. That caused the
   dot-appear animation to re-fire and produced a visual flash.
   
   The new design splits rendering into two distinct operations:
   
   1. initBoard(board)
      Called once when a game starts (or restarts).
      Clears the SVG, creates one <circle> per dot, appends them, and
      stores a reference to each element in the `circleEls` Map keyed
      by dot id. After this call the circles live in the DOM for the
      entire game and are never removed or re-created.
   
   2. updateSelection(previousId, nextId)
      Called whenever the selection changes.
      Uses `circleEls` to look up only the two circles that need to
      change — the one losing the highlight and the one gaining it —
      and toggles the "dot--selected" CSS class on each.
      Nothing else in the DOM is touched.
   
   Why a Map?
      Map<number, SVGCircleElement> gives O(1) lookup by dot id and
      makes the intent explicit: this is a live index of live elements.
      A plain array would work for 2–6 dots but Map scales cleanly and
      communicates the key→element relationship more clearly.
   ================================================================ */

const Renderer = (() => {

  const SVG_NS     = 'http://www.w3.org/2000/svg';
  const DOT_RADIUS = 10;

  // ── Retained element store ─────────────────────────────────────
  // Maps dot id (number) → the live SVGCircleElement for that dot.
  // Populated by initBoard(), read by updateSelection().
  // Cleared at the start of each initBoard() call so stale references
  // from a previous game never linger.
  let circleEls = new Map();

  // ── Internal helpers ───────────────────────────────────────────

  /**
   * Removes all child nodes from the board SVG and clears circleEls.
   * Only called from initBoard() — never on a selection change.
   *
   * @param {SVGElement} board
   */
  function clearBoard(board) {
    while (board.firstChild) {
      board.removeChild(board.firstChild);
    }
    circleEls.clear();
  }

  /**
   * Creates one SVG <circle> for a dot, appends it to the board,
   * and records the element in circleEls.
   *
   * The element is given the correct selected/unselected class
   * immediately, so the initial render reflects any pre-existing
   * selection state (unlikely in practice, but correct by design).
   *
   * @param {SVGElement} board
   * @param {object}     dot   — dot object from State.getDots()
   * @param {number}     index — array position (for animation stagger)
   */
  function createDotElement(board, dot, index) {
    const circle = document.createElementNS(SVG_NS, 'circle');

    circle.setAttribute('cx', dot.x);
    circle.setAttribute('cy', dot.y);
    circle.setAttribute('r',  DOT_RADIUS);

    // Apply initial class. State may already have a selection if
    // initBoard() is ever called mid-game in a future version.
    const isSelected = (dot.id === State.getSelectedDotId());
    circle.setAttribute('class', isSelected ? 'dot dot--selected' : 'dot');

    // Stagger the appear animation via a CSS custom property.
    circle.style.setProperty('--dot-index', index);

    // data-dot-id lets the UI click handler identify which dot was
    // clicked without needing to search circleEls by position.
    circle.dataset.dotId = dot.id;

    board.appendChild(circle);

    // Register this element so updateSelection() can find it in O(1).
    circleEls.set(dot.id, circle);
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Full board initialisation. Call once per game start.
   *
   * Clears the SVG, creates one circle per dot in State, and populates
   * circleEls. After this returns, the DOM is ready for the game and
   * only updateSelection() should modify it (until the next game start).
   *
   * @param {SVGElement} board
   */
  function initBoard(board) {
    clearBoard(board);
    State.getDots().forEach((dot, index) => createDotElement(board, dot, index));
  }

  /**
   * Patches the CSS classes of exactly the circles that changed.
   * No elements are created, removed, or re-ordered.
   *
   * @param {number|null} previousId — id of the dot that was selected
   *                                   before this change (null = none)
   * @param {number|null} nextId     — id of the dot now selected
   *                                   (null = selection cleared)
   */
  function updateSelection(previousId, nextId) {
    // Deselect the previously highlighted circle, if there was one.
    if (previousId !== null) {
      const prev = circleEls.get(previousId);
      if (prev) prev.setAttribute('class', 'dot');
    }

    // Highlight the newly selected circle, if there is one.
    if (nextId !== null) {
      const next = circleEls.get(nextId);
      if (next) next.setAttribute('class', 'dot dot--selected');
    }
  }

  return { initBoard, updateSelection };

})();


/* ================================================================
   UI
   ──
   Binds HTML controls to State + Renderer.
   
   v0.2.1 changes
   ──────────────
   startGame now calls Renderer.initBoard() instead of Renderer.render().
   
   handleBoardClick now calls Renderer.updateSelection(prev, next)
   instead of Renderer.render(). It captures the previous selection id
   before mutating State so that updateSelection() receives both the
   "before" and "after" ids and can patch exactly those two circles.
   ================================================================ */

const UI = (() => {

  // Cached reference to the status <p>. Set once in init().
  let statusEl = null;

  /**
   * Writes a message to the status element.
   * All status strings live here in UI — State and Renderer never
   * know about human-readable messages.
   *
   * @param {string} msg
   */
  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  /**
   * Handles a click anywhere on the SVG board.
   * Checks whether a dot was clicked by reading data-dot-id from the
   * event target, then applies selection logic via State.
   *
   * Selection rules:
   *   • Click an unselected dot  → select it.
   *   • Click the selected dot   → deselect it.
   *   • Click the board bg       → do nothing (no state change).
   *
   * After a state change, only the affected circles are updated via
   * Renderer.updateSelection() — the rest of the board is untouched.
   *
   * @param {MouseEvent} event
   * @param {SVGElement} board  (unused now, kept for API symmetry and
   *                             future use — e.g. drawing curves here)
   */
  function handleBoardClick(event, board) {
    const dotIdAttr = event.target.dataset.dotId;

    if (dotIdAttr === undefined) {
      // Clicked empty space — no change.
      return;
    }

    // Capture the selection BEFORE mutating State.
    // Renderer.updateSelection() needs both the old and new id.
    const previousId = State.getSelectedDotId();

    // dataset values are strings; convert to number for comparison.
    const clickedId = parseInt(dotIdAttr, 10);

    let nextId;

    if (clickedId === previousId) {
      // Clicking the already-selected dot toggles it off.
      State.clearSelection();
      nextId = null;
      setStatus('Selection cleared.');
    } else {
      // Clicking any other dot selects it (replacing any prior selection).
      State.selectDot(clickedId);
      nextId = clickedId;
      // Dot ids are 0-based internally; display as 1-based for readability.
      setStatus(`Dot ${clickedId + 1} selected.`);
    }

    // Patch only the two circles that changed. No other DOM work needed.
    Renderer.updateSelection(previousId, nextId);
  }

  /**
   * Starts a fresh game:
   * 1. Resets State (dots + selection).
   * 2. Builds the board — creates circles once via Renderer.initBoard().
   * 3. Resets status message.
   *
   * @param {HTMLSelectElement} select
   * @param {SVGElement}        board
   */
  function startGame(select, board) {
    const count  = parseInt(select.value, 10);
    const boardW = parseFloat(board.getAttribute('width'));
    const boardH = parseFloat(board.getAttribute('height'));

    State.initDots(count, boardW, boardH);
    Renderer.initBoard(board);     // creates circles once; no re-render path
    setStatus('Click a dot to begin.');
  }

  /**
   * Entry point. Runs once the DOM is ready.
   * Caches element references and attaches all event listeners.
   */
  function init() {
    const startBtn = document.getElementById('start-btn');
    const select   = document.getElementById('dot-count');
    const board    = document.getElementById('board');
    statusEl       = document.getElementById('status');

    if (!startBtn || !select || !board || !statusEl) {
      console.error('Sprouts: could not find required DOM elements.');
      return;
    }

    // Start Game button.
    startBtn.addEventListener('click', () => {
      startGame(select, board);
    });

    // Board click — delegated to a single listener on the <svg>.
    // The listener is attached once and never needs to be re-attached
    // because the <svg> element itself is never recreated; only the
    // circles inside it change, and only their class attributes at that.
    board.addEventListener('click', (event) => {
      handleBoardClick(event, board);
    });

    // Auto-start so the board is never blank on first load.
    startGame(select, board);
  }

  return { init };

})();


/* ================================================================
   Bootstrap
   ─────────
   DOMContentLoaded fires before game.js executes in most browsers
   when the script is at the bottom of <body>, but the listener keeps
   the code safe if the script is ever moved to <head>.
   ================================================================ */

document.addEventListener('DOMContentLoaded', UI.init);