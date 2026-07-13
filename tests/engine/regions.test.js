/* ================================================================
   tests/engine/regions.test.js — Sprouts v0.9.2 (PR 6, cutover)

   Tests for js/engine/regions.js.

   v0.9.2 PR 6 section: buildInitialTopology() (now seeding only
   rotations/outerFaceAnchor/parentAnchor) and the five query
   functions, now reading the derived view (σ + faces + containment)
   instead of the deleted legacy regions/boundaries arrays.

   Fixtures here are REAL, built via scripted applyMove() calls,
   wherever the scenario is actually reachable through gameplay —
   not hand-declared, per the lesson from the v0.9.1 fixture-
   construction failure this file's header used to describe (two
   hand-built "multi-region" structures that turned out to be invalid
   planar configurations). That problem cannot recur here: derived-
   view fixtures produced by the real reducer are correct by
   construction.

   One exception: areDotsInSameRegion's "occupant" case (a component
   occupying a specific non-outer face of another) is NOT reachable
   via applyMove() today — PR 5's containment update is restricted to
   root-merges and K=empty splits, so parentAnchor never becomes
   non-null for anything real gameplay can produce (see
   containment.js's file header for the closed-scope argument). That
   branch is hand-built here, same discipline containment.test.js
   already uses for logic beyond the reducer's current reach.

   checkInvariantsV2 (I-1…I-8) and the P-O2 exhaustive-walk section
   are UNCHANGED from PR 5/5b — neither references anything removed
   by this cutover.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialTopology,
  getBoundaryForDot,
  getRegionForDot,
  areDotsInSameRegion,
  areDotsOnSameBoundary,
  getBoundariesForRegion,
  checkInvariantsV2,
  TopologyErrorV2,
} from '../../js/engine/regions.js';
import { applyMove } from '../../js/engine/reducer.js';
import { createMove } from '../../js/engine/move.js';
import { ContainmentError, computeK } from '../../js/engine/containment.js';
import { getComponents, traceFaces, cornerFace } from '../../js/engine/faces.js';
import { validateMove } from '../../js/engine/rules.js';

function scriptedState(dotCount) {
  return {
    dots: Array.from({ length: dotCount }, (_, i) => ({ id: i, lives: 3 })),
    edges: [], nextDotId: dotCount, moves: [], currentPlayer: 0,
    initialDotCount: dotCount, startingPlayer: 0,
    ...buildInitialTopology(dotCount),
  };
}

// ── buildInitialTopology ──────────────────────────────────────────

test('buildInitialTopology: seeds one empty rotation per dot (degree-0 start)', () => {
  const topo = buildInitialTopology(4);
  assert.equal(topo.rotations.length, 4);
  topo.rotations.forEach(rotation => assert.deepEqual(rotation, []));
});

test('buildInitialTopology: seeds every dot as its own root component', () => {
  const topo = buildInitialTopology(3);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(topo.outerFaceAnchor[i], { kind: 'vertex', value: i });
    assert.equal(topo.parentAnchor[i], null);
  }
});

test('buildInitialTopology: no longer returns the legacy regions/boundaries/counters', () => {
  const topo = buildInitialTopology(2);
  assert.equal('regions' in topo, false);
  assert.equal('boundaries' in topo, false);
  assert.equal('nextRegionId' in topo, false);
  assert.equal('nextBoundaryId' in topo, false);
});

test('buildInitialTopology: works correctly for the minimum case of 1 dot', () => {
  const topo = buildInitialTopology(1);
  assert.equal(topo.rotations.length, 1);
  assert.deepEqual(topo.rotations[0], []);
});

// ── getBoundaryForDot / getRegionForDot ───────────────────────────

test('getBoundaryForDot / getRegionForDot: isolated dots each get their own (trivial) boundary/region', () => {
  const state = scriptedState(3);
  const b0 = getBoundaryForDot(state, 0);
  const b1 = getBoundaryForDot(state, 1);
  const b2 = getBoundaryForDot(state, 2);
  assert.notEqual(b0, null);
  assert.notEqual(b0, b1);
  assert.notEqual(b1, b2);
  // At the single-corner level, region == boundary (finding 2).
  assert.equal(getRegionForDot(state, 0), b0);
});

test('getBoundaryForDot / getRegionForDot: return null for a dot that does not exist', () => {
  const state = scriptedState(2);
  assert.equal(getBoundaryForDot(state, 99), null);
  assert.equal(getRegionForDot(state, 99), null);
});

test('getRegionForDot: F1 is closed — a sprout gets a real, non-null answer (not the pre-cutover stale-array bug)', () => {
  // Finding F1 (recorded since v0.9.1): the legacy stored topology
  // never updated after move 1, so a sprout's region/boundary
  // lookup always returned null. The derived view has no such
  // staleness — it is recomputed from the real graph every call.
  const state = applyMove(scriptedState(2), createMove(0, 1));
  const sprout = state.dots[state.dots.length - 1];
  assert.notEqual(getRegionForDot(state, sprout.id), null);
  assert.notEqual(getBoundaryForDot(state, sprout.id), null);
});

// ── areDotsOnSameBoundary / areDotsInSameRegion — real scripted fixtures ──

test('a dot trivially shares both a boundary and a region with itself', () => {
  const state = scriptedState(1);
  assert.equal(areDotsOnSameBoundary(state, 0, 0), true);
  assert.equal(areDotsInSameRegion(state, 0, 0), true);
});

test('two dots on the SAME face of a tree share both boundary and region', () => {
  // Star/tree: dot 0 connected to dots 1, 2, 3. A tree has exactly
  // one face (faces.test.js's bridge case, generalized) — every
  // vertex's corner-0 is on that same single face.
  let state = scriptedState(4);
  state = applyMove(state, createMove(0, 1));
  state = applyMove(state, createMove(0, 2));
  state = applyMove(state, createMove(0, 3));
  assert.equal(areDotsOnSameBoundary(state, 1, 2), true);
  assert.equal(areDotsInSameRegion(state, 1, 2), true);
});

test('two dots on DIFFERENT faces of the SAME component share NEITHER boundary NOR region', () => {
  // Self-loop bigon on dot 0: two faces (per faces.test.js's hand
  // trace). dot 0's corner-0 and the sprout's corner-0 resolve to
  // different faces — this is exactly the PR 5b finding (spec D4 +
  // S7.3: different faces of one component are always different
  // regions), now confirmed from the query side, not just rules.js's
  // legality side.
  const state = applyMove(scriptedState(1), createMove(0, 0));
  const sprout = state.dots[state.dots.length - 1];
  assert.equal(areDotsOnSameBoundary(state, 0, sprout.id), false);
  assert.equal(areDotsInSameRegion(state, 0, sprout.id), false);
});

test('two dots in DIFFERENT components can still share a region (the plane\'s one shared outer region)', () => {
  // Two never-yet-connected isolated dots: different boundaries
  // (each its own trivial face), yet already in the SAME region —
  // per spec D4, ALL root components share the ONE plane's outer
  // region. This is precisely why a first move between any two dots
  // is legal at all; it's the most fundamental case of "same region,
  // different boundary," and needs no hand-building to demonstrate.
  const state = scriptedState(2);
  assert.equal(areDotsOnSameBoundary(state, 0, 1), false);
  assert.equal(areDotsInSameRegion(state, 0, 1), true);
});

test('two dots in DIFFERENT components after a real merge share both boundary and region', () => {
  const state = applyMove(scriptedState(2), createMove(0, 1));
  const sprout = state.dots[state.dots.length - 1];
  assert.equal(areDotsOnSameBoundary(state, 0, sprout.id), true);
  assert.equal(areDotsInSameRegion(state, 0, sprout.id), true);
});

test('areDotsInSameRegion: the occupant case (hand-built — not yet reachable via applyMove, see file header)', () => {
  // Component 0 (an isolated dot) occupies a specific NON-outer face
  // of component 1 (a triangle) — a nested containment scenario
  // PR 5's restricted reducer cannot yet produce, but the QUERY
  // logic must still be correct for whenever PR 5's restriction is
  // lifted. Triangle darts, per faces.test.js's hand trace: face A =
  // {0,2,4}, face B = {1,5,3}. Vertex 2's corner-0 -> dart1 ->
  // alpha(1)=0 -> face A (verified precisely, not assumed — vertex
  // 1's corner-0 actually lands on face B, a mistake caught while
  // writing this test).
  const edges = [{ a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 1 }];
  const rotations = [[], [0, 5], [1, 2], [3, 4]]; // dot0 isolated; 1,2,3 form the triangle
  const faces = traceFaces(edges, rotations);
  const faceA = faces.find(f => f.darts.includes(0)); // {0,2,4}

  const state = {
    dots: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    edges,
    rotations,
    outerFaceAnchor: {
      0: { kind: 'vertex', value: 0 },
      1: { kind: 'dart', value: 1 }, // triangle's OTHER face ({1,5,3}) is its outer face
    },
    parentAnchor: {
      0: faceA.darts[0], // dot 0 occupies face A specifically
      1: null,             // the triangle itself is a root
    },
  };

  assert.equal(areDotsInSameRegion(state, 0, 2), true); // dot0 vs vertex 2 (corner-0 IS on face A)
  assert.equal(areDotsInSameRegion(state, 0, 3), true); // vertex 3's corner-0 is also on face A
  assert.equal(areDotsOnSameBoundary(state, 0, 2), false); // still different boundaries
});

// ── getBoundariesForRegion ─────────────────────────────────────────

test('getBoundariesForRegion: an isolated dot\'s region has exactly one boundary (itself)', () => {
  const state = scriptedState(2);
  const regionId = getRegionForDot(state, 0);
  const boundaries = getBoundariesForRegion(state, regionId);
  assert.equal(boundaries.length, 1);
  assert.equal(boundaries[0].component, 0);
});

test('getBoundariesForRegion: returns an empty array for a nonexistent region id', () => {
  const state = scriptedState(1);
  assert.deepEqual(getBoundariesForRegion(state, 999999), []);
});

test('getBoundariesForRegion: includes an occupant\'s outer face (hand-built, same fixture as the occupant test above)', () => {
  const edges = [{ a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 1 }];
  const rotations = [[], [0, 5], [1, 2], [3, 4]];
  const faces = traceFaces(edges, rotations);
  const faceA = faces.find(f => f.darts.includes(0));

  const state = {
    dots: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    edges,
    rotations,
    outerFaceAnchor: { 0: { kind: 'vertex', value: 0 }, 1: { kind: 'dart', value: 1 } },
    parentAnchor: { 0: faceA.darts[0], 1: null },
  };

  const faceARegionId = getBoundaryForDot(state, 2); // vertex 2's corner-0 IS on face A
  const boundaries = getBoundariesForRegion(state, faceARegionId);
  // Host (face A) + dot 0's trivial outer face.
  assert.equal(boundaries.length, 2);
  assert.ok(boundaries.some(b => b.component === 0 && b.darts.length === 0));
});

// ── checkInvariantsV2 (I-1…I-8) — unchanged from PR 5/5b ─────────

test('checkInvariantsV2: the seeded starting state passes cleanly, for several dot counts', () => {
  [1, 2, 3, 5].forEach(n => {
    const result = checkInvariantsV2(scriptedState(n));
    assert.deepEqual(result, { ok: true, violations: [] }, `failed for ${n} dots`);
  });
});

test('checkInvariantsV2: passes after a merge move', () => {
  const state = applyMove(scriptedState(2), createMove(0, 1));
  const result = checkInvariantsV2(state);
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('checkInvariantsV2: passes after a split (self-loop) move', () => {
  const state = applyMove(scriptedState(1), createMove(0, 0));
  const result = checkInvariantsV2(state);
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('checkInvariantsV2: passes throughout a scripted multi-move game (merge, merge, self-loop)', () => {
  let state = scriptedState(3);
  state = applyMove(state, createMove(0, 1));
  assert.deepEqual(checkInvariantsV2(state), { ok: true, violations: [] });
  state = applyMove(state, createMove(0, 2));
  assert.deepEqual(checkInvariantsV2(state), { ok: true, violations: [] });
  state = applyMove(state, createMove(2, 2)); // dot 2 has 2 lives left
  assert.deepEqual(checkInvariantsV2(state), { ok: true, violations: [] });
});

test('checkInvariantsV2: I-6 catches a hand-corrupted lives value', () => {
  const state = applyMove(scriptedState(2), createMove(0, 1));
  state.dots[0].lives = 99; // corrupt directly, bypassing the reducer
  const result = checkInvariantsV2(state);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === TopologyErrorV2.LIVES_INCONSISTENT));
});

test('checkInvariantsV2: I-7 catches a hand-corrupted total-lives value', () => {
  const state = applyMove(scriptedState(2), createMove(0, 1));
  state.dots[0].lives = state.dots[0].lives - 1; // silently remove a life from nowhere
  const result = checkInvariantsV2(state);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === TopologyErrorV2.TOTAL_LIVES_WRONG));
});

test('checkInvariantsV2: propagates a containment violation (I-1) from checkContainmentInvariants', () => {
  const state = applyMove(scriptedState(2), createMove(0, 1));
  delete state.outerFaceAnchor[0]; // corrupt directly
  const result = checkInvariantsV2(state);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === ContainmentError.KEY_SET_MISMATCH));
});

// ── P-O2: exhaustive small-n bisimulation ──────────────────────────
//
// Spec §11.3 P-O2: "all legal move sequences from 1–3 initial dots
// to fixed depth; incremental apply vs. rebuild-by-replay must be
// equivalent (§10.4) after every move." For containment specifically,
// there is no "rebuild from nothing" — containment is proven not
// derivable from (edges, sigma) alone (spec Appendix A.1), so the
// only reconstruction method IS replaying moves through this same
// reducer. What's actually checkable and meaningful here: (a)
// checkInvariantsV2 holds after EVERY move of EVERY legal sequence,
// exhaustively, within the restricted scope; (b) replaying the
// identical sequence twice, independently, produces byte-identical
// resulting containment (determinism / no hidden state).
//
// "Restricted scope" here means: self-loops (always trivially
// same-face — a split) and moves between vertices in DIFFERENT
// components (a merge). PR 10 update: self-loops that ENCLOSE
// sibling components (K ≠ ∅) are now generated too, with every
// placement × exterior-side choice enumerated (see allLegalMoves) —
// the enclosure case PR 5 had deferred is now exhaustively walked.
// STILL EXCLUDED: connecting two vertices already in the SAME
// component but potentially on
// different faces of it — discovered by an earlier version of this
// very test. Resolved at PR 5b: this case is proven ALWAYS illegal
// (spec D4 + §7.3 — see rules.js's file header for the proof) and is
// now rejected by validateMove() whenever real corners are used
// (rules.test.js's SAME_COMPONENT_DIFFERENT_FACE tests). It remains
// excluded from THIS generator because allLegalMoves() only ever
// pairs vertices in DIFFERENT components (merges) or a vertex with
// itself (self-loop splits) — it never constructs a same-component
// cross-face chord, so the illegal case simply isn't generated.

function allLegalMoves(state) {
  const moves = [];
  const dotIds = state.dots.map(d => d.id);
  const components = getComponents(state.edges, dotIds);
  const componentOf = new Map();
  components.forEach(members => members.forEach(id => componentOf.set(id, members[0])));

  const faces = traceFaces(state.edges, state.rotations);

  for (const a of state.dots) {
    for (const b of state.dots) {
      if (a.id > b.id) continue; // undirected; avoid duplicate (b,a)
      const isLoop = a.id === b.id;
      if (!isLoop && componentOf.get(a.id) === componentOf.get(b.id)) continue; // excluded — see header

      const legal = isLoop ? a.lives >= 2 : (a.lives >= 1 && b.lives >= 1);
      if (!legal) continue;

      if (!isLoop) {
        // Cross-component merge. PR 10a: try EVERY real corner pair
        // and keep only the ones validateMove actually accepts,
        // instead of a single cornerless placeholder move. A
        // cornerless move's implied corner (reducer.js's
        // impliedCorner: last-inserted dart) is NOT guaranteed to
        // correspond to a region-legal drawing once occupants can be
        // nested asymmetrically after an enclosure — feeding such a
        // move straight to applyMove (which trusts its caller and
        // does not validate) silently corrupts containment. Found via
        // this exact walker producing a PARENT_UNSOUND/FOREST_CYCLE
        // after PR 10a's merge fix started reading both sides' real
        // faces — the move itself was always illegal, the walker just
        // never noticed because nothing validated it. See
        // migration-plan.md's PR 10a entry.
        const aDeg = Math.max(1, state.rotations[a.id].length);
        const bDeg = Math.max(1, state.rotations[b.id].length);
        for (let ca = 0; ca < aDeg; ca++) {
          for (let cb = 0; cb < bDeg; cb++) {
            const candidate = createMove(a.id, b.id, ca, cb);
            if (validateMove(state, candidate).ok) moves.push(candidate);
          }
        }
        continue;
      }

      // Self-loop (split). PR 10: it may enclose sibling occupants K.
      // A cornerless move can't name which side is which, so we build
      // an explicit-corner move (corner 0/0 — valid for the degree-0
      // and degree-1 dots this restricted walk produces) and, when
      // K ≠ ∅, enumerate EVERY placement × exterior-side choice, so
      // the exhaustive walk really covers all reachable enclosure
      // outcomes rather than one arbitrary drawing.
      const rep = componentOf.get(a.id);
      const loopFace = cornerFace(state.edges, state.rotations, faces, a.id, 0);
      const K = computeK(faces, state.parentAnchor, loopFace, rep, state.outerFaceAnchor);

      if (K.length === 0) {
        moves.push(createMove(a.id, a.id, 0, 0));
        continue;
      }

      // Enumerate π: K → {1,2} (all 2^|K| assignments) and, for each,
      // both choices of which side is the exterior (⊥) one.
      const assignments = enumeratePlacements(K);
      for (const placement of assignments) {
        for (const exteriorSide of [1, 2]) {
          moves.push(createMove(a.id, a.id, 0, 0, placement, exteriorSide));
        }
      }
    }
  }
  return moves;
}

/** All π: K → {1,2}, as an array of {rep: side} objects. */
function enumeratePlacements(K) {
  const out = [];
  const total = 1 << K.length; // 2^|K|
  for (let mask = 0; mask < total; mask++) {
    const p = {};
    K.forEach((rep, i) => { p[rep] = ((mask >> i) & 1) ? 2 : 1; });
    out.push(p);
  }
  return out;
}

function exhaustiveWalk(dotCount, depth, path, state, assertFn) {
  assertFn(state, path);
  if (path.length >= depth) return;
  for (const move of allLegalMoves(state)) {
    const next = applyMove(state, move);
    exhaustiveWalk(dotCount, depth, [...path, move], next, assertFn);
  }
}

test('P-O2: checkInvariantsV2 holds after every move, for every legal sequence up to depth 2, for 1-3 initial dots', () => {
  [1, 2, 3].forEach(dotCount => {
    let sequenceCount = 0;
    exhaustiveWalk(dotCount, 2, [], scriptedState(dotCount), (state, path) => {
      sequenceCount++;
      const result = checkInvariantsV2(state);
      assert.ok(result.ok, `checkInvariantsV2 failed for ${dotCount} dots, path length ${path.length}: ${JSON.stringify(result.violations)}`);
    });
    assert.ok(sequenceCount > 1, `expected more than one state visited for ${dotCount} dots`);
  });
});

test('P-O2: replaying the identical move sequence twice produces byte-identical containment (determinism)', () => {
  const moves = [createMove(0, 1), createMove(0, 2), createMove(2, 2)];

  let stateA = scriptedState(3);
  moves.forEach(m => { stateA = applyMove(stateA, m); });

  let stateB = scriptedState(3);
  moves.forEach(m => { stateB = applyMove(stateB, m); });

  assert.deepEqual(stateA.outerFaceAnchor, stateB.outerFaceAnchor);
  assert.deepEqual(stateA.parentAnchor, stateB.parentAnchor);
});
