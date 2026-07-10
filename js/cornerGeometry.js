/* ================================================================
   cornerGeometry.js — Sprouts v1.0 (PR 9)

   Responsibility
   ────────────────
   Bridges engine state (darts, rotations, edges, moves) and stored
   drawn-curve geometry (boardView's edge paths) to answer the one
   question ui.js needs when committing a move: which real corner
   (gap in the rotation) did the player's drawn curve actually use
   at each endpoint?

   This is deliberately NOT part of js/cornerResolution.js (which
   stays pure angle-in/index-out, zero engine knowledge, per its own
   PR 4 scope note) — this module is the glue PR 4 explicitly
   deferred: "does NOT extract real angles from boardView.js's dot
   positions/edge paths, and is NOT wired into ui.js". That's what
   this file does.

   Key structural facts this module trusts (see js/engine/darts.js,
   js/engine/reducer.js — not re-verified here, only relied upon):
     • edges[k].a is always the PRE-EXISTING endpoint of the move
       that created edge k (startDotId or endDotId); edges[k].b is
       always that move's newly created SPROUT. This is a direct
       reducer invariant, not a convention this file invents.
     • dart 2k originates at edges[k].a, dart 2k+1 at edges[k].b
       (js/engine/darts.js's pinned convention) — so `d % 2` tells
       us instantly whether a dart's origin is the "old" side or the
       "sprout" side of its edge.
     • Every move creates exactly 2 edges, always at array positions
       [2*moveIndex, 2*moveIndex + 1] (reducer.js: `firstEdgeIndex =
       state.edges.length`, which is always 2*moveIndex since edges
       only ever grow by 2, once per move). This lets us go from an
       edge index straight to "start-side or end-side" without a
       search: index 2*moveIndex is start-side, 2*moveIndex+1 is
       end-side.

   Depends on: engine/darts.js (edgeOfDart), engine/faces.js,
               engine/containment.js (computeK), pathGeometry.js,
               cornerResolution.js, regionGeometry.js.
   ================================================================ */

import { edgeOfDart } from './engine/darts.js';
import { departureAngle, arcLengthSplit } from './pathGeometry.js';
import { resolveCornerIndex } from './cornerResolution.js';
import { traceFaces, getComponents, cornerFace } from './engine/faces.js';
import { computeK } from './engine/containment.js';
import { partitionByEnclosure } from './regionGeometry.js';

/**
 * Computes the departure angle of a single dart, using whichever
 * stored path created its edge.
 *
 * @param {object} state — engine state (edges, moves)
 * @param {number} dart
 * @param {(moveIndex:number) => Array<{x:number,y:number}>} getEdgePath
 * @returns {number} angle in radians
 */
function angleForDart(state, dart, getEdgePath) {
  const edgeIndex   = edgeOfDart(dart);
  const edge        = state.edges[edgeIndex];
  const moveIndex   = edge.originatingMoveIndex;
  const path        = getEdgePath(moveIndex);
  const isStartSide = edgeIndex === 2 * moveIndex; // see file header

  if (dart % 2 === 0) {
    // Origin is edges[k].a — the pre-existing endpoint. Its
    // departure is the path's own first/last segment.
    return departureAngle(path, isStartSide ? 'start' : 'end');
  }

  // Origin is edges[k].b — the sprout created by this move. Its
  // departure is one of the two tangents at the arc-length split.
  const split = arcLengthSplit(path);
  return isStartSide ? split.angleTowardStart : split.angleTowardEnd;
}

/**
 * Existing departure angles for a dot's current edges, in the SAME
 * order as state.rotations[dotId] (σ order) — required, since
 * cornerResolution.resolveCornerIndex expects angles listed in σ
 * order to return a corner index consistent with move.js's indexing
 * convention.
 *
 * @param {object} state
 * @param {number} dotId
 * @param {(moveIndex:number) => Array<{x:number,y:number}>} getEdgePath
 * @returns {number[]} angles in radians, in σ order (possibly empty)
 */
export function existingAngles(state, dotId, getEdgePath) {
  const darts = state.rotations[dotId] ?? [];
  return darts.map(d => angleForDart(state, d, getEdgePath));
}

/**
 * Resolves the real startCorner/endCorner for a move about to be
 * committed, from the angles of the CURRENTLY-DRAWN curve against
 * each endpoint's PRE-move rotation — matching move.js's documented
 * convention that a corner index is relative to the rotation as it
 * stood before this move's darts are inserted.
 *
 * For a self-loop (startDotId === endDotId), both corners are
 * resolved against the same (single) existing-angle snapshot, using
 * the path's two independent departure angles — no special-casing
 * needed beyond that; resolveCornerIndex is simply called twice.
 *
 * @param {object} state — engine state BEFORE this move is applied
 * @param {number} startDotId
 * @param {number} endDotId
 * @param {Array<{x:number,y:number}>} path — the just-drawn curve,
 *   oriented startDotId → endDotId (matches drawInteraction.js's
 *   onMoveDrawn(orientedPath, a, b) contract)
 * @param {(moveIndex:number) => Array<{x:number,y:number}>} getEdgePath
 * @returns {{ startCorner: number, endCorner: number }}
 */
export function resolveMoveCorners(state, startDotId, endDotId, path, getEdgePath) {
  const startExisting = existingAngles(state, startDotId, getEdgePath);
  const endExisting    = (endDotId === startDotId)
    ? startExisting
    : existingAngles(state, endDotId, getEdgePath);

  const startCorner = resolveCornerIndex(startExisting, departureAngle(path, 'start'));
  const endCorner    = resolveCornerIndex(endExisting, departureAngle(path, 'end'));

  return { startCorner, endCorner };
}

/**
 * Resolves a split move's placement π and exteriorSide from the
 * drawn curve's geometry (PR 10). Only meaningful for a move that
 * splits a region containing occupant components (K ≠ ∅); returns
 * empty placement / null exteriorSide otherwise, so the ordinary
 * (non-enclosing) case is unaffected.
 *
 * Convention (self-consistent by construction — see the reducer's
 * updateContainmentForSplit): side 2 is declared the exterior
 * (⊥-adjacent) side. Occupants the drawn loop ENCLOSES go to the
 * interior, side 1 (→ nested); occupants OUTSIDE the loop go to
 * side 2 (→ stay roots). The engine's σ-based side ordering decides
 * which physical face is called side 1, but that choice is
 * immaterial: interior occupants are nested into a genuine bounded
 * face either way, which is exactly what enclosing them means.
 *
 * This is only invoked for a self-loop split (startDotId ===
 * endDotId). A non-loop move is a merge (no K); a same-component
 * cross-face move is illegal upstream (DIFFERENT_REGIONS). For a
 * split whose corners differ, the same enclosure logic applies —
 * the loopPath is still the drawn curve bounding the enclosed area.
 *
 * @param {object} state — engine state BEFORE the move
 * @param {number} startDotId
 * @param {number} endDotId
 * @param {number} startCorner — resolved corner (from resolveMoveCorners)
 * @param {number} endCorner
 * @param {Array<{x:number,y:number}>} path — the drawn curve
 * @param {(dotId:number) => ?{x:number,y:number}} getDotPosition
 * @returns {{ placement: object, exteriorSide: ?number }}
 */
export function resolveMovePlacement(
  state, startDotId, endDotId, startCorner, endCorner, path, getDotPosition
) {
  const faces = traceFaces(state.edges, state.rotations);
  const startFace = cornerFace(state.edges, state.rotations, faces, startDotId, startCorner);
  const endFace   = cornerFace(state.edges, state.rotations, faces, endDotId, endCorner);

  // Only a split (same face on both corners) can enclose occupants.
  if (startFace !== endFace) {
    return { placement: {}, exteriorSide: null };
  }

  const dotIds = state.dots.map(d => d.id);
  const components = getComponents(state.edges, dotIds);
  const touched = components.find(members => members.includes(startDotId));
  const rep = touched[0];

  const K = computeK(faces, state.parentAnchor, startFace, rep, state.outerFaceAnchor);
  if (K.length === 0) {
    return { placement: {}, exteriorSide: null };
  }

  // Each occupant rep is named by its representative vertex id; use
  // that vertex's screen position as the test point. (A component's
  // representative is a real vertex — spec §10.2 — so it always has
  // a position once drawn.)
  const candidates = K
    .map(occRep => ({ id: occRep, point: getDotPosition(occRep) }))
    .filter(c => c.point != null);

  const { inside } = partitionByEnclosure(path, candidates.map(c => ({ id: c.id, point: c.point })));
  const insideSet = new Set(inside);

  const placement = {};
  for (const occRep of K) {
    placement[occRep] = insideSet.has(occRep) ? 1 : 2; // inside→interior(1), outside→exterior(2)
  }

  return { placement, exteriorSide: 2 };
}
