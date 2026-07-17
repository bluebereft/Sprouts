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
import { createMove } from '../js/engine/move.js';
import { arcLengthSplit } from '../js/pathGeometry.js';

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
  // PR 10c: resolveMoveCorners now geometrically verifies via
  // traceFaces, which requires a genuine Array (not an object with
  // numeric keys) for rotations — build isolatedDot3 as a real array.
  // PR 10c follow-up fix: also needs dots/outerFaceAnchor/parentAnchor
  // (getComponents + resolveOuterFaceAnchor), for the exterior-face
  // fallback when no candidate polygon contains the test point.
  const isolatedDot3 = {
    dots: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    rotations: [twoDotState.rotations[0], twoDotState.rotations[1], twoDotState.rotations[2], []],
    edges: twoDotState.edges,
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 }, 3: { kind: 'vertex', value: 3 } },
    parentAnchor: { 0: null, 3: null },
  };
  const { startCorner, endCorner } = resolveMoveCorners(isolatedDot3, 2, 3, newPath, getPath0);
  assert.equal(startCorner, 0, 'north-heading departure lands in gap 0 (the upper half)');
  assert.equal(endCorner, 0, 'dot 3 is isolated — degree-0 always resolves to corner 0');
});

test('resolveMoveCorners: new curve heading south from the sprout resolves to gap 1', () => {
  const newPath = [{ x: 5, y: 0 }, { x: 5, y: 10 }]; // south: y increases
  const isolatedDot3 = {
    dots: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    rotations: [twoDotState.rotations[0], twoDotState.rotations[1], twoDotState.rotations[2], []],
    edges: twoDotState.edges,
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 }, 3: { kind: 'vertex', value: 3 } },
    parentAnchor: { 0: null, 3: null },
  };
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

test('resolveMovePlacement: a lone self-loop with no siblings has empty placement, but still gets a real exteriorSide', () => {
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
  // K = ∅ → no placement (nobody to place). exteriorSide is NOT
  // null, though — corrected after a stress test found the original
  // "K empty → always null" assumption corrupts outerFaceAnchor even
  // here: the dot and its own sprout both have 1 life left after
  // this move, so a real follow-up move is still possible (verified:
  // connecting them back to each other resolves and validates
  // correctly only with a real exteriorSide recorded here). See
  // migration-plan.md's stress-testing entry.
  assert.deepEqual(placement, {});
  assert.equal(exteriorSide, 2);
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
import { validateMove } from '../js/engine/rules.js';

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

// ── PR 10c: follow-up move into a freshly-enclosed region ──────────
//
// Found while verifying PR 10b end-to-end (Jared's exact manual
// playtest sequence): a REAL follow-up curve drawn from the enclosed
// dot back to the loop's owner was wrongly rejected, even though the
// enclosed dot was correctly nested by PR 10b. Root cause: a
// self-loop's two "existing angle" values don't describe two
// independent departure rays the way naive angle-gap comparison
// assumes — confirmed directly with a case where the new curve's
// angle unambiguously falls in one gap under any normal reading, yet
// the topologically correct corner is the OTHER one. Also confirmed
// (a genuine triangle fixture, zero self-loops) that angle-gap
// arithmetic IS correct for ordinary structures, so this is a
// self-loop-specific blind spot, not a general PR 9 bug.
//
// Fix: resolveMoveCorners now geometrically verifies its answer by
// reconstructing each candidate corner's real face polygon and
// testing the drawn curve's own next point against it. When BOTH
// candidates "contain" the point (the exact self-loop degeneracy —
// its two sides trace the same curve in opposite directions, so
// pointInPolygon can't tell them apart), winding-number sign,
// compared against the reference loop's OWN winding (not a fixed
// convention — see windingNumber's test file for why a fixed
// "always positive" rule was tried and found wrong), breaks the tie.

for (const [ownerLabel, owner, outside] of [['dot 0', 0, 2], ['dot 2', 2, 0]]) {
  for (const [windingLabel, drawnLoop] of [['CW', squareLoopCW], ['CCW', squareLoopCCW]]) {
    test(`PR 10c: a real follow-up join from the enclosed dot to the loop owner succeeds (owner=${ownerLabel}, ${windingLabel})`, () => {
      const state = threeDotsFresh();
      const enclosed = [0, 1, 2].find(id => id !== owner && id !== outside);
      const positions = { [owner]: { x: 0, y: 0 }, [enclosed]: { x: 50, y: 50 }, [outside]: { x: 900, y: 900 } };
      const getDotPosition = id => positions[id] ?? null;
      const storedPaths = {};
      const getEdgePath = mi => storedPaths[mi] ?? null;

      const { startCorner, endCorner } = resolveMoveCorners(state, owner, owner, drawnLoop, getEdgePath);
      const { placement, exteriorSide } = resolveMovePlacement(
        state, owner, owner, startCorner, endCorner, drawnLoop, getDotPosition, getEdgePath
      );
      const afterLoop = applyMove(state, {
        startDotId: owner, endDotId: owner, startCorner, endCorner, placement, exteriorSide,
      });
      storedPaths[0] = drawnLoop;

      // The real follow-up: a straight line from the enclosed dot
      // back to the owner, entirely inside the loop.
      const mid = { x: (positions[enclosed].x + positions[owner].x) / 2, y: (positions[enclosed].y + positions[owner].y) / 2 };
      const joinPath = [positions[enclosed], mid, positions[owner]];
      const jc = resolveMoveCorners(afterLoop, enclosed, owner, joinPath, getEdgePath);

      const validation = validateMove(afterLoop, {
        startDotId: enclosed, endDotId: owner, startCorner: jc.startCorner, endCorner: jc.endCorner,
        placement: null, exteriorSide: null,
      });
      assert.equal(validation.ok, true, `join should be legal: ${JSON.stringify(validation.violations)}`);
    });
  }
}

test('PR 10c: a follow-up join still resolves correctly when the loop owner already has a pre-existing edge', () => {
  // dot 1 gets one edge (to dot 0) first via a plain merge, THEN
  // self-loops enclosing dot 2 (dot 3 stays outside). The follow-up
  // join goes to the self-loop's OWN sprout (dot 1 itself is fully
  // exhausted — degree 3 — after merge + self-loop, so connecting
  // further from dot 1 directly isn't legal Sprouts anyway).
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
  const afterMerge = applyMove(state, {
    startDotId: 1, endDotId: 0, startCorner: c0.startCorner, endCorner: c0.endCorner,
    placement: null, exteriorSide: null,
  });
  storedPaths[0] = straight;

  const loop2 = [
    { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 0 },
  ];
  const c1 = resolveMoveCorners(afterMerge, 1, 1, loop2, getEdgePath);
  const { placement, exteriorSide } = resolveMovePlacement(
    afterMerge, 1, 1, c1.startCorner, c1.endCorner, loop2, getDotPosition, getEdgePath
  );
  const afterLoop = applyMove(afterMerge, {
    startDotId: 1, endDotId: 1, startCorner: c1.startCorner, endCorner: c1.endCorner, placement, exteriorSide,
  });
  storedPaths[1] = loop2;

  // The self-loop's own sprout is dot 5 (dots 0-3 seeded, dot 4 from
  // the merge's sprout, dot 5 from the self-loop's sprout).
  const sproutId = 5;
  assert.equal(afterLoop.dots.length, 6, 'sanity: sprout ids as expected');

  const joinPath = [positions[2], { x: 10, y: 10 }, { x: 20, y: 0 }];
  const jc = resolveMoveCorners(afterLoop, 2, sproutId, joinPath, getEdgePath);
  const validation = validateMove(afterLoop, {
    startDotId: 2, endDotId: sproutId, startCorner: jc.startCorner, endCorner: jc.endCorner,
    placement: null, exteriorSide: null,
  });
  assert.equal(validation.ok, true, `join should be legal: ${JSON.stringify(validation.violations)}`);
});

// ── PR 10c follow-up: exterior face degenerates when its OWN
// reconstruction retraces the whole original self-loop, and no
// candidate then "contains" a point genuinely outside everything ──
//
// Found via a real playtested game (Jared, browser). Exact game
// record reproduced below. The loop's owner (dot 0) enclosed dot 1,
// then three more moves built out real structure INSIDE the loop
// (enclosed dot 1 connecting back to the owner, twice more). At that
// point, the loop's INTERIOR face has genuine extra structure (well-
// formed polygon, correctly excludes points outside), but its
// EXTERIOR face is still just the original 2 darts from the self-loop
// — reconstructing it retraces the ENTIRE closed loop. Testing a
// point genuinely outside everything against that degenerate
// reconstruction correctly says "not inside the loop" — which is
// backwards for a face meant to represent "everything outside": both
// pointInPolygon AND winding number are uninformative for a point
// outside a simple closed curve (winding is ~0 either way), so
// neither existing mechanism could resolve it. Fixed by falling back
// to the engine's own authoritative record of which face is the
// component's true exterior (resolveOuterFaceAnchor) when no
// candidate's polygon contains the point.

test('PR 10c follow-up: a follow-up move to the far outside still resolves correctly once the loop\'s interior has real structure', () => {
  const bigLoop = [
    { x: 76, y: 238 }, { x: 100, y: 130 }, { x: 220, y: 90 }, { x: 340, y: 100 },
    { x: 417, y: 180 }, { x: 417, y: 260 }, { x: 340, y: 340 }, { x: 220, y: 350 },
    { x: 100, y: 300 }, { x: 76, y: 238 },
  ];
  const positions = { 0: { x: 76, y: 238 }, 1: { x: 200, y: 220 }, 2: { x: 601, y: 238 } };
  const getDotPosition = id => positions[id] ?? null;
  const storedPaths = {};
  const getEdgePath = mi => storedPaths[mi] ?? null;

  let state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }, { id: 2, lives: 3 }],
    edges: [], moves: [], initialDotCount: 3, startingPlayer: 0,
    nextDotId: 3, ...buildInitialTopology(3),
  };

  // Move 0: the big self-loop enclosing dot 1, dot 2 outside.
  const m0 = resolveMoveCorners(state, 0, 0, bigLoop, getEdgePath);
  const p0 = resolveMovePlacement(state, 0, 0, m0.startCorner, m0.endCorner, bigLoop, getDotPosition, getEdgePath);
  state = applyMove(state, { startDotId: 0, endDotId: 0, ...m0, placement: p0.placement, exteriorSide: p0.exteriorSide });
  storedPaths[0] = bigLoop;
  positions[3] = arcLengthSplit(bigLoop).point; // dot 3 = the loop's own sprout

  // Move 1: connect enclosed dot 1 back to the owner, dot 0.
  const path1 = [positions[1], { x: 138, y: 219 }, positions[0]];
  const m1 = resolveMoveCorners(state, 1, 0, path1, getEdgePath);
  state = applyMove(state, { startDotId: 1, endDotId: 0, ...m1, placement: null, exteriorSide: null });
  storedPaths[1] = path1;
  positions[4] = arcLengthSplit(path1).point;

  // Move 2 and 3: two more moves building out the interior structure.
  const path2 = [positions[4], { x: 219, y: 227 }, positions[1]];
  const m2 = resolveMoveCorners(state, 4, 1, path2, getEdgePath);
  state = applyMove(state, { startDotId: 4, endDotId: 1, ...m2, placement: null, exteriorSide: null });
  storedPaths[2] = path2;
  positions[5] = arcLengthSplit(path2).point;

  const path3 = [positions[5], { x: 249, y: 224 }, positions[1]];
  const m3 = resolveMoveCorners(state, 5, 1, path3, getEdgePath);
  state = applyMove(state, { startDotId: 5, endDotId: 1, ...m3, placement: null, exteriorSide: null });
  storedPaths[3] = path3;

  // Ground truth, established directly against the engine: dot 3's
  // corner 1 is legal for connecting to dot 2 (the untouched, still-
  // root, genuinely-outside dot); corner 0 is not.
  assert.equal(validateMove(state, createMove(3, 2, 1, 0)).ok, true);
  assert.equal(validateMove(state, createMove(3, 2, 0, 0)).ok, false);

  // The actual regression: a real drawn curve from dot 3 heading
  // further outward (away from the loop, toward dot 2) must resolve
  // to corner 1, not corner 0.
  const joinPath = [positions[3], { x: 509, y: 219 }, positions[2]];
  const jc = resolveMoveCorners(state, 3, 2, joinPath, getEdgePath);
  assert.equal(jc.startCorner, 1, 'must resolve to the corner facing the true exterior');
  const validation = validateMove(state, createMove(3, 2, jc.startCorner, jc.endCorner));
  assert.equal(validation.ok, true, `join should be legal: ${JSON.stringify(validation.violations)}`);
});
