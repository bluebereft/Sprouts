/* ================================================================
   game.js — Sprouts v0.2
   
   Architecture
   ─────────────
   This file is divided into three clearly labelled sections:
   
     STATE    — the single source of truth for game data.
               v0.2 adds: selectedDotId — which dot (if any) is selected.
   
     RENDERER — pure drawing functions that read STATE and write SVG.
               v0.2 adds: applies/removes the .dot--selected CSS class.
   
     UI       — wires up HTML controls and calls into STATE / RENDERER.
               v0.2 adds: click handler on the board, setStatus helper.
   
   Nothing in RENDERER touches the DOM outside the SVG board.
   Nothing in STATE knows about SVG or HTML.
   UI is the only layer that reads HTML elements directly.
   ================================================================ */


/* ================================================================
   STATE
   ─────
   Holds the current game data.
   
   Each dot: { id: number, x: number, y: number, lives: number }
   
   v0.2 addition
   ─────────────
   selectedDotId tracks which dot is currently selected (null = none).
   UI never sets this directly — it calls the two selection helpers
   so that future logic (e.g. "can this dot be selected?") lives here.
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
    dots         = [];
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
   
   v0.2 addition
   ─────────────
   drawDot now checks State.getSelectedDotId() and adds the CSS class
   "dot--selected" to the matching circle. The class is defined in
   style.css, keeping all visual decisions out of this file.
   ================================================================ */

const Renderer = (() => {

  const SVG_NS    = 'http://www.w3.org/2000/svg';
  const DOT_RADIUS = 8;

  /**
   * Removes all child elements from the board SVG.
   *
   * @param {SVGElement} board
   */
  function clearBoard(board) {
    while (board.firstChild) {
      board.removeChild(board.firstChild);
    }
  }

  /**
   * Draws one dot as an SVG <circle>.
   * Adds "dot--selected" if this dot's id matches the current selection.
   *
   * @param {SVGElement} board
   * @param {object}     dot   — dot object from State.getDots()
   * @param {number}     index — array position (used for animation stagger)
   */
  function drawDot(board, dot, index) {
    const circle = document.createElementNS(SVG_NS, 'circle');

    circle.setAttribute('cx', dot.x);
    circle.setAttribute('cy', dot.y);
    circle.setAttribute('r',  DOT_RADIUS);

    // Build the class string. The selected dot gets an extra class;
    // everything else is a plain dot.
    const isSelected = (dot.id === State.getSelectedDotId());
    circle.setAttribute('class', isSelected ? 'dot dot--selected' : 'dot');

    // Stagger the appear animation via a CSS custom property.
    circle.style.setProperty('--dot-index', index);

    // Store the dot id so the UI click handler can identify which dot
    // was clicked without inspecting coordinates.
    circle.dataset.dotId = dot.id;

    board.appendChild(circle);
  }

  /**
   * Full redraw: clears the board then draws every dot.
   * Called after any state change that affects what's on screen.
   *
   * @param {SVGElement} board
   */
  function render(board) {
    clearBoard(board);
    State.getDots().forEach((dot, index) => drawDot(board, dot, index));
  }

  return { render };

})();


/* ================================================================
   UI
   ──
   Binds HTML controls to State + Renderer.
   
   v0.2 additions
   ──────────────
   setStatus(msg) — writes text to the #status element.
   Board click handler — interprets clicks on dots, updates State,
     triggers a Renderer.render(), then updates the status message.
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
   * After every state change, the board is redrawn and status updated.
   *
   * @param {MouseEvent} event
   * @param {SVGElement} board
   */
  function handleBoardClick(event, board) {
    // data-dot-id is set by the renderer on every <circle>.
    // If the click landed on something else (board background, future
    // curves, etc.) dotIdAttr will be undefined — we ignore it.
    const dotIdAttr = event.target.dataset.dotId;

    if (dotIdAttr === undefined) {
      // Clicked empty space — no change.
      return;
    }

    // dataset values are always strings; convert to number for comparison.
    const clickedId     = parseInt(dotIdAttr, 10);
    const previouslySelected = State.getSelectedDotId();

    if (clickedId === previouslySelected) {
      // Clicking the already-selected dot toggles it off.
      State.clearSelection();
      setStatus('Selection cleared.');
    } else {
      // Clicking any other dot selects it (replacing any prior selection).
      State.selectDot(clickedId);
      // Dot ids are 0-based internally; display as 1-based for readability.
      setStatus(`Dot ${clickedId + 1} selected.`);
    }

    // Always redraw after a state change so the highlight moves correctly.
    Renderer.render(board);
  }

  /**
   * Starts a fresh game:
   * 1. Resets State (dots + selection).
   * 2. Redraws board.
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
    Renderer.render(board);
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
    // Using one listener (rather than one per dot) means it keeps
    // working after every render() call replaces the circle elements.
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