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
               engine/containment.js (computeK, splitDescendantFaces),
               engine/reducer.js (applyMove, to see the post-move
               face structure), pathGeometry.js, cornerResolution.js,
               regionGeometry.js.
   ================================================================ */

import { edgeOfDart } from './engine/darts.js';
import { departureAngle, arcLengthSplit, splitPathAtMidpoint } from './pathGeometry.js';
import { resolveCornerIndex } from './cornerResolution.js';
import { traceFaces, getComponents, cornerFace } from './engine/faces.js';
import { computeK, splitDescendantFaces, resolveOuterFaceAnchor } from './engine/containment.js';
import { applyMove } from './engine/reducer.js';
import { pointInPolygon, signedArea, partitionByEnclosure, windingNumber } from './regionGeometry.js';

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
  const startCorner = resolveEndpointCorner(state, startDotId, path, 'start', getEdgePath);
  const endCorner   = resolveEndpointCorner(state, endDotId, path, 'end', getEdgePath);
  return { startCorner, endCorner };
}

/**
 * Resolves ONE endpoint's corner: the naive angle-gap answer from
 * resolveCornerIndex, geometrically VERIFIED and corrected if wrong
 * (PR 10c).
 *
 * Why verification is needed, not just angle-gap arithmetic (found
 * via Jared's manual playtest — see migration-plan.md's PR 10c
 * entry, confirmed by direct testing, not assumed): a self-loop's
 * two "existing angle" values don't describe two independent
 * departure rays the way a gap-membership test assumes — they're the
 * two cut ends of one bent curve, and which side is which depends on
 * the loop's actual drawn shape, not just its two endpoint angles.
 * Confirmed a real case where the new curve's angle unambiguously
 * falls inside the naive candidate's gap under any normal reading,
 * yet the geometrically/topologically correct corner is the OTHER
 * one. Also confirmed (a genuine triangle fixture, zero self-loops)
 * that angle-gap arithmetic IS correct for ordinary structures — so
 * this isn't a general PR 9 bug, just one specific blind spot.
 *
 * Rather than detect "is this dart self-loop-adjacent" as a special
 * case, verification runs uniformly whenever a corner choice is even
 * possible (degree ≥ 2): reconstruct the naive candidate's actual
 * face polygon (same construction resolveMovePlacement's
 * facePolygon uses) and confirm the drawn curve's own next point
 * genuinely falls inside it. If not, search the other corners for
 * one that does. Degree ≤ 1 skips this — only one corner exists,
 * unambiguous by construction.
 *
 * @param {object} state — engine state BEFORE the move
 * @param {number} dotId
 * @param {Array<{x:number,y:number}>} path — the drawn curve
 * @param {'start'|'end'} end — which end of the path this dot is
 * @param {(moveIndex:number) => ?Array<{x:number,y:number}>} getEdgePath
 * @returns {number} corner index
 */
function resolveEndpointCorner(state, dotId, path, end, getEdgePath) {
  const existing = existingAngles(state, dotId, getEdgePath);
  const naive = resolveCornerIndex(existing, departureAngle(path, end));
  const degree = existing.length;
  if (degree < 2) return naive;

  // The drawn curve's own next point after this endpoint — real
  // geometry showing exactly where the curve actually goes, used as
  // the test point rather than any position derived from angles.
  const testPoint = (end === 'start') ? path[1] : path[path.length - 2];
  if (!testPoint) return naive;

  const faces = traceFaces(state.edges, state.rotations);

  // Test EVERY candidate corner's reconstructed face polygon against
  // the drawn curve's real next point, collecting both a containment
  // answer and a winding number for each. Containment alone decides
  // it when the candidates disagree (the ordinary case — confirmed
  // against a genuine multi-edge structure with no self-loop
  // involved). When containment does NOT discriminate (every
  // candidate agrees) — confirmed to happen exactly when a pure
  // self-loop's two reconstructed "sides" trace the same physical
  // curve in opposite directions, so pointInPolygon's even-odd test
  // gives them the identical answer — the SIGN of the winding number
  // does discriminate (opposite for the two directions), pinned
  // against a real enclosure fixture, not re-derived by hand
  // (avoiding the mistake that shipped PR 10's original bug).
  const candidates = [];
  for (let c = 0; c < degree; c++) {
    const face = cornerFace(state.edges, state.rotations, faces, dotId, c);
    if (!face) continue;
    const poly = facePolygon(face, state.edges, getEdgePath);
    if (poly.length < 3) continue;
    const contains = pointInPolygon(testPoint, poly);
    const winding = windingNumber(testPoint, poly);
    candidates.push({ corner: c, contains, winding, face });
  }
  if (candidates.length === 0) return naive;

  const containing = candidates.filter(c => c.contains);
  if (containing.length === 1) {
    return containing[0].corner; // unambiguous — the ordinary case
  }
  if (containing.length > 1) {
    // Degenerate: multiple (reconstructed-identically) candidates all
    // "contain" the point — pointInPolygon's even-odd test cannot
    // discriminate a curve traced in opposite directions. Winding
    // number CAN, but only relative to the ACTUAL drawn geometry, not
    // a fixed sign (confirmed by testing both a clockwise- and a
    // counterclockwise-drawn loop: a fixed "always positive" rule
    // matched one and was wrong for the other). Find the raw path
    // that created the ambiguous darts (in this degenerate case, all
    // of them share one originating move) and use ITS OWN winding
    // number at the test point as the reference sign; the correct
    // candidate is whichever one matches it.
    const anyDart = containing[0].face.darts[0];
    const refMoveIndex = state.edges[edgeOfDart(anyDart)].originatingMoveIndex;
    const refPath = getEdgePath(refMoveIndex);
    if (refPath) {
      const refWinding = windingNumber(testPoint, refPath);
      const matching = containing.find(c => Math.sign(c.winding) === Math.sign(refWinding) && c.winding !== 0);
      if (matching) return matching.corner;
    }
    return containing[0].corner; // inconclusive — deterministic fallback
  }

  // containing.length === 0: no candidate's reconstructed polygon
  // contains the point. For an ordinary bounded/interior candidate
  // this correctly means "not this one" — but a face that has NEVER
  // been further subdivided since the self-loop that created it (2
  // darts, one originating move) reconstructs as the ENTIRE closed
  // loop retraced, and testing containment against that answers "is
  // this point inside the loop", not "is this point on the exterior
  // side" — backwards for a face that's actually meant to represent
  // everything OUTSIDE. Confirmed directly: a real follow-up-move
  // scenario where the interior had been further built out (so its
  // own polygon was well-formed and correctly excluded the point) but
  // the untouched exterior face's degenerate reconstruction ALSO
  // (correctly, for a bounded-region reading, but uselessly here)
  // excluded the same point — winding number is equally uninformative
  // for a point outside a simple closed curve (its winding number is
  // 0 either way, confirmed: both candidates printed a value
  // indistinguishable from zero).
  //
  // Resolution: use the engine's OWN authoritative record of which
  // face is this component's true exterior — resolveOuterFaceAnchor,
  // already tracked precisely because of PR 10's exteriorSide work —
  // as a trump card. If no candidate's (reliable) polygon contains
  // the point, and exactly one candidate IS that component's outer
  // face, it must be the answer by elimination: the point isn't in
  // any bounded sub-region, and this face is defined as "everything
  // else" relative to this component.
  const dotIds = state.dots.map(d => d.id);
  const components = getComponents(state.edges, dotIds);
  const touched = components.find(members => members.includes(dotId));
  const rep = touched ? touched[0] : dotId;
  const trueOuterFace = resolveOuterFaceAnchor(faces, state.outerFaceAnchor[rep]);
  const exteriorCandidates = candidates.filter(c => c.face === trueOuterFace);
  if (exteriorCandidates.length === 1) {
    return exteriorCandidates[0].corner;
  }

  return naive; // inconclusive (e.g. missing stored-path data) — safe fallback
}

/**
 * Resolves a split move's placement π and exteriorSide from the
 * drawn curve's geometry (PR 10, corrected at PR 10b).
 *
 * PR 10 shipped a bug here (found via Jared's manual playtest, see
 * migration-plan.md's PR 10/10b entries): it assumed "inside the
 * drawn loop → side 1" always, but which physical σ-face is called
 * side 1 is decided by dart numbering, unrelated to which face the
 * loop geometrically encloses. PR 10b fixes this by actually
 * reconstructing each descendant face's real screen polygon — from
 * the drawn geometry of every edge on its boundary walk, each split
 * into its own two arcs via pathGeometry's splitPathAtMidpoint at
 * the point where ITS move's sprout sits — and testing occupants
 * against the reconstructed polygons directly, not against a fixed
 * side-number convention.
 *
 * @param {object} state — engine state BEFORE the move
 * @param {number} startDotId
 * @param {number} endDotId
 * @param {number} startCorner — resolved corner (from resolveMoveCorners)
 * @param {number} endCorner
 * @param {Array<{x:number,y:number}>} path — the drawn curve
 * @param {(dotId:number) => ?{x:number,y:number}} getDotPosition
 * @param {(moveIndex:number) => ?Array<{x:number,y:number}>} getEdgePath
 * @returns {{ placement: object, exteriorSide: ?number }}
 */
export function resolveMovePlacement(
  state, startDotId, endDotId, startCorner, endCorner, path, getDotPosition, getEdgePath
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

  const candidates = K.map(occRep => ({ id: occRep, point: getDotPosition(occRep) }))
    .filter(c => c.point != null);

  // Reconstruct at least one descendant face's real screen polygon —
  // needed either to test occupants directly against it (different-
  // dot split) or just to learn its winding sign (self-loop; see
  // below for why a self-loop needs a different mechanism).
  const thisMoveIndex = state.moves.length;
  const trial = applyMove(state, {
    startDotId, endDotId, startCorner, endCorner, placement: {}, exteriorSide: null,
  });
  const newFaces = traceFaces(trial.edges, trial.rotations);
  const firstEdgeIndex = state.edges.length; // edges only ever grow by 2, once per move
  const newDarts = [
    2 * firstEdgeIndex, 2 * firstEdgeIndex + 1,
    2 * (firstEdgeIndex + 1), 2 * (firstEdgeIndex + 1) + 1,
  ];
  const descendants = splitDescendantFaces(newFaces, rep, newDarts);
  const getPathFor = moveIndex => (moveIndex === thisMoveIndex ? path : getEdgePath(moveIndex));

  let placement;
  let insideSideForExterior; // the side occupants OUTSIDE the drawn shape land on

  if (startDotId === endDotId) {
    // SELF-LOOP: the drawn path is already one complete closed curve.
    // Reconstructing "both sides' polygons" and testing containment
    // against them does NOT work here — with no other boundary
    // structure to differentiate them (the common case: an isolated
    // or near-isolated dot), both descendants trace the SAME closed
    // curve, just in opposite winding order, so point-in-polygon
    // gives the identical "inside" answer for either one and cannot
    // tell them apart (confirmed directly: both register the same
    // point as contained). Winding CAN tell them apart. So: test
    // occupants against the raw drawn path directly (unambiguous —
    // it's the actual physical loop), then learn which abstract side
    // number is "the interior" by checking which descendant's own
    // reconstructed winding matches the drawn path's winding sign
    // (the descendant traced in the SAME direction the loop was
    // physically drawn is definitionally the bounded/interior one).
    const { inside } = partitionByEnclosure(path, candidates);
    const insideSet = new Set(inside);

    const poly0 = facePolygon(descendants[0], trial.edges, getPathFor);
    const drawnSign = Math.sign(signedArea(path)) || 1;
    const side0Sign = Math.sign(signedArea(poly0)) || 1;
    const interiorSide = (side0Sign === drawnSign) ? 1 : 2;
    const exteriorCandidateSide = interiorSide === 1 ? 2 : 1;

    placement = {};
    for (const occRep of K) {
      placement[occRep] = insideSet.has(occRep) ? interiorSide : exteriorCandidateSide;
    }
    insideSideForExterior = exteriorCandidateSide;
  } else {
    // DIFFERENT-DOT SPLIT: the drawn path is an open arc, not a
    // closed curve — there is no single "inside the drawn shape" to
    // test against directly. Reconstruct BOTH descendants' real
    // polygons (from every edge on each one's boundary walk, current
    // move's own two edges included) and test occupants against them
    // directly — this works because with genuine extra boundary
    // structure (at least one pre-existing edge on one of the two
    // touched dots), the two descendants are genuinely different
    // shapes, unlike the self-loop-on-an-isolated-dot degenerate case.
    const polygons = descendants.map(face => facePolygon(face, trial.edges, getPathFor));
    placement = {};
    for (const { id, point } of candidates) {
      placement[id] = pointInPolygon(point, polygons[1]) ? 2 : 1;
    }
    for (const occRep of K) {
      if (!(occRep in placement)) placement[occRep] = 1; // missing position — defensive default
    }
    insideSideForExterior = 2;
  }

  // exteriorSide: only meaningful when this split touches the
  // touched component's OWN current outer face while it's still a
  // root (splitting the shared plane's outer region — the only case
  // Option 1's root-normalisation applies to; see containment.js).
  // Scoped to self-loops in practice — see migration-plan.md's PR 10b
  // residual note for the (unverified, likely rare) different-dot
  // case of connecting two dots both on a root's own outer face.
  const outerAnchorFace = resolveOuterFaceAnchor(faces, state.outerFaceAnchor[rep]);
  const isRoot = state.parentAnchor[rep] === null || state.parentAnchor[rep] === undefined;
  const exteriorSide = (isRoot && outerAnchorFace === startFace) ? insideSideForExterior : null;

  return { placement, exteriorSide };
}

/**
 * Builds a screen-coordinate polygon tracing a face's boundary walk,
 * by concatenating each dart's own arc of its edge's drawn curve.
 *
 * Every edge's stored path is split at ITS OWN move's sprout point
 * (pathGeometry's splitPathAtMidpoint) into two arcs — arcToStart
 * (toward that move's startDotId side) and arcToEnd (toward its
 * endDotId side). A dart whose origin is the "old" endpoint
 * (d % 2 === 0) traverses FROM that endpoint TOWARD the sprout —
 * the reverse of the arc as stored (which runs sprout→endpoint); a
 * dart whose origin IS that move's sprout (d % 2 === 1) traverses in
 * the arc's stored order directly.
 *
 * @param {{darts:number[]}} face
 * @param {Array<{a:number,b:number,originatingMoveIndex:number}>} edges
 * @param {(moveIndex:number) => ?Array<{x:number,y:number}>} getPathFor
 * @returns {Array<{x:number,y:number}>}
 */
function facePolygon(face, edges, getPathFor) {
  const points = [];
  for (const dart of face.darts) {
    const edgeIndex = edgeOfDart(dart);
    const edge = edges[edgeIndex];
    const moveIndex = edge.originatingMoveIndex;
    const fullPath = getPathFor(moveIndex);
    if (!fullPath || fullPath.length < 2) continue; // no geometry available — skip

    const isStartSide = edgeIndex === 2 * moveIndex;
    const { arcToStart, arcToEnd } = splitPathAtMidpoint(fullPath);
    const arc = isStartSide ? arcToStart : arcToEnd;
    const oriented = (dart % 2 === 0) ? [...arc].reverse() : arc;
    for (const p of oriented) points.push(p);
  }
  return points;
}
