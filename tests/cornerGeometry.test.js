/* ================================================================
   tests/cornerGeometry.test.js — Sprouts v1.0 (PR 9)

   Tests for js/cornerGeometry.js — the bridge from engine state +
   stored drawn-curve paths to real startCorner/endCorner values.

   Fixtures are hand-built engine states (rotations/edges/moves) with
   synthetic path arrays standing in for boardView's stored curves.
   Every hand-traced angle is derived in a comment, not just asserted
   — house style (see docs/migration-plan.md's recurring findings).
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existingAngles, resolveMoveCorners, resolveMovePlacement } from '../js/cornerGeometry.js';
import { buildInitialTopology } from '../js/engine/regions.js';

const EPS = 1e-6;
function assertAngleClose(actual, expected, msg) {
  let diff = Math.abs(actual - expected) % (2 * Math.PI);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  assert.ok(diff < EPS, `${msg}: expected ${expected}, got ${actual}`);
}

// ── existingAngles: degree-0 ─────────────────────────────────────

test('existingAngles: isolated dot has no existing angles', () => {
  const state = { rotations: { 0: [] }, edges: [] };
  assert.deepEqual(existingAngles(state, 0, () => { throw new Error('should not be called'); }), []);
});

// ── existingAngles: one move connecting two original dots ────────
//
// Move 0 draws a straight curve from dot 0 (0,0) to dot 1 (10,0),
// creating sprout dot 2 at the arc-length midpoint (5,0).
// Per the reducer's fixed layout: firstEdgeIndex = 2*moveIndex = 0.
//   edges[0] = { a: 0 (start dot), b: 2 (sprout) }  — dart 0 / 1
//   edges[1] = { a: 1 (end dot),   b: 2 (sprout) }  — dart 2 / 3
// rotations after the move: 0:[0], 1:[2], 2:[1, 3] (append order:
// sproutDartA=1 then sproutDartB=3, per reducer.js).

const straightPath0 = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
function getPath0(moveIndex) {
  assert.equal(moveIndex, 0);
  return straightPath0;
}

const twoDotState = {
  rotations: { 0: [0], 1: [2], 2: [1, 3] },
  edges: [
    { a: 0, b: 2, originatingMoveIndex: 0 },
    { a: 1, b: 2, originatingMoveIndex: 0 },
  ],
};

test('existingAngles: original start dot — angle is the path\'s own first segment', () => {
  // dart 0 is start-side (edgeIndex 0 === 2*0), origin = dot 0 (a-side).
  // departureAngle(path,'start') = segmentAngle((0,0),(10,0)) = 0 (east).
  assertAngleClose(existingAngles(twoDotState, 0, getPath0)[0], 0, 'dot 0 departs east');
});

test('existingAngles: original end dot — angle is the path\'s own last segment, reversed', () => {
  // dart 2 is end-side (edgeIndex 1 === 2*0 + 1), origin = dot 1 (a-side
  // of edges[1]). departureAngle(path,'end') = segmentAngle((10,0),(0,0)) = π (west).
  assertAngleClose(existingAngles(twoDotState, 1, getPath0)[0], Math.PI, 'dot 1 departs west');
});

test('existingAngles: sprout dot — both tangents from the arc-length split, in creation order', () => {
  // dot 2 is edges[*].b for both edges (the sprout).
  // dart 1 (sproutDartA, start-side) -> angleTowardStart of the split
  //   at (5,0) on a straight east-west line = π (west, toward dot 0).
  // dart 3 (sproutDartB, end-side)   -> angleTowardEnd = 0 (east, toward dot 1).
  const angles = existingAngles(twoDotState, 2, getPath0);
  assert.equal(angles.length, 2);
  assertAngleClose(angles[0], Math.PI, 'sprout\'s first edge (toward dot 0) departs west');
  assertAngleClose(angles[1], 0, 'sprout\'s second edge (toward dot 1) departs east');
});

// ── resolveMoveCorners: a real move onto the degree-2 sprout ─────
//
// Dot 2's existing angles (from above) are [π, 0], in σ order.
// resolveCornerIndex's gaps: gap 0 spans π → 0 going forward, i.e.
// normalizeAngle(0 − π) = π of arc — the "upper" half in SVG's
// y-down convention (west, through north at 3π/2 (≡ −π/2), to east).
// gap 1 spans 0 → π — the "lower" half (east, through south at π/2,
// to west). A new curve departing dot 2 heading due NORTH (−π/2)
// must land in gap 0; heading due SOUTH (π/2) must land in gap 1.

test('resolveMoveCorners: new curve heading north from the sprout resolves to gap 0', () => {
  // Dot 2 sits at (5,0) (this move's own arithmetic doesn't need
  // that fact — only the NEW path's own geometry matters here).
  const newPath = [{ x: 5, y: 0 }, { x: 5, y: -10 }]; // north: y decreases
  const isolatedDot3 = { rotations: { ...twoDotState.rotations, 3: [] }, edges: twoDotState.edges };
  const { startCorner, endCorner } = resolveMoveCorners(isolatedDot3, 2, 3, newPath, getPath0);
  assert.equal(startCorner, 0, 'north-heading departure lands in gap 0 (the upper half)');
  assert.equal(endCorner, 0, 'dot 3 is isolated — degree-0 always resolves to corner 0');
});

test('resolveMoveCorners: new curve heading south from the sprout resolves to gap 1', () => {
  const newPath = [{ x: 5, y: 0 }, { x: 5, y: 10 }]; // south: y increases
  const isolatedDot3 = { rotations: { ...twoDotState.rotations, 3: [] }, edges: twoDotState.edges };
  const { startCorner } = resolveMoveCorners(isolatedDot3, 2, 3, newPath, getPath0);
  assert.equal(startCorner, 1, 'south-heading departure lands in gap 1 (the lower half)');
});

// ── resolveMoveCorners: self-loop ─────────────────────────────────
//
// A self-loop needs 2 fresh darts, so it is only ever legal on a
// dot with degree ≤ 1 (degree 0 → 2, or degree 1 → 3 — the max).
// A degree-0 or degree-1 vertex has at most one existing angle,
// and resolveCornerIndex always returns corner 0 for degree ≤ 1
// regardless of the new angle (there is only ever one gap — see
// cornerResolution.test.js). Consequence, worth recording: for
// EVERY legal self-loop, both startCorner and endCorner MUST
// resolve to 0 — not a coincidence of this fixture, a structural
// fact of the lives rule intersecting the corner-indexing scheme.

test('resolveMoveCorners: self-loop on a degree-1 dot — both corners are always 0', () => {
  // Dot 5 already has one edge (from a prior move 0, angle 0/east —
  // reusing straightPath0/getPath0 as that prior edge's stored path).
  const degree1State = {
    rotations: { 5: [0] },
    edges: [{ a: 5, b: 6, originatingMoveIndex: 0 }],
  };
  // The self-loop's own drawn curve departs however it likes — here,
  // deliberately two VERY different angles (north out, south back)
  // to confirm the result is 0 regardless, not because the angles
  // happened to coincide.
  const loopPath = [
    { x: 0, y: 0 }, { x: 0, y: -10 }, { x: 5, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 0 },
  ];
  const { startCorner, endCorner } = resolveMoveCorners(degree1State, 5, 5, loopPath, getPath0);
  assert.equal(startCorner, 0);
  assert.equal(endCorner, 0);
});

// ── resolveMovePlacement: enclosure π from drawn geometry (PR 10) ──

function threeIsolatedDots() {
  return {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }, { id: 2, lives: 3 }],
    edges: [], moves: [], initialDotCount: 3, startingPlayer: 0,
    nextDotId: 3, ...buildInitialTopology(3),
  };
}

test('resolveMovePlacement: a self-loop around one dot puts it inside (side 1), leaves the other outside (side 2)', () => {
  const state = threeIsolatedDots();
  // A square loop drawn from dot 0, enclosing the region around
  // (50,50). Dot 1 sits inside it; dot 2 sits far outside.
  const loop = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 },
  ];
  const positions = { 1: { x: 50, y: 50 }, 2: { x: 500, y: 500 } };
  const getDotPosition = id => positions[id] ?? null;

  const { placement, exteriorSide } = resolveMovePlacement(
    state, 0, 0, /*startCorner*/0, /*endCorner*/0, loop, getDotPosition, () => null
  );
  // K = {1, 2} (both siblings share the plane's outer region). Dot 1
  // enclosed → interior (side 1); dot 2 outside → exterior (side 2).
  assert.deepEqual(placement, { 1: 1, 2: 2 });
  assert.equal(exteriorSide, 2);
});

test('resolveMovePlacement: with no drawn enclosure, both siblings resolve to the exterior side', () => {
  const state = threeIsolatedDots();
  // A tiny loop near dot 0 that encloses neither sibling.
  const loop = [
    { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }, { x: 0, y: 0 },
  ];
  const positions = { 1: { x: 500, y: 500 }, 2: { x: 800, y: 100 } };
  const getDotPosition = id => positions[id] ?? null;

  const { placement, exteriorSide } = resolveMovePlacement(
    state, 0, 0, 0, 0, loop, getDotPosition, () => null
  );
  // Nobody enclosed — both go to the exterior side (they stay roots).
  assert.deepEqual(placement, { 1: 2, 2: 2 });
  assert.equal(exteriorSide, 2);
});

test('resolveMovePlacement: a lone self-loop with no siblings returns empty placement', () => {
  const state = {
    dots: [{ id: 0, lives: 3 }], edges: [], moves: [],
    initialDotCount: 1, startingPlayer: 0, nextDotId: 1, ...buildInitialTopology(1),
  };
  const loop = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 },
  ];
  const { placement, exteriorSide } = resolveMovePlacement(
    state, 0, 0, 0, 0, loop, () => null, () => null
  );
  // K = ∅ → no placement, no exterior side (ordinary lone loop).
  assert.deepEqual(placement, {});
  assert.equal(exteriorSide, null);
});

// ── PR 10b: interior side determined by real geometry ─────────────
//
// PR 10 shipped with interior/exterior assigned by dart numbering
// rather than geometry — asymmetric depending on which dot drew the
// loop (see migration-plan.md's PR 10 manual-playtest entry). These
// tests exercise the actual fix: the loop owner's identity and the
// drawing's winding direction must never change which occupant ends
// up nested vs. staying a root. Assertions are made via containment
// (parentAnchor) rather than by asserting exact side numbers, since
// which abstract side (1 or 2) a physical face gets called is a
// dart-numbering detail this fix deliberately makes irrelevant.

import { applyMove } from '../js/engine/reducer.js';

const squareLoopCW = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 },
];
const squareLoopCCW = [...squareLoopCW].reverse();

function threeDotsFresh() {
  return {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }, { id: 2, lives: 3 }],
    edges: [], moves: [], initialDotCount: 3, startingPlayer: 0,
    nextDotId: 3, ...buildInitialTopology(3),
  };
}

for (const [ownerLabel, owner, outside] of [['dot 0', 0, 2], ['dot 2', 2, 0]]) {
  for (const [windingLabel, drawnLoop] of [['CW', squareLoopCW], ['CCW', squareLoopCCW]]) {
    test(`resolveMovePlacement: enclosure is correct regardless of loop owner or winding (owner=${ownerLabel}, ${windingLabel})`, () => {
      const state = threeDotsFresh();
      const enclosed = [0, 1, 2].find(id => id !== owner && id !== outside);
      const positions = { [enclosed]: { x: 50, y: 50 }, [outside]: { x: 900, y: 900 } };
      const getDotPosition = id => positions[id] ?? null;

      const { startCorner, endCorner } = resolveMoveCorners(state, owner, owner, drawnLoop, () => null);
      const { placement, exteriorSide } = resolveMovePlacement(
        state, owner, owner, startCorner, endCorner, drawnLoop, getDotPosition, () => null
      );
      const result = applyMove(state, {
        startDotId: owner, endDotId: owner, startCorner, endCorner, placement, exteriorSide,
      });

      assert.notEqual(result.parentAnchor[enclosed], null, 'enclosed dot must be nested (non-root)');
      assert.equal(result.parentAnchor[outside], null, 'dot outside the loop must remain a root');
    });
  }
}

test('resolveMovePlacement: a non-convex (L-shaped) loop encloses correctly, including a dot in the notch', () => {
  const state = threeDotsFresh();
  // L-shape: full square minus its top-right quadrant.
  const L = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 },
    { x: 50, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 },
  ];
  // dot 1 in the solid part (enclosed); dot 2 in the removed notch
  // (NOT enclosed, even though it's within the L's bounding box).
  const positions = { 1: { x: 20, y: 20 }, 2: { x: 70, y: 70 } };
  const getDotPosition = id => positions[id] ?? null;

  const { startCorner, endCorner } = resolveMoveCorners(state, 0, 0, L, () => null);
  const { placement, exteriorSide } = resolveMovePlacement(
    state, 0, 0, startCorner, endCorner, L, getDotPosition, () => null
  );
  const result = applyMove(state, { startDotId: 0, endDotId: 0, startCorner, endCorner, placement, exteriorSide });

  assert.notEqual(result.parentAnchor[1], null, 'dot in the solid part must be nested');
  assert.equal(result.parentAnchor[2], null, 'dot in the notch must remain a root');
});

test('resolveMovePlacement: a self-loop drawn from a dot that already has one edge still encloses correctly', () => {
  // dot 1 gets one edge (to dot 0) first, via a plain merge, THEN
  // self-loops enclosing dot 2, with sibling dot 3 outside.
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }, { id: 2, lives: 3 }, { id: 3, lives: 3 }],
    edges: [], moves: [], initialDotCount: 4, startingPlayer: 0,
    nextDotId: 4, ...buildInitialTopology(4),
  };
  const positions = {
    0: { x: 500, y: 500 }, 1: { x: 0, y: 0 }, 2: { x: 20, y: 20 }, 3: { x: 900, y: 900 },
  };
  const getDotPosition = id => positions[id] ?? null;
  const storedPaths = {};
  const getEdgePath = mi => storedPaths[mi] ?? null;

  const straight = [positions[1], { x: 250, y: 250 }, positions[0]];
  const c0 = resolveMoveCorners(state, 1, 0, straight, getEdgePath);
  const afterMerge = applyMove(state, { startDotId: 1, endDotId: 0, startCorner: c0.startCorner, endCorner: c0.endCorner, placement: null, exteriorSide: null });
  storedPaths[0] = straight;

  const loop2 = [
    { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 0 },
  ];
  const c1 = resolveMoveCorners(afterMerge, 1, 1, loop2, getEdgePath);
  const { placement, exteriorSide } = resolveMovePlacement(
    afterMerge, 1, 1, c1.startCorner, c1.endCorner, loop2, getDotPosition, getEdgePath
  );
  const result = applyMove(afterMerge, {
    startDotId: 1, endDotId: 1, startCorner: c1.startCorner, endCorner: c1.endCorner, placement, exteriorSide,
  });

  assert.notEqual(result.parentAnchor[2], null, 'dot 2 (enclosed) must be nested');
  assert.equal(result.parentAnchor[3], null, 'dot 3 (outside) must remain a root');
});

// ── Known residual limitation (PR 10c, not yet fixed) ──────────────
//
// A FOLLOW-UP move drawn INTO a region that was just created by an
// enclosure (e.g. connecting the newly-enclosed dot back to the loop's
// owner) can still be wrongly rejected. Root cause is separate from
// the placement fix above: resolveCornerIndex's angle-based corner
// picking does not correctly identify the right gap for a dot whose
// existing darts came from a self-loop, because a self-loop's
// "return" dart is registered at a reversed departure-equivalent
// angle (a convention that is fine for PR 9's original insertion/
// rendering purpose but does not describe which physical wedge is
// which). This is NOT exercised or fixed here — see migration-plan.md's
// PR 10c entry for the confirmed repro and scope.
