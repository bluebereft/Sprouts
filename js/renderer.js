/* ================================================================
   renderer.js — Sprouts v0.2.3
   
   Responsibility
   ──────────────
   Create, maintain, and update all SVG elements on the board.
   This is the only module that writes to the SVG DOM.
   
   Renderer reads from State when it needs game data, but it never
   reads from HTML controls and never sets status text. Those are
   UI's concerns.
   
   Design — retained element architecture
   ───────────────────────────────────────
   SVG circles are created once per game (in initBoard) and kept
   alive in the DOM for the entire game. When the selection changes,
   only the two affected circles have their CSS class updated.
   No elements are destroyed or re-created on selection changes.
   
   This avoids the dot-appear animation re-firing on every click and
   eliminates unnecessary DOM churn.
   
   circleEls: Map<dotId, SVGCircleElement>
      The retained element store. Populated by initBoard(), read by
      updateSelection(). Cleared at the start of each initBoard() call
      so stale references from a previous game never linger.
   
   Depends on: state.js (State)
   Load order: after state.js.
   ================================================================ */

const Renderer = (() => {

  // Required namespace for creating valid SVG elements.
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Dot radius in SVG user units. Diameter = DOT_RADIUS * 2.
  const DOT_RADIUS = 8;

  // ── Retained element store ─────────────────────────────────────
  // Map<number, SVGCircleElement>: dot id → its live <circle> element.
  // Gives O(1) lookup when patching selection without iterating the DOM.
  let circleEls = new Map();

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Removes all child nodes from the board SVG and clears circleEls.
   * Only ever called from initBoard() at the start of a new game.
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
   * Creates one <circle> SVG element for a dot, appends it to the
   * board, and registers it in circleEls.
   *
   * Sets the correct class immediately in case State already holds a
   * selection when initBoard() is called (defensive; unlikely in
   * current usage but correct by design).
   *
   * @param {SVGElement} board
   * @param {object}     dot   — Dot object from State.getDots()
   * @param {number}     index — position in dots array (animation stagger)
   */
  function createDotElement(board, dot, index) {
    const circle = document.createElementNS(SVG_NS, 'circle');

    circle.setAttribute('cx', dot.x);
    circle.setAttribute('cy', dot.y);
    circle.setAttribute('r',  DOT_RADIUS);

    const isSelected = (dot.id === State.getSelectedDotId());
    circle.setAttribute('class', isSelected ? 'dot dot--selected' : 'dot');

    // CSS custom property drives the staggered appear animation.
    circle.style.setProperty('--dot-index', index);

    // data-dot-id is read by the UI click handler to identify which
    // dot was clicked, without the UI needing to inspect coordinates.
    circle.dataset.dotId = dot.id;

    board.appendChild(circle);
    circleEls.set(dot.id, circle);
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Initialises the board for a new game.
   * Clears all existing SVG content, then creates one <circle> per dot
   * currently in State. After this call, circles are stable in the DOM
   * for the rest of the game — only updateSelection() modifies them.
   *
   * Call once per game start, after State.initDots().
   *
   * @param {SVGElement} board — the <svg> element that is the game board
   */
  function initBoard(board) {
    clearBoard(board);
    State.getDots().forEach((dot, index) => createDotElement(board, dot, index));
  }

  /**
   * Updates the visual selection state of exactly the two circles
   * that changed. No other DOM nodes are touched.
   *
   * Call after State.selectDot() or State.clearSelection(), passing
   * the ids from before and after the state mutation.
   *
   * @param {number|null} previousId — dot that lost selection (null = none)
   * @param {number|null} nextId     — dot that gained selection (null = none)
   */
  function updateSelection(previousId, nextId) {
    if (previousId !== null) {
      const prev = circleEls.get(previousId);
      if (prev) prev.setAttribute('class', 'dot');
    }

    if (nextId !== null) {
      const next = circleEls.get(nextId);
      if (next) next.setAttribute('class', 'dot dot--selected');
    }
  }

  return { initBoard, updateSelection };

})();