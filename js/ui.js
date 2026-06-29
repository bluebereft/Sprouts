/* ================================================================
   ui.js — Sprouts v0.3.0
   
   Responsibility
   ──────────────
   Own every interaction between the user and the application:
     • Reading values from the dropdown.
     • Responding to the Start Game button.
     • Handling clicks on the SVG board.
     • Showing / hiding the Create Move button.
     • Writing status messages to the #status element.
     • Updating the debug move list below the board.
   
   UI is the only module that reads HTML elements directly.
   All human-readable strings live here.
   
   v0.3.0 click logic
   ───────────────────
   State tracks two independent endpoint slots: first and second.
   
   When the board is clicked:
     • Nothing selected           → set as first.  Show "Select second endpoint."
     • First set, click same dot  → clear first.   Show "Select first endpoint."
     • First set, click new dot   → set as second. Show "Ready to create move."
     • Second set, click same dot → clear second.  Show "Select second endpoint."
     • Second set, click first dot → clear first (and second). Show "Select first endpoint."
     • Both set, click any dot    → handled as above (second or first clear).
   
   The Create Move button appears only when both endpoints are set.
   
   Depends on: selectionState.js, boardView.js, renderer.js, engine/
   ================================================================ */

import { createMove } from './engine/move.js';
import Engine from './engine/engine.js';
import SelectionState from './selectionState.js';
import BoardView from './boardView.js';
import Renderer from './renderer.js';

const UI = (() => {

  // ── Cached element references (set in init) ────────────────────
  let statusEl      = null;
  let createMoveBtn = null;
  let moveListEl    = null;

  // ── Status helpers ─────────────────────────────────────────────

  /**
   * @param {string} msg
   */
  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  /**
   * Shows or hides the Create Move button depending on whether both
   * endpoint slots are filled.
   */
  function syncCreateMoveButton() {
    const ready = SelectionState.getFirstSelectedDotId()  !== null
               && SelectionState.getSecondSelectedDotId() !== null;
    // Toggle a CSS class rather than display:none so the button
    // occupies no layout space when hidden (btn--hidden uses display:none).
    createMoveBtn.classList.toggle('btn--hidden', !ready);
  }

  // ── Move list (debug view) ─────────────────────────────────────

  /**
   * Rebuilds the move list element from State.getMoves().
   * Called after every commitMove() and after game reset.
   */
  function renderMoveList() {
    const moves = Engine.getState().moves ?? [];

    if (moves.length === 0) {
      moveListEl.innerHTML = '<p class="move-list__empty">No moves yet.</p>';
      return;
    }

    // Build an ordered list. Dot ids are 0-based internally; display 1-based.
    const items = moves.map((move, index) => {
      const from = move.startDotId + 1;
      const to   = move.endDotId   + 1;
      return `<li class="move-list__item">${index + 1}. Dot ${from} → Dot ${to}</li>`;
    });

    moveListEl.innerHTML = `<ol class="move-list__ol">${items.join('')}</ol>`;
  }

  // ── Board click handler ────────────────────────────────────────

  /**
   * Central handler for all clicks on the SVG board.
   *
   * Captures both selection slots before mutating State so that
   * Renderer.updateSelection() receives an accurate before/after diff.
   */
  function handleBoardClick(event) {
    const dotIdAttr = event.target.dataset.dotId;
    if (dotIdAttr === undefined) return;   // clicked empty board space

    const clickedId = parseInt(dotIdAttr, 10);

    // Snapshot current state before any mutation.
    const prevFirst  = SelectionState.getFirstSelectedDotId();
    const prevSecond = SelectionState.getSecondSelectedDotId();

        if (prevFirst === null) {
        SelectionState.selectFirst(clickedId);
        setStatus('Select second endpoint.');

        } else if (clickedId === prevFirst) {
        if (prevSecond !== null) {
            SelectionState.promoteSecondToFirst();
            setStatus('Select second endpoint.');
        } else {
            SelectionState.clearFirst();
            setStatus('Select first endpoint.');
        }

        } else if (prevSecond === null) {
        SelectionState.selectSecond(clickedId);
        setStatus('Ready to create move.');

        } else if (clickedId === prevSecond) {
        SelectionState.clearSecond();
        setStatus('Select second endpoint.');

        } else {
        SelectionState.selectSecond(clickedId);
        setStatus('Ready to create move.');
        }

    // ── Renderer sync ────────────────────────────────────────────
    Renderer.updateSelection(
      { first: prevFirst,                   second: prevSecond },
      { first: SelectionState.getFirstSelectedDotId(), second: SelectionState.getSecondSelectedDotId() }
    );

    syncCreateMoveButton();
  }

  // ── Create Move handler ────────────────────────────────────────

    /**
     * Commits the current two-endpoint selection as a Move,
     * applies it to the engine, then updates UI.
     */
    function handleCreateMove() {
    if (SelectionState.getFirstSelectedDotId() === null) return;
    if (SelectionState.getSecondSelectedDotId() === null) return;

    // ── 1. Capture selection ───────────────────────────────
    const a = SelectionState.getFirstSelectedDotId();
    const b = SelectionState.getSecondSelectedDotId();

    const prevFirst = a;
    const prevSecond = b;

    // ── 2. Create move (engine domain object) ─────────────
    const move = createMove(a, b);

    // ── 3. Compute new sprout position ─────────────────────
    // Temporary placeholder: midpoint between the two endpoints.
    // In v0.4 this will be replaced by a point on the player-drawn
    // curve path. BoardView stores it; the engine never sees it.
    const posA = BoardView.getDotPosition(a);
    const posB = BoardView.getDotPosition(b);
    const midX = (posA.x + posB.x) / 2;
    const midY = (posA.y + posB.y) / 2;

    // ── 4. Apply engine transition ─────────────────────────
    const engineState = Engine.apply(move);

    // ── 5. Register new dot position in BoardView ──────────
    // The engine assigned the new dot id as (nextDotId - 1) after
    // incrementing. Read it back from the returned state.
    const newDot = engineState.dots[engineState.dots.length - 1];
    BoardView.setDotPosition(newDot.id, midX, midY);

    // ── 6. Draw the new dot and edges ──────────────────────
    Renderer.addDot(newDot, engineState.dots.length - 1);
    Renderer.renderEdges(engineState);
    SelectionState.clearSelections();

    // ── 7. Clear UI selection visuals ──────────────────────
    Renderer.updateSelection(
        { first: prevFirst, second: prevSecond },
        { first: null, second: null }
    );

    syncCreateMoveButton();
    setStatus('Move created. Select first endpoint.');
    renderMoveList();
    }

  // ── Game start ─────────────────────────────────────────────────

  /**
   * @param {HTMLSelectElement} select
   * @param {SVGElement}        board
   */
    function startGame(select, board) {
    const count  = parseInt(select.value, 10);
    const boardW = parseFloat(board.getAttribute('width'));
    const boardH = parseFloat(board.getAttribute('height'));

    SelectionState.initDots(count, boardW, boardH);

    // Reset the board's visual state and register initial dot positions.
    // BoardView must be populated before Renderer.initBoard() is called,
    // because the renderer reads positions from BoardView, not the engine.
    BoardView.reset();
    SelectionState.getDots().forEach(dot => {
      BoardView.setDotPosition(dot.id, dot.x, dot.y);
    });

    Renderer.initBoard(board);

    Engine.init({
        dots: SelectionState.getDots().map(({ id, lives }) => ({ id, lives })),
        edges: [],
        nextDotId: count,
        moves: []
    });

    syncCreateMoveButton();
    setStatus('Select first endpoint.');
    renderMoveList();
    }

  // ── Init ───────────────────────────────────────────────────────

  /**
   * Wires up all event listeners. Called once by app.js on startup.
   */
  function init() {
    const startBtn = document.getElementById('start-btn');
    const select   = document.getElementById('dot-count');
    const board    = document.getElementById('board');
    statusEl       = document.getElementById('status');
    createMoveBtn  = document.getElementById('create-move-btn');
    moveListEl     = document.getElementById('move-list');

    if (!startBtn || !select || !board || !statusEl || !createMoveBtn || !moveListEl) {
      console.error('Sprouts: required DOM elements are missing.');
      return;
    }

    startBtn.addEventListener('click', () => startGame(select, board));
    board.addEventListener('click', handleBoardClick);
    createMoveBtn.addEventListener('click', handleCreateMove);

    startGame(select, board);
  }

  return {
    init
  };

})();

export function init() {
  return UI.init();
}
