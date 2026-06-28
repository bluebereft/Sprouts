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
   
   Depends on: state.js (State), renderer.js (Renderer)
   Load order: after renderer.js.
   ================================================================ */

import { createMove } from './engine/move.js';
import Engine from './engine/engine.js';
import State from './engine/state.js';
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
    const ready = State.getFirstSelectedDotId()  !== null
               && State.getSecondSelectedDotId() !== null;
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
    const prevFirst  = State.getFirstSelectedDotId();
    const prevSecond = State.getSecondSelectedDotId();

        if (prevFirst === null) {
        State.selectFirst(clickedId);
        setStatus('Select second endpoint.');

        } else if (clickedId === prevFirst) {
        if (prevSecond !== null) {
            State.promoteSecondToFirst();
            setStatus('Select second endpoint.');
        } else {
            State.clearFirst();
            setStatus('Select first endpoint.');
        }

        } else if (prevSecond === null) {
        State.selectSecond(clickedId);
        setStatus('Ready to create move.');

        } else if (clickedId === prevSecond) {
        State.clearSecond();
        setStatus('Select second endpoint.');

        } else {
        State.selectSecond(clickedId);
        setStatus('Ready to create move.');
        }

    // ── Renderer sync ────────────────────────────────────────────
    Renderer.updateSelection(
      { first: prevFirst,                   second: prevSecond },
      { first: State.getFirstSelectedDotId(), second: State.getSecondSelectedDotId() }
    );

    syncCreateMoveButton();
  }

  // ── Create Move handler ────────────────────────────────────────

    /**
     * Commits the current two-endpoint selection as a Move,
     * applies it to the engine, then updates UI.
     */
    function handleCreateMove() {
    if (State.getFirstSelectedDotId() === null) return;
    if (State.getSecondSelectedDotId() === null) return;

    // ── 1. Capture selection ───────────────────────────────
    const a = State.getFirstSelectedDotId();
    const b = State.getSecondSelectedDotId();

    const prevFirst = a;
    const prevSecond = b;

    // ── 2. Create MOVE (engine domain object) ──────────────
    const move = createMove(a, b);

    // ── 3. Apply ENGINE transition (single source of truth) ─
    const state = Engine.apply(move);
    Renderer.renderEdges(state);
    State.clearSelections();   // missing piece
    
    // ── 4. Clear UI selection visuals ───────────────────────
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

    State.initDots(count, boardW, boardH);

    Renderer.initBoard(board);

    /**
     * Engine is initialized ONCE per game start.
     * UI state is used only as initial snapshot.
     */
    Engine.init({
        dots: State.getDots(),
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
