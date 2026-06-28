/* ================================================================
   renderer.js — Sprouts v0.3.0
   
   Responsibility
   ──────────────
   Create, maintain, and update all SVG elements on the board.
   This is the only module that writes to the SVG DOM.
   
   Renderer reads from State when it needs game data, but it never
   reads from HTML controls and never sets status text.
   
   Design — retained element architecture (unchanged from v0.2.1)
   ───────────────────────────────────────────────────────────────
   SVG circles are created once per game in initBoard() and kept
   alive in the DOM for the entire game. Only CSS classes change.
   
   v0.3.0 changes
   ──────────────
   updateSelection() now accepts objects describing which dot changed
   in each slot (first / second), rather than a single previous/next
   pair. This lets both highlights be managed independently.
   
   Signature:
     updateSelection(prev, next)
       prev  { first: number|null, second: number|null }
       next  { first: number|null, second: number|null }
   
   The helper applyDotClass() centralises the class-name logic so the
   two selection slots share one code path.
   
   Depends on: state.js (State)
   Load order: after state.js.
   ================================================================ */

import State from './engine/state.js';

const Renderer = (() => {

  const SVG_NS     = 'http://www.w3.org/2000/svg';
  const DOT_RADIUS = 8;

  // Map<dotId, SVGCircleElement> — retained element store.
  let circleEls = new Map();
  let boardEl = null;

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Removes all SVG children and clears the element store.
   * @param {SVGElement} board
   */
  function clearBoard(board) {
    while (board.firstChild) board.removeChild(board.firstChild);
    circleEls.clear();
  }

  /**
   * Derives the correct CSS class string for a dot given the current
   * selection state. Both slots are checked so a dot that is selected
   * as both first and second (a loop move) receives the selected class.
   *
   * @param {number} dotId
   * @returns {string}
   */
  function dotClass(dotId) {
    const isFirst  = dotId === State.getFirstSelectedDotId();
    const isSecond = dotId === State.getSecondSelectedDotId();
    return (isFirst || isSecond) ? 'dot dot--selected' : 'dot';
  }

  /**
   * Applies the correct class to a single circle element.
   * No-ops silently if the element isn't in the store (defensive).
   *
   * @param {number|null} dotId
   */
  function applyDotClass(dotId) {
    if (dotId === null) return;
    const el = circleEls.get(dotId);
    if (el) el.setAttribute('class', dotClass(dotId));
  }

  /**
   * Creates one <circle> for a dot, appends it, registers it.
   * @param {SVGElement} board
   * @param {object}     dot
   * @param {number}     index
   */
  function createDotElement(board, dot, index) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', dot.x);
    circle.setAttribute('cy', dot.y);
    circle.setAttribute('r',  DOT_RADIUS);
    circle.setAttribute('class', dotClass(dot.id));
    circle.style.setProperty('--dot-index', index);
    circle.dataset.dotId = dot.id;
    board.appendChild(circle);
    circleEls.set(dot.id, circle);
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Initialises the board for a new game.
   * Creates one circle per dot in State; stable for the game's lifetime.
   * @param {SVGElement} board
   */
  function initBoard(board) {
    boardEl = board;
    clearBoard(board);
    State.getDots().forEach((dot, index) => createDotElement(board, dot, index));
  }

  function renderEdges(state) {
    if (!boardEl) return;
    boardEl.querySelectorAll('line.edge').forEach(line => line.remove());
    if (!state || !Array.isArray(state.edges) || !Array.isArray(state.dots)) return;

    const dotById = new Map(state.dots.map(dot => [dot.id, dot]));
    const syntheticEdges = new Map();

    function isValidDot(dot) {
      return dot
        && Number.isFinite(Number(dot.x))
        && Number.isFinite(Number(dot.y))
        && !(Number(dot.x) === 0 && Number(dot.y) === 0);
    }

    function drawLine(x1, y1, x2, y2) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', '#000');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('class', 'edge');
      boardEl.insertBefore(line, boardEl.firstChild);
    }

    state.edges.forEach(edge => {
      const fromDot = dotById.get(edge.a);
      const toDot   = dotById.get(edge.b);

      if (!fromDot || !toDot) {
        console.warn('Renderer.renderEdges: missing dot for edge, skipping', edge, { fromDot, toDot });
        return;
      }

      const x1 = Number(fromDot.x);
      const y1 = Number(fromDot.y);
      const x2 = Number(toDot.x);
      const y2 = Number(toDot.y);
      const fromValid = isValidDot(fromDot);
      const toValid = isValidDot(toDot);

      if (fromValid && toValid) {
        drawLine(x1, y1, x2, y2);
        return;
      }

      // Synthetic new dot coordinates are not set yet; render a visible line
      // between the two endpoints that share the same synthetic target id.
      if (!toValid) {
        const group = syntheticEdges.get(edge.b) || [];
        group.push(edge);
        syntheticEdges.set(edge.b, group);
        return;
      }

      console.warn('Renderer.renderEdges: invalid coordinates for edge, skipping', edge, { fromDot, toDot });
    });

    syntheticEdges.forEach((edges, syntheticId) => {
      if (edges.length !== 2) {
        console.warn('Renderer.renderEdges: unexpected synthetic edge count, skipping', syntheticId, edges);
        return;
      }

      const firstDot = dotById.get(edges[0].a);
      const secondDot = dotById.get(edges[1].a);

      if (!firstDot || !secondDot) {
        console.warn('Renderer.renderEdges: missing source dot for synthetic edge, skipping', syntheticId, { firstDot, secondDot });
        return;
      }

      const x1 = Number(firstDot.x);
      const y1 = Number(firstDot.y);
      const x2 = Number(secondDot.x);
      const y2 = Number(secondDot.y);

      if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
        console.warn('Renderer.renderEdges: invalid synthetic coordinates, skipping', syntheticId, { firstDot, secondDot });
        return;
      }

      drawLine(x1, y1, x2, y2);
    });
  }

  /**
   * Updates the visual highlight of exactly the dot ids that changed.
   *
   * The caller supplies both the previous and next selection state.
   * Only the union of changed ids is touched — typically two elements
   * per click at most.
   *
   * @param {{ first: number|null, second: number|null }} prev
   * @param {{ first: number|null, second: number|null }} next
   */
  function updateSelection(prev, next) {
    // Collect every id that appeared in either the old or new selection.
    // Using a Set de-duplicates naturally (e.g. when a dot is first AND
    // second, or when the same id appears in both prev and next).
    const touched = new Set([prev.first, prev.second, next.first, next.second]);
    touched.delete(null);   // null is not a dot id

    // Re-apply the class for each affected dot. dotClass() reads the
    // current State, which has already been mutated by the time this
    // function is called, so each dot gets the right class.
    touched.forEach(applyDotClass);
  }

  return { initBoard, renderEdges, updateSelection };

})();
export default Renderer;