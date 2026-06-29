/* ================================================================
   renderer.js — Sprouts v0.5

   Responsibility
   ──────────────
   Create, maintain, and update all SVG elements on the board.
   This is the only module that writes to the SVG DOM.

   Renderer reads from two sources:
     • SelectionState — which dots are currently highlighted
     • BoardView      — where each dot is on screen; edge paths

   It never reads from the engine directly and never mutates state.

   Design — retained element architecture
   ───────────────────────────────────────
   SVG circles are created once per game in initBoard() and kept
   alive in the DOM for the entire game. Only CSS classes change
   on selection updates — no elements are recreated.

   Edge lines are redrawn in full after each move via renderEdges().
   In v0.4 these will become SVG paths drawn by the player.

   Depends on: selectionState.js, boardView.js
   ================================================================ */

import SelectionState from './selectionState.js';
import BoardView from './boardView.js';

const Renderer = (() => {

  const SVG_NS     = 'http://www.w3.org/2000/svg';
  const DOT_RADIUS = 8;

  // Map<dotId, SVGCircleElement> — live circle elements, created once
  // per game and retained for the game's lifetime.
  let circleEls = new Map();

  // The <svg> board element. Set in initBoard(), used in renderEdges().
  let boardEl = null;

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Removes all SVG children and clears the element store.
   * Only called from initBoard() at game start.
   */
  function clearBoard(board) {
    while (board.firstChild) board.removeChild(board.firstChild);
    circleEls.clear();
  }

  /**
   * Returns the CSS class string for a dot based on current selection.
   * Both slots are checked so a loop move (same dot twice) is handled.
   */
  function dotClass(dotId) {
    const isFirst  = dotId === SelectionState.getFirstSelectedDotId();
    const isSecond = dotId === SelectionState.getSecondSelectedDotId();
    return (isFirst || isSecond) ? 'dot dot--selected' : 'dot';
  }

  /**
   * Applies the correct CSS class to a single circle.
   * No-ops silently if the dot isn't in the store.
   */
  function applyDotClass(dotId) {
    if (dotId === null) return;
    const el = circleEls.get(dotId);
    if (el) el.setAttribute('class', dotClass(dotId));
  }

  /**
   * Creates one <circle> for a dot and registers it.
   * Position is read from BoardView, not from the engine dot object.
   *
   * @param {SVGElement} board
   * @param {object}     dot    — engine dot { id, lives }
   * @param {number}     index  — array index for animation stagger
   */
  function createDotElement(board, dot, index) {
    const pos = BoardView.getDotPosition(dot.id);
    if (!pos) {
      console.warn(`Renderer: no position registered for dot ${dot.id}`);
      return;
    }

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r',  DOT_RADIUS);
    circle.setAttribute('class', dotClass(dot.id));
    circle.style.setProperty('--dot-index', index);
    circle.dataset.dotId = dot.id;
    board.appendChild(circle);
    circleEls.set(dot.id, circle);
  }

  /**
   * Draws a straight line between two board positions.
   * Inserted before other children so dots render on top.
   */
  function drawLine(x1, y1, x2, y2) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#4F6D5A');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('class', 'edge');
    boardEl.insertBefore(line, boardEl.firstChild);
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Initialises the board for a new game.
   * Reads dot positions from BoardView (which ui.js populates first).
   * Creates one circle per dot; these are stable for the game's lifetime.
   *
   * @param {SVGElement} board
   */
  function initBoard(board) {
    boardEl = board;
    clearBoard(board);
    // BoardView has already been populated by ui.js before this is called.
    // We iterate SelectionState.getDots() for the ordered initial list.
    SelectionState.getDots().forEach((dot, index) => createDotElement(board, dot, index));
  }

  /**
   * Draws a new dot on the board for a sprout created by a move.
   * Called by ui.js after BoardView.setDotPosition() has registered
   * the new dot's screen coordinates.
   *
   * @param {object} dot   — engine dot { id, lives }
   * @param {number} index — insertion index for animation stagger
   */
  function addDot(dot, index) {
    if (!boardEl) return;
    createDotElement(boardEl, dot, index);
  }

  /**
   * Redraws all edge lines from the current engine state.
   * Reads dot positions exclusively from BoardView.
   *
   * All existing edge lines are removed and redrawn. This is safe
   * because edges are few and edge geometry doesn't change after
   * a move is committed.
   *
   * In v0.4 this will draw SVG paths (BoardView.getEdgePath) instead
   * of straight lines.
   *
   * @param {object} engineState — current state from Engine.getState()
   */
  function renderEdges(engineState) {
    if (!boardEl) return;

    // Remove existing edge elements before redrawing.
    boardEl.querySelectorAll('.edge').forEach(el => el.remove());

    if (!engineState || !Array.isArray(engineState.edges)) return;

    engineState.edges.forEach(edge => {
      const posA = BoardView.getDotPosition(edge.a);
      const posB = BoardView.getDotPosition(edge.b);

      if (!posA || !posB) {
        console.warn(`Renderer.renderEdges: missing position for edge`, edge);
        return;
      }

      drawLine(posA.x, posA.y, posB.x, posB.y);
    });
  }

  /**
   * Updates the CSS highlight on exactly the circles that changed.
   * Receives before/after selection snapshots; touches only the union
   * of affected dot ids.
   *
   * @param {{ first: number|null, second: number|null }} prev
   * @param {{ first: number|null, second: number|null }} next
   */
  function updateSelection(prev, next) {
    const touched = new Set([prev.first, prev.second, next.first, next.second]);
    touched.delete(null);
    touched.forEach(applyDotClass);
  }

  return { initBoard, addDot, renderEdges, updateSelection };

})();

export default Renderer;
