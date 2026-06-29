/* ================================================================
   renderer.js — Sprouts v0.6.1

   Responsibility
   ──────────────
   Create, maintain, and update all SVG elements on the board.
   This is the only module that writes to the SVG DOM.

   Renderer reads from three sources:
     • SelectionState    — which dots are highlighted
     • BoardView         — dot positions and edge paths
     • engine/rules.js   — playerForMove(), to derive edge colours

   Player ownership is derived from move index via the engine rules,
   not stored in BoardView. This keeps game knowledge in the engine
   and visual data in BoardView, with no overlap.

   It never mutates game state and never reads HTML controls.

   Depends on: selectionState.js, boardView.js, engine/rules.js
   ================================================================ */

import SelectionState from './selectionState.js';
import BoardView from './boardView.js';
import { playerForMove } from './engine/rules.js';

const Renderer = (() => {

  const SVG_NS     = 'http://www.w3.org/2000/svg';
  const DOT_RADIUS = 8;

  // Map<dotId, SVGCircleElement> — retained for the game's lifetime.
  let circleEls = new Map();

  // The <svg> board element. Set in initBoard(), used thereafter.
  let boardEl = null;

  // ── Private helpers ────────────────────────────────────────────

  function clearBoard(board) {
    while (board.firstChild) board.removeChild(board.firstChild);
    circleEls.clear();
  }

  /**
   * Computes the full CSS class string for a dot.
   * Selection overrides exhaustion visually — a selected exhausted
   * dot shows the selection ring, which is a UI affordance edge case
   * that will disappear once the lives guard blocks the click.
   *
   * @param {number}  dotId
   * @param {boolean} isExhausted
   */
  function dotClass(dotId, isExhausted = false) {
    const isFirst  = dotId === SelectionState.getFirstSelectedDotId();
    const isSecond = dotId === SelectionState.getSecondSelectedDotId();
    if (isFirst || isSecond) return 'dot dot--selected';
    if (isExhausted)         return 'dot dot--exhausted';
    return 'dot';
  }

  function applyDotClass(dotId, isExhausted = false) {
    if (dotId === null) return;
    const el = circleEls.get(dotId);
    if (el) el.setAttribute('class', dotClass(dotId, isExhausted));
  }

  /**
   * Creates one <circle> for a dot and registers it.
   * Position is read from BoardView.
   * player is passed explicitly — null for initial dots (neutral).
   *
   * @param {SVGElement}  board
   * @param {object}      dot     — engine dot { id, lives }
   * @param {number}      index   — array index for animation stagger
   * @param {0|1|null}    player  — null for initial dots
   */
  function createDotElement(board, dot, index, player = null) {
    const pos = BoardView.getDotPosition(dot.id);
    if (!pos) {
      console.warn(`Renderer: no position registered for dot ${dot.id}`);
      return;
    }

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r',  DOT_RADIUS);
    circle.setAttribute('class', dotClass(dot.id, dot.lives === 0));
    circle.style.setProperty('--dot-index', index);
    circle.dataset.dotId = dot.id;

    // data-player drives CSS colour rules. Absent on neutral initial dots.
    if (player !== null) circle.dataset.player = player;

    board.appendChild(circle);
    circleEls.set(dot.id, circle);
  }

  /**
   * Draws a straight line edge, stamped with data-player for CSS colouring.
   * Inserted before other children so dots always render on top.
   *
   * @param {number}   x1, y1, x2, y2
   * @param {0|1|null} player
   */
  function drawLine(x1, y1, x2, y2, player) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('class', 'edge');
    if (player !== null) line.dataset.player = player;
    boardEl.insertBefore(line, boardEl.firstChild);
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Initialises the board for a new game.
   * ui.js populates BoardView before calling this.
   */
  function initBoard(board) {
    boardEl = board;
    clearBoard(board);
    SelectionState.getDots().forEach((dot, index) => createDotElement(board, dot, index));
  }

  /**
   * Draws a newly created sprout dot.
   * Called by ui.js after BoardView.setDotPosition() has been set.
   * player is derived by ui.js via playerForMove() and passed here.
   *
   * @param {object}   dot    — engine dot { id, lives }
   * @param {number}   index  — for animation stagger
   * @param {0|1|null} player — the player who made this move
   */
  function addDot(dot, index, player) {
    if (!boardEl) return;
    createDotElement(boardEl, dot, index, player);
  }

  /**
   * Redraws all edge lines from current engine state.
   * Reads positions from BoardView.
   * Derives player for each edge from move index via playerForMove().
   *
   * Each move produces exactly 2 edges, so:
   *   moveIndex = Math.floor(edgeIndex / 2)
   *
   * @param {object} engineState
   */
  function renderEdges(engineState) {
    if (!boardEl) return;
    boardEl.querySelectorAll('.edge').forEach(el => el.remove());
    if (!engineState || !Array.isArray(engineState.edges)) return;

    engineState.edges.forEach((edge, edgeIndex) => {
      const posA = BoardView.getDotPosition(edge.a);
      const posB = BoardView.getDotPosition(edge.b);

      if (!posA || !posB) {
        console.warn(`Renderer.renderEdges: missing position for edge`, edge);
        return;
      }

      // Derive the player who made this move from the move index.
      // playerForMove is a pure engine rule — the renderer consumes
      // it but does not own it.
      const moveIndex = Math.floor(edgeIndex / 2);
      const player    = playerForMove(moveIndex);

      drawLine(posA.x, posA.y, posB.x, posB.y, player);
    });
  }

  /**
   * Syncs dot appearance after a move — applies exhausted class to
   * any dot whose lives have reached 0 without recreating elements.
   *
   * @param {object} engineState
   */
  function syncDotStates(engineState) {
    if (!engineState || !Array.isArray(engineState.dots)) return;
    engineState.dots.forEach(dot => {
      applyDotClass(dot.id, dot.lives === 0);
    });
  }

  /**
   * Updates selection highlight on only the changed circles.
   *
   * @param {{ first: number|null, second: number|null }} prev
   * @param {{ first: number|null, second: number|null }} next
   */
  function updateSelection(prev, next) {
    const touched = new Set([prev.first, prev.second, next.first, next.second]);
    touched.delete(null);
    // Re-derive exhausted state from the circleEl's existing class.
    // A dot is exhausted if it already has dot--exhausted; selection
    // temporarily overrides it visually but does not remove the state.
    touched.forEach(id => {
      const el = circleEls.get(id);
      if (!el) return;
      const wasExhausted = el.getAttribute('class').includes('dot--exhausted');
      applyDotClass(id, wasExhausted);
    });
  }

  return { initBoard, addDot, renderEdges, syncDotStates, updateSelection };

})();

export default Renderer;
