/* ================================================================
   renderer.js — Sprouts v0.8

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

   v0.7 changes
   ────────────
   Edges are now drawn as SVG <path> elements built from a point
   array, not straight <line> elements. Two new entry points support
   the drawing interaction in ui.js:

     showDraftPath(points)  — live preview while the player is
                               dragging; called on every pointermove.
     clearDraftPath()       — removes the preview, called when a draw
                               is committed, rejected, or cancelled.

   pathMidpoint(points) is exported as a pure helper so ui.js can
   place the new sprout dot at the correct point along the curve
   (arc-length midpoint) rather than the straight-line midpoint
   between the two original endpoints.

   Depends on: selectionState.js, boardView.js, engine/rules.js,
               constants.js
   ================================================================ */

import SelectionState from './selectionState.js';
import BoardView from './boardView.js';
import { playerForMove, isExhausted } from './engine/rules.js';
import { DOT_RADIUS } from './constants.js';

const Renderer = (() => {

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Map<dotId, SVGCircleElement> — retained for the game's lifetime.
  let circleEls = new Map();

  // The <svg> board element. Set in initBoard(), used thereafter.
  let boardEl = null;

  // The live in-progress draft path element, while the player is
  // dragging. null when no draw is in progress.
  let draftPathEl = null;

  // ── Private helpers ────────────────────────────────────────────

  function clearBoard(board) {
    while (board.firstChild) board.removeChild(board.firstChild);
    circleEls.clear();
    draftPathEl = null;
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
    circle.setAttribute('class', dotClass(dot.id, isExhausted(dot)));
    circle.style.setProperty('--dot-index', index);
    circle.dataset.dotId = dot.id;

    // data-player drives CSS colour rules. Absent on neutral initial dots.
    if (player !== null) circle.dataset.player = player;

    board.appendChild(circle);
    circleEls.set(dot.id, circle);
  }

  /**
   * Converts an array of {x, y} points into a smooth SVG path "d"
   * string using cubic Bezier curves (Catmull-Rom spline converted
   * to Bezier control points), rather than straight line segments.
   *
   * This is what makes drawn curves look like hand-drawn ink rather
   * than a jagged sequence of straight segments. With only 1–2
   * points, falls back to a straight line since a curve needs at
   * least 2 segments worth of neighbouring points to interpolate.
   *
   * @param {Array<{x:number, y:number}>} points
   * @returns {string}
   */
  function pointsToPathData(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    // Catmull-Rom to cubic Bezier conversion. For each segment
    // between points[i] and points[i+1], control points are derived
    // from the surrounding points so the curve passes through every
    // original point smoothly, with continuous tangents.
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      // Clamp neighbour lookups at the array boundaries by reusing
      // the nearest endpoint — standard Catmull-Rom boundary handling.
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;

      // Standard Catmull-Rom → Bezier control point formula
      // (tension factor 6 is the conventional choice for this form).
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return d;
  }

  /**
   * Draws a committed edge as an SVG <path>, stamped with data-player.
   * Inserted before other children so dots always render on top.
   *
   * @param {Array<{x:number, y:number}>} points
   * @param {0|1|null} player
   */
  function drawPath(points, player) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pointsToPathData(points));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('class', 'edge');
    if (player !== null) path.dataset.player = player;
    boardEl.insertBefore(path, boardEl.firstChild);
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
   * Shows or updates a live preview of the path currently being drawn.
   * Called on every pointermove while the player is dragging.
   * Creates the preview element on first call, then just updates its
   * "d" attribute on subsequent calls — no element churn per frame.
   *
   * @param {Array<{x:number, y:number}>} points — raw, unsimplified
   */
  function showDraftPath(points) {
    if (!boardEl || !points || points.length === 0) return;

    if (!draftPathEl) {
      draftPathEl = document.createElementNS(SVG_NS, 'path');
      draftPathEl.setAttribute('fill', 'none');
      draftPathEl.setAttribute('stroke-width', '2');
      draftPathEl.setAttribute('stroke-linecap', 'round');
      draftPathEl.setAttribute('stroke-linejoin', 'round');
      draftPathEl.setAttribute('class', 'edge edge--draft');
      boardEl.insertBefore(draftPathEl, boardEl.firstChild);
    }

    draftPathEl.setAttribute('d', pointsToPathData(points));
  }

  /**
   * Removes the live draft path preview, if one exists.
   * Called when a draw is committed, rejected, or cancelled.
   */
  function clearDraftPath() {
    if (draftPathEl) {
      draftPathEl.remove();
      draftPathEl = null;
    }
  }

  /**
   * Redraws all edges from current engine state, reading each edge's
   * path from BoardView. Falls back to a straight line between the
   * two dot positions if no path was recorded (defensive; should not
   * occur once drawing is fully wired through ui.js).
   *
   * Derives player for each edge from move index via playerForMove().
   * Each move produces exactly 2 edges, so:
   *   moveIndex = Math.floor(edgeIndex / 2)
   *
   * @param {object} engineState
   */
  function renderEdges(engineState) {
    if (!boardEl) return;
    boardEl.querySelectorAll('.edge:not(.edge--draft)').forEach(el => el.remove());
    if (!engineState || !Array.isArray(engineState.edges)) return;

    engineState.edges.forEach((edge, edgeIndex) => {
      const moveIndex = Math.floor(edgeIndex / 2);
      const player    = playerForMove(moveIndex);
      const path      = BoardView.getEdgePath(moveIndex);

      if (path) {
        // The same drawn path is shared by both of a move's two edges
        // (start→sprout and sprout→end), since the path is the full
        // curve from start to end with the sprout sitting on it.
        // Each edge half of the path is rendered once per moveIndex;
        // only draw it on the first edge of the pair to avoid
        // drawing the same curve twice.
        if (edgeIndex % 2 === 0) {
          drawPath(path, player);
        }
        return;
      }

      // Fallback: no recorded path (shouldn't happen post-v0.7).
      const posA = BoardView.getDotPosition(edge.a);
      const posB = BoardView.getDotPosition(edge.b);
      if (!posA || !posB) {
        console.warn(`Renderer.renderEdges: missing position for edge`, edge);
        return;
      }
      drawPath([posA, posB], player);
    });
  }

  /**
   * Syncs dot appearance after a move — applies exhausted class to
   * any dot with no lives remaining, without recreating elements.
   * Calls engine/rules.js's isExhausted() rather than checking
   * dot.lives inline, so there is exactly one definition of
   * exhaustion anywhere in the codebase.
   *
   * @param {object} engineState
   */
  function syncDotStates(engineState) {
    if (!engineState || !Array.isArray(engineState.dots)) return;
    engineState.dots.forEach(dot => {
      applyDotClass(dot.id, isExhausted(dot));
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
    touched.forEach(id => {
      const el = circleEls.get(id);
      if (!el) return;
      const wasExhausted = el.getAttribute('class').includes('dot--exhausted');
      applyDotClass(id, wasExhausted);
    });
  }

  return {
    initBoard,
    addDot,
    showDraftPath,
    clearDraftPath,
    renderEdges,
    syncDotStates,
    updateSelection,
  };

})();

/**
 * Computes the point at the midpoint of a polyline by arc length
 * (not the straight-line midpoint between its first and last points).
 * Exported standalone so ui.js can use it when placing a new sprout
 * dot on a freshly-drawn curve.
 *
 * @param {Array<{x:number, y:number}>} points
 * @returns {{x:number, y:number}}
 */
export function pathMidpoint(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  // Compute cumulative segment lengths.
  const segmentLengths = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);
    segmentLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return points[0];

  // Walk segments until we reach half the total arc length.
  const halfLength = totalLength / 2;
  let accumulated = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    if (accumulated + segLen >= halfLength) {
      const remaining = halfLength - accumulated;
      const t = segLen === 0 ? 0 : remaining / segLen;
      const p1 = points[i];
      const p2 = points[i + 1];
      return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      };
    }
    accumulated += segLen;
  }

  // Fallback (shouldn't be reached): last point.
  return points[points.length - 1];
}

export default Renderer;
