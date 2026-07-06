/* ================================================================
   tests/engine/faces.test.js — Sprouts v0.9.2 (PR 3)

   Tests for js/engine/faces.js — traceFaces() and getComponents().

   All fixtures here are HAND-BUILT (edges + rotations arrays written
   directly), never produced via applyMove(). This is deliberate, for
   the same reason PR 1's audit required independent origin-
   convention fixtures: PR 2's reducer can only ever produce
   append-only rotations, which never exercises the interesting
   multi-dart-per-vertex cases this tracer must get right, and a
   fixture built by the very reducer under indirect test would risk
   a coordinated blind spot.

   Every non-trivial expected orbit below is hand-traced in the
   comments next to its test, dart by dart, so the expected value is
   independently checkable — not just asserted.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceFaces, getComponents } from '../../js/engine/faces.js';
import { applyMove } from '../../js/engine/reducer.js';
import { createMove } from '../../js/engine/move.js';
import { buildInitialTopology } from '../../js/engine/regions.js';

// ── getComponents ────────────────────────────────────────────────

test('getComponents: isolated dots are each their own component', () => {
  const components = getComponents([], [0, 1, 2]);
  assert.deepEqual(components, [[0], [1], [2]]);
});

test('getComponents: dots joined by an edge form one component', () => {
  const components = getComponents([{ a: 0, b: 1 }], [0, 1, 2]);
  assert.deepEqual(components, [[0, 1], [2]]);
});

test('getComponents: components sorted by smallest member; members sorted ascending', () => {
  const edges = [{ a: 3, b: 5 }, { a: 1, b: 0 }];
  const components = getComponents(edges, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(components, [[0, 1], [2], [3, 5], [4]]);
});

// ── traceFaces: degree-0 (isolated vertex) base case ─────────────

test('traceFaces: two isolated dots each produce one trivial (empty-walk) face', () => {
  // Spec §2.4: a degree-0 vertex has an empty rotation and exactly
  // one face. No darts exist at all here (dartCount = 0), so the
  // dart-orbit walk never runs — both faces come entirely from the
  // explicit isolated-vertex pass. V=1,E=0 per component => Euler
  // Fc = 2-Vc+Ec = 2-1+0 = 1, matching one face each.
  const edges = [];
  const rotations = [[], []];
  const faces = traceFaces(edges, rotations);

  assert.equal(faces.length, 2);
  assert.deepEqual(faces[0], { component: 0, darts: [] });
  assert.deepEqual(faces[1], { component: 1, darts: [] });
});

// ── traceFaces: bridge / tree case ────────────────────────────────
//
// Two isolated dots u=0, v=1 joined via sprout w=2 (one normal
// Sprouts move). Darts, per darts.js's pinned convention:
//   edge0={a:0,b:2}: dart0 origin 0, dart1 origin 2
//   edge1={a:1,b:2}: dart2 origin 1, dart3 origin 2
// rotations: [0]=[0], [1]=[2], [2]=[1,3] (PR 2's append order).
//
// Hand trace, φ(d) = next-after-alpha(d) in alpha(d)'s rotation:
//   φ(0): alpha(0)=1, origin 2, rotations[2]=[1,3], next after 1 = 3
//   φ(3): alpha(3)=2, origin 1, rotations[1]=[2],   next after 2 = 2 (wraps, len 1)
//   φ(2): alpha(2)=3, origin 2, rotations[2]=[1,3], next after 3 = 1 (wraps)
//   φ(1): alpha(1)=0, origin 0, rotations[0]=[0],   next after 0 = 0 (wraps, len 1)
// Orbit from d=0: 0 -> 3 -> 2 -> 1 -> back to 0. One face, all 4
// darts. A tree has exactly one face regardless of embedding
// details (its complement in the plane is always connected) — this
// is a case that CANNOT distinguish "next" vs "previous" (see
// faces.js's file header), included here for orbit-content and
// partition correctness, not convention disambiguation.

test('traceFaces: bridge/tree — one face using all 4 darts, in the hand-traced order', () => {
  const edges = [{ a: 0, b: 2 }, { a: 1, b: 2 }];
  const rotations = [[0], [2], [1, 3]];
  const faces = traceFaces(edges, rotations);

  assert.equal(faces.length, 1);
  assert.deepEqual(faces[0].darts, [0, 3, 2, 1]);
});

test('traceFaces: bridge/tree — Euler holds (V=3, E=2, F=1)', () => {
  const edges = [{ a: 0, b: 2 }, { a: 1, b: 2 }];
  const rotations = [[0], [2], [1, 3]];
  const faces = traceFaces(edges, rotations);
  const V = 3, E = edges.length, F = faces.length;
  assert.equal(V - E + F, 2);
});

// ── traceFaces: self-loop bigon (double-boundary/merge oracle case) ──
//
// A self-loop on isolated dot v=0 creates sprout w=1 via TWO
// parallel edges (edge0={a:0,b:1}, edge1={a:0,b:1} — both share
// a=0, since a self-loop's start/end dot is the same). Darts:
//   edge0: dart0 origin 0, dart1 origin 1
//   edge1: dart2 origin 0, dart3 origin 1
// rotations: [0]=[0,2] (both new 'a' darts, edge-creation order),
//            [1]=[1,3] (both new 'b' darts, edge-creation order).
// This graph is 2 parallel edges between 2 vertices (a "bigon") —
// NOT a graph-theoretic self-loop (no edge has a===b after
// subdivision) — forming one cycle. Euler expects F=2 (inside,
// outside), and this genuinely exercises degree-2 rotations at BOTH
// vertices simultaneously (unlike the bridge case above, which never
// had two darts competing at the same vertex within one orbit step).
//
// Hand trace:
//   φ(0): alpha(0)=1, origin 1, rotations[1]=[1,3], next after 1 = 3
//   φ(3): alpha(3)=2, origin 0, rotations[0]=[0,2], next after 2 = 0 (wraps)
//   Orbit from d=0: 0 -> 3 -> back to 0. Face A = [0,3].
//   φ(1): alpha(1)=0, origin 0, rotations[0]=[0,2], next after 0 = 2
//   φ(2): alpha(2)=3, origin 1, rotations[1]=[1,3], next after 3 = 1 (wraps)
//   Orbit from d=1: 1 -> 2 -> back to 1. Face B = [1,2].
// Every edge contributes one dart to each face (0 and 2 are edge0/
// edge1's 'a' sides, split one-per-face; likewise 1 and 3) — the
// correct topology for a bigon, where both edges border both faces.

test('traceFaces: self-loop bigon — two faces, hand-traced dart contents', () => {
  const edges = [{ a: 0, b: 1 }, { a: 0, b: 1 }];
  const rotations = [[0, 2], [1, 3]];
  const faces = traceFaces(edges, rotations);

  assert.equal(faces.length, 2);
  assert.deepEqual(faces[0].darts, [0, 3]);
  assert.deepEqual(faces[1].darts, [1, 2]);
});

test('traceFaces: self-loop bigon — Euler holds (V=2, E=2, F=2)', () => {
  const edges = [{ a: 0, b: 1 }, { a: 0, b: 1 }];
  const rotations = [[0, 2], [1, 3]];
  const faces = traceFaces(edges, rotations);
  const V = 2, E = edges.length, F = faces.length;
  assert.equal(V - E + F, 2);
});

// ── traceFaces: triangle (3-cycle) ────────────────────────────────
//
// Triangle 0-1-2-0. edge0={a:0,b:1}, edge1={a:1,b:2}, edge2={a:2,b:0}.
// Darts: 0(orig0),1(orig1) / 2(orig1),3(orig2) / 4(orig2),5(orig0).
// rotations (hand-chosen, representing ONE specific planar
// embedding): [0]=[0,5], [1]=[1,2], [2]=[3,4].
//
// Hand trace:
//   φ(0): alpha(0)=1, origin 1, rotations[1]=[1,2], next after 1 = 2
//   φ(2): alpha(2)=3, origin 2, rotations[2]=[3,4], next after 3 = 4
//   φ(4): alpha(4)=5, origin 0, rotations[0]=[0,5], next after 5 = 0 (wraps)
//   Orbit from d=0: 0 -> 2 -> 4 -> back to 0. Face A = [0,2,4].
//   φ(1): alpha(1)=0, origin 0, rotations[0]=[0,5], next after 0 = 5
//   φ(5): alpha(5)=4, origin 2, rotations[2]=[3,4], next after 4 = 3 (wraps)
//   φ(3): alpha(3)=2, origin 1, rotations[1]=[1,2], next after 2 = 1 (wraps)
//   Orbit from d=1: 1 -> 5 -> 3 -> back to 1. Face B = [1,5,3].
// Two faces of length 3 each (interior + exterior of the triangle),
// using all 6 darts. Every vertex here has degree exactly 2, so (as
// documented in faces.js) this case cannot distinguish "next" vs
// "previous" either — included for orbit-content/partition/Euler
// correctness on a genuine cycle, not convention disambiguation.

test('traceFaces: triangle — two faces of length 3, hand-traced dart contents', () => {
  const edges = [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }];
  const rotations = [[0, 5], [1, 2], [3, 4]];
  const faces = traceFaces(edges, rotations);

  assert.equal(faces.length, 2);
  assert.deepEqual(faces[0].darts, [0, 2, 4]);
  assert.deepEqual(faces[1].darts, [1, 5, 3]);
});

test('traceFaces: triangle — Euler holds (V=3, E=3, F=2)', () => {
  const edges = [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }];
  const rotations = [[0, 5], [1, 2], [3, 4]];
  const faces = traceFaces(edges, rotations);
  const V = 3, E = edges.length, F = faces.length;
  assert.equal(V - E + F, 2);
});

// ── traceFaces: partition invariant ───────────────────────────────

test('traceFaces: every dart appears in exactly one face, exactly once (across all fixtures above)', () => {
  const fixtures = [
    { edges: [{ a: 0, b: 2 }, { a: 1, b: 2 }], rotations: [[0], [2], [1, 3]] },
    { edges: [{ a: 0, b: 1 }, { a: 0, b: 1 }], rotations: [[0, 2], [1, 3]] },
    { edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }], rotations: [[0, 5], [1, 2], [3, 4]] },
  ];

  for (const { edges, rotations } of fixtures) {
    const faces = traceFaces(edges, rotations);
    const totalDarts = 2 * edges.length;
    const seen = new Array(totalDarts).fill(0);
    faces.forEach(f => f.darts.forEach(d => { seen[d]++; }));
    for (let d = 0; d < totalDarts; d++) {
      assert.equal(seen[d], 1, `dart ${d} appeared ${seen[d]} times`);
    }
  }
});

// ── traceFaces: determinism ────────────────────────────────────────

test('traceFaces: same input produces byte-identical output across repeated calls', () => {
  const edges = [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }];
  const rotations = [[0, 5], [1, 2], [3, 4]];

  const first = traceFaces(edges, rotations);
  const second = traceFaces(edges, rotations);
  assert.deepEqual(first, second);
});

test('traceFaces: faces ordered by increasing smallest dart', () => {
  const edges = [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }];
  const rotations = [[0, 5], [1, 2], [3, 4]];
  const faces = traceFaces(edges, rotations);

  const smallestDarts = faces.map(f => Math.min(...f.darts));
  const sorted = [...smallestDarts].sort((a, b) => a - b);
  assert.deepEqual(smallestDarts, sorted);
});

// ── Integration: real reducer output, not a hand-built fixture ────
//
// PR 2's reducer produces valid (append-only) rotations for genuine
// gameplay. This doesn't test convention (see file header — PR 2
// never exceeds degree 2 without a 3rd move touching the same dot),
// but confirms the tracer doesn't just work on hand-picked fixtures —
// it must also produce a structurally valid result (partition +
// per-component Euler) on whatever the real reducer emits.

test('traceFaces: integration — Euler holds per component on real applyMove() output', () => {
  let state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }, { id: 2, lives: 3 }],
    edges: [], nextDotId: 3, moves: [], currentPlayer: 0,
    initialDotCount: 3, startingPlayer: 0,
    ...buildInitialTopology(3),
  };
  state = applyMove(state, createMove(0, 1));
  state = applyMove(state, createMove(0, 2)); // dot 0 now degree 2

  const dotIds = state.dots.map(d => d.id);
  const components = getComponents(state.edges, dotIds);
  const faces = traceFaces(state.edges, state.rotations);

  for (const members of components) {
    const Vc = members.length;
    const Ec = state.edges.filter(e => members.includes(e.a)).length;
    const Fc = faces.filter(f => f.component === members[0]).length;
    assert.equal(Vc - Ec + Fc, 2, `Euler failed for component rep ${members[0]}`);
  }

  // Partition still holds over the whole (real) dart set too.
  const totalDarts = 2 * state.edges.length;
  const seen = new Array(totalDarts).fill(0);
  faces.forEach(f => f.darts.forEach(d => { seen[d]++; }));
  seen.forEach((count, d) => assert.equal(count, 1, `dart ${d} appeared ${count} times`));
});
