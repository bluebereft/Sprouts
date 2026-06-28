/* ================================================================
   ui.js — Sprouts v0.2.3
   
   Responsibility
   ──────────────
   Own every interaction between the user and the application:
     • Reading values from the dropdown.
     • Responding to the Start Game button.
     • Handling clicks on the SVG board.
     • Writing status messages to the #status element.
   
   UI is the only module that reads HTML elements directly.
   It coordinates State and Renderer but never bypasses them:
     — game data changes go through State
     — visual changes go through Renderer
   
   All human-readable strings ("Click a dot to begin." etc.) live
   here. State and Renderer never produce UI copy.
   
   Depends on: state.js (State), renderer.js (Renderer)
   Load order: after renderer.js.
   ================================================================ */

const UI = (() => {

  // Cached DOM reference set once in init(). Kept private so nothing
  // outside UI can write to the status element directly.
  let statusEl = null;

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Writes a message to the #status element.
   *
   * @param {string} msg
   */
  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  /**
   * Handles a click anywhere on the SVG board.
   *
   * Uses event delegation — one listener on the <svg> covers all dots,
   * present and future. The clicked element is identified via the
   * data-dot-id attribute that Renderer stamps on each <circle>.
   *
   * Selection rules:
   *   • Dot clicked, nothing selected → select it.
   *   • Dot clicked, same dot selected → deselect (toggle off).
   *   • Dot clicked, different dot selected → select the new dot.
   *   • Board background clicked → do nothing.
   *
   * The previous selection id is captured before State is mutated so
   * Renderer.updateSelection() receives both the before and after ids.
   *
   * @param {MouseEvent} event
   */
  function handleBoardClick(event) {
    const dotIdAttr = event.target.dataset.dotId;

    // Clicked something that isn't a dot (board background, future curves).
    if (dotIdAttr === undefined) return;

    // Snapshot state BEFORE mutation — Renderer needs the old id.
    const previousId = State.getSelectedDotId();

    // dataset values are always strings; parse to number for comparison.
    const clickedId = parseInt(dotIdAttr, 10);

    let nextId;

    if (clickedId === previousId) {
      State.clearSelection();
      nextId = null;
      setStatus('Selection cleared.');
    } else {
      State.selectDot(clickedId);
      nextId = clickedId;
      // Ids are 0-based internally; show 1-based to the player.
      setStatus(`Dot ${clickedId + 1} selected.`);
    }

    // Only the two affected circles are touched.
    Renderer.updateSelection(previousId, nextId);
  }

  /**
   * Reads the dropdown, resets State, rebuilds the board, and resets
   * the status message. This is the full game-start sequence.
   *
   * @param {HTMLSelectElement} select — the dot-count dropdown
   * @param {SVGElement}        board  — the <svg> game board
   */
  function startGame(select, board) {
    const count  = parseInt(select.value, 10);
    const boardW = parseFloat(board.getAttribute('width'));
    const boardH = parseFloat(board.getAttribute('height'));

    State.initDots(count, boardW, boardH);
    Renderer.initBoard(board);
    setStatus('Click a dot to begin.');
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Wires up all event listeners. Called once by app.js on startup.
   * Caches DOM element references; runs the initial game automatically
   * so the board is never blank on first load.
   */
  function init() {
    const startBtn = document.getElementById('start-btn');
    const select   = document.getElementById('dot-count');
    const board    = document.getElementById('board');
    statusEl       = document.getElementById('status');

    if (!startBtn || !select || !board || !statusEl) {
      console.error('Sprouts: required DOM elements are missing.');
      return;
    }

    startBtn.addEventListener('click', () => startGame(select, board));

    // Single delegated listener on the <svg>. Because the <svg> itself
    // is never replaced, this listener remains valid across game resets.
    board.addEventListener('click', handleBoardClick);

    // Kick off the first game immediately.
    startGame(select, board);
  }

  return { init };

})();