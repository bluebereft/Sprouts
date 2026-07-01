/* ================================================================
   drawInteraction.js — Sprouts v0.7

   Responsibility
   ──────────────
   Owns the pointer-driven freehand drawing gesture: sampling raw
   points on drag, simplifying the path, validating it (crossing
   detection, endpoint distance, self-intersection), and reporting
   the result to ui.js via callbacks.

   This module handles gesture mechanics and path validation only.
   It does NOT:
     • modify game state (engine, selectionState)
     • update status text or turn indicators
     • commit moves to the engine
     • know about game rules beyond crossing detection

   ui.js wires this module up during init and supplies three callbacks:
     onMoveDrawn(path, a, b) — called when a valid drawn path is accepted
     onReject(message)       — called when a drawn path fails validation
     onTap(dotId)            — called when a tap (not a drag) lands on
                                a dot; ui.js runs selection/deselection
                                logic in response

   Gesture logic (movement-based tap vs drag)
   ──────────────────────────────────────────
   This module owns ALL pointer/tap interpretation on the board —
   both taps (dot selection/deselection) and drags (curve drawing).
   It does not rely on the browser's native 'click' event.

   An earlier version left tap handling to the browser: sampling
   would begin on pointerdown, and if the gesture turned out to be a
   short tap, the sample was discarded and the subsequent 'click'
   event was left to fire ui.js's selection logic. This broke once
   setPointerCapture was in play — capturing the pointer redirects
   the browser's hit-testing for the following 'click' event to the
   capturing element (the board), not the dot actually tapped, so
   event.target.dataset.dotId came back undefined and selection
   silently did nothing. Releasing capture before deciding tap vs
   drag did not reliably fix this across browsers, so native click
   is no longer used for game logic at all.

   Sampling always starts on pointerdown, and the dot (if any) under
   the pointerdown is recorded. On pointerup:
     • if net movement < DRAG_THRESHOLD: this was a tap. If the
       pointerdown landed on a dot, callbacks.onTap(dotId) is called
       so ui.js can run selection/deselection logic directly — no
       dependency on the browser's click event.
     • otherwise: this was a drag. If both endpoints are selected,
       the full simplify → validate → commit-or-reject pipeline runs.
       If not, the drag is meaningless in this context and is
       silently discarded.

   Depends on: selectionState.js, boardView.js, renderer.js,
               engine/engine.js, pathSimplify.js, crossingDetection.js,
               constants.js
   ================================================================ */

import SelectionState from './selectionState.js';
import BoardView from './boardView.js';
import Renderer from './renderer.js';
import Engine from './engine/engine.js';
import { simplifyPath } from './pathSimplify.js';
import { crossesAny, pathSelfIntersects, trimNearPoints } from './crossingDetection.js';
import { DOT_CAPTURE_RADIUS, DOT_EXCLUSION_RADIUS } from './constants.js';

// ── Configuration ────────────────────────────────────────────────

// Minimum net pointer movement (SVG user units) for a gesture to
// count as a draw rather than a tap.
const DRAG_THRESHOLD = 6;

// Minimum raw sample points before a draw is considered for commit.
const MIN_DRAW_POINTS = 3;

// ── Module state ─────────────────────────────────────────────────

let boardEl        = null;   // the <svg> board element
let drawingPoints  = null;   // raw sampled points, or null when idle
let drawStartDotId = null;   // which endpoint the gesture started near
                              // (only meaningful when both endpoints
                              // are selected; null otherwise)
let pointerDownDotId = null; // dot id under the pointerdown, or null
                              // if it landed on empty board space
let callbacks      = null;   // { onMoveDrawn, onReject, onTap }

// ── SVG coordinate conversion ────────────────────────────────────

function toSvgPoint(event) {
  const pt = boardEl.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const ctm = boardEl.getScreenCTM();
  if (!ctm) return { x: event.offsetX, y: event.offsetY };
  const svgPt = pt.matrixTransform(ctm.inverse());
  return { x: svgPt.x, y: svgPt.y };
}

// ── Helpers ──────────────────────────────────────────────────────

function bothEndpointsSelected() {
  return SelectionState.getFirstSelectedDotId()  !== null
      && SelectionState.getSecondSelectedDotId() !== null;
}

function netMovement(points) {
  if (!points || points.length < 2) return 0;
  const first = points[0];
  const last  = points[points.length - 1];
  return Math.hypot(last.x - first.x, last.y - first.y);
}

function collectAllDotPositions() {
  const state = Engine.getState();
  if (!state || !Array.isArray(state.dots)) return [];
  return state.dots
    .map(dot => BoardView.getDotPosition(dot.id))
    .filter(pos => pos !== null);
}

function collectExistingEdgePaths() {
  const moves = Engine.getState().moves ?? [];
  const paths = [];
  for (let i = 0; i < moves.length; i++) {
    const path = BoardView.getEdgePath(i);
    if (path) paths.push(path);
  }
  return paths;
}

// ── Pointer event handlers ───────────────────────────────────────

/**
 * Starts sampling for every pointerdown, regardless of target or
 * current selection state. Whether this becomes a tap (selection)
 * or a drag (drawing) is decided later, in handlePointerUp, based
 * on how far the pointer actually moved.
 *
 * Records the dot under the pointerdown (if any), for tap reporting.
 * Records which of the two selected endpoints the gesture started
 * nearest to (only meaningful once both are selected — used to
 * support drawing from either dot, not just the first-selected one).
 *
 * @param {PointerEvent} event
 */
function handlePointerDown(event) {
  const startPoint = toSvgPoint(event);
  drawingPoints = [startPoint];

  const targetDotIdAttr = event.target.dataset.dotId;
  pointerDownDotId = (targetDotIdAttr !== undefined)
    ? parseInt(targetDotIdAttr, 10)
    : null;

  if (bothEndpointsSelected()) {
    const a = SelectionState.getFirstSelectedDotId();
    const b = SelectionState.getSecondSelectedDotId();
    const posA = BoardView.getDotPosition(a);
    const posB = BoardView.getDotPosition(b);
    const distToA = Math.hypot(startPoint.x - posA.x, startPoint.y - posA.y);
    const distToB = Math.hypot(startPoint.x - posB.x, startPoint.y - posB.y);
    drawStartDotId = (distToA <= distToB) ? a : b;
  } else {
    drawStartDotId = null;
  }

  boardEl.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!drawingPoints) return;
  drawingPoints.push(toSvgPoint(event));
  Renderer.showDraftPath(drawingPoints);
}

/**
 * Finishes a gesture. First decides tap vs drag by net movement:
 *
 *   tap  → if the pointerdown landed on a dot, calls
 *          callbacks.onTap(dotId) so ui.js can run its own
 *          selection/deselection logic. No dependency on the
 *          browser's native 'click' event — see file header for why.
 *
 *   drag → only meaningful once both endpoints are selected. Runs
 *          the full simplify → validate → commit-or-reject pipeline.
 *          If both endpoints are not yet selected, the drag has no
 *          defined meaning here and is silently discarded.
 *
 * Rejection never clears the endpoint selection — only the failed
 * curve attempt is discarded, so the player can immediately redraw
 * without re-selecting dots.
 *
 * @param {PointerEvent} event
 */
function handlePointerUp(event) {
  if (!drawingPoints) return;

  // Release capture immediately — see file header for why this must
  // not be relied on to fix native click targeting; we no longer use
  // click for game logic at all, but releasing promptly is still
  // correct pointer-event hygiene.
  boardEl.releasePointerCapture(event.pointerId);

  const rawPoints    = drawingPoints;
  const startDotId   = drawStartDotId;
  const tapDotId     = pointerDownDotId;
  drawingPoints      = null;
  drawStartDotId     = null;
  pointerDownDotId   = null;
  Renderer.clearDraftPath();

  // ── Tap vs. drag ───────────────────────────────────────────
  if (netMovement(rawPoints) < DRAG_THRESHOLD) {
    if (tapDotId !== null) callbacks.onTap(tapDotId);
    return;
  }

  // A drag only means something once both endpoints are selected.
  if (!bothEndpointsSelected()) return;

  if (rawPoints.length < MIN_DRAW_POINTS) {
    callbacks.onReject('Too short — draw a longer curve.');
    return;
  }

  const simplified = simplifyPath(rawPoints, 2);

  const a = SelectionState.getFirstSelectedDotId();
  const b = SelectionState.getSecondSelectedDotId();

  // Check the path ends near the dot it did NOT start from.
  const endDotId = (startDotId === a) ? b : a;
  const posEnd   = BoardView.getDotPosition(endDotId);
  const lastPt   = simplified[simplified.length - 1];

  if (Math.hypot(lastPt.x - posEnd.x, lastPt.y - posEnd.y) > DOT_CAPTURE_RADIUS) {
    callbacks.onReject('Curve must reach the other dot — try again.');
    return;
  }

  if (pathSelfIntersects(simplified)) {
    callbacks.onReject('That curve crosses itself — try again.');
    return;
  }

  // Trim both candidate and existing paths around all dot centers
  // before checking for crossings.
  const allDots = collectAllDotPositions();
  const trimmedCandidate = trimNearPoints(simplified, allDots, DOT_EXCLUSION_RADIUS);
  const existingPaths = collectExistingEdgePaths().map(
    path => trimNearPoints(path, allDots, DOT_EXCLUSION_RADIUS)
  );

  if (crossesAny(trimmedCandidate, existingPaths)) {
    callbacks.onReject('That line crosses another — try again.');
    return;
  }

  // Normalise direction so the committed path always runs a → b.
  const orientedPath = (startDotId === a)
    ? simplified
    : [...simplified].reverse();

  // Snap endpoints to exact dot centers so every committed path
  // begins and ends precisely at the dot, regardless of where
  // within the dot's radius the player actually clicked.
  const posA = BoardView.getDotPosition(a);
  const posB = BoardView.getDotPosition(b);
  orientedPath[0]                       = { x: posA.x, y: posA.y };
  orientedPath[orientedPath.length - 1] = { x: posB.x, y: posB.y };

  callbacks.onMoveDrawn(orientedPath, a, b);
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Initialises drawing interaction on the given board element.
 * Call once from ui.js during app startup.
 *
 * @param {SVGElement} board
 * @param {{ onMoveDrawn: Function, onReject: Function, onTap: Function }} cbs
 */
export function init(board, cbs) {
  boardEl   = board;
  callbacks = cbs;

  board.addEventListener('pointerdown',  handlePointerDown);
  board.addEventListener('pointermove',  handlePointerMove);
  board.addEventListener('pointerup',    handlePointerUp);
  board.addEventListener('pointerleave', handlePointerUp);
}

/**
 * Resets drawing state (e.g. on game restart).
 * Clears any in-progress draw without triggering callbacks.
 */
export function reset() {
  drawingPoints    = null;
  drawStartDotId   = null;
  pointerDownDotId = null;
  Renderer.clearDraftPath();
}
