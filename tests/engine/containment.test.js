/* ================================================================
   tests/engine/containment.test.js — Sprouts v0.9.2 (PR 5)

   Tests for js/engine/containment.js. Hand-built fixtures throughout
   — same discipline as faces.test.js: fixtures are constructed
   directly, not via applyMove(), so a coordinated bug between the
   reducer and this module can't slip through unnoticed.

   Reminder of the PR 5 scope restriction (see containment.js's file
   header): merge is only verified for two ROOT components with no
   occupants; split is only verified for K = ∅. These tests exercise
   exactly that restricted scope, not the general (nested) case.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceFaces, cornerFace } from '../../js/engine/faces.js';
import {
  resolveOuterFaceAnchor,
  resolveParentAnchor,
  computeK,
  updateContainmentForMerge,
  updateContainmentForSplit,
  checkContainmentInvariants,
  ContainmentError,
} from '../../js/engine/containment.js';

// ── resolveOuterFaceAnchor / resolveParentAnchor ─────────────────

test('resolveOuterFaceAnchor: a vertex-token resolves to the isolated vertex\'s trivial face', () => {
  const faces = traceFaces([], [[], []]); // two isolated dots, degree 0
  const face0 = resolveOuterFaceAnchor(faces, { kind: 'vertex', value: 0 });
  const face1 = resolveOuterFaceAnchor(faces, { kind: 'vertex', value: 1 });
  assert.deepEqual(face0, { component: 0, darts: [] });
  assert.deepEqual(face1, { component: 1, darts: [] });
});

test('resolveOuterFaceAnchor: a dart anchor resolves to the face containing that dart', () => {
  // Bridge fixture from faces.test.js: one face, all 4 darts.
  const edges = [{ a: 0, b: 2 }, { a: 1, b: 2 }];
  const rotations = [[0], [2], [1, 3]];
  const faces = traceFaces(edges, rotations);
  const resolved = resolveOuterFaceAnchor(faces, { kind: 'dart', value: 3 });
  assert.deepEqual(resolved.darts, [0, 3, 2, 1]);
});

test('resolveParentAnchor: null resolves to null (⊥, the plane)', () => {
  const faces = traceFaces([], [[], []]);
  assert.equal(resolveParentAnchor(faces, null), null);
});

test('resolveParentAnchor: a dart resolves to its face', () => {
  const edges = [{ a: 0, b: 1 }, { a: 0, b: 1 }]; // self-loop bigon
  const rotations = [[0, 2], [1, 3]];
  const faces = traceFaces(edges, rotations);
  const resolved = resolveParentAnchor(faces, 3);
  assert.deepEqual(resolved.darts, [0, 3]);
});

// ── computeK ──────────────────────────────────────────────────────

test('computeK: returns occupants whose parentAnchor resolves to the given host face, excluding the touched component', () => {
  // Bigon (component 0/1) as the "host"; a separate isolated dot 2
  // occupying its fused face; dot 3 elsewhere (excluded, wrong face).
  const edges = [{ a: 0, b: 1 }, { a: 0, b: 1 }];
  const rotations = [[0, 2], [1, 3], [], []]; // dot2, dot3 isolated (indices shifted to match a 4-dot state)
  const faces = traceFaces(edges, rotations);
  const hostFace = faces.find(f => f.darts.includes(0));

  const parentAnchor = {
    0: null,       // touched component itself (root) — excluded regardless
    2: 0,          // dot 2 occupies the dart-0 face (hostFace)
    3: null,       // dot 3 is a root elsewhere — not an occupant of hostFace
  };

  const occupants = computeK(faces, parentAnchor, hostFace, /* excludeRep */ 0);
  assert.deepEqual(occupants, [2]);
});

test('computeK: returns an empty array when nothing occupies the host face', () => {
  const edges = [{ a: 0, b: 1 }, { a: 0, b: 1 }];
  const rotations = [[0, 2], [1, 3]];
  const faces = traceFaces(edges, rotations);
  const hostFace = faces.find(f => f.darts.includes(0));
  const parentAnchor = { 0: null };
  assert.deepEqual(computeK(faces, parentAnchor, hostFace, 0), []);
});

// ── updateContainmentForMerge ──────────────────────────────────────

test('updateContainmentForMerge: two isolated roots merging via a bridge move', () => {
  // Before: dots 0, 1 both isolated roots. Move connects them via
  // sprout 2 (edges {a:0,b:2},{a:1,b:2}) — exactly PR 3's bridge case.
  const outerFaceAnchor = { 0: { kind: 'vertex', value: 0 }, 1: { kind: 'vertex', value: 1 } };
  const parentAnchor = { 0: null, 1: null };

  const newEdges = [{ a: 0, b: 2 }, { a: 1, b: 2 }];
  const newRotations = [[0], [2], [1, 3]];
  const newFaces = traceFaces(newEdges, newRotations);
  const newDarts = [0, 1, 2, 3];

  const result = updateContainmentForMerge(outerFaceAnchor, parentAnchor, 0, 1, newFaces, newDarts);

  assert.deepEqual(Object.keys(result.outerFaceAnchor), ['0']);
  assert.deepEqual(Object.keys(result.parentAnchor), ['0']);
  assert.equal(result.parentAnchor[0], null); // still a root
  assert.deepEqual(result.outerFaceAnchor[0], { kind: 'dart', value: 0 }); // fused face's smallest dart
});

test('updateContainmentForMerge: surviving representative is always the smaller id, regardless of argument order', () => {
  const outerFaceAnchor = { 3: { kind: 'vertex', value: 3 }, 5: { kind: 'vertex', value: 5 } };
  const parentAnchor = { 3: null, 5: null };
  const newFaces = [{ component: 3, darts: [10, 11] }];
  const result = updateContainmentForMerge(outerFaceAnchor, parentAnchor, 5, 3, newFaces, [10, 11]);
  assert.deepEqual(Object.keys(result.outerFaceAnchor), ['3']);
});

// ── updateContainmentForSplit ──────────────────────────────────────

test('updateContainmentForSplit: self-loop on an isolated root re-anchors outerFaceAnchor to one of the two new faces', () => {
  // Before: dot 0 isolated root, its own trivial face is the outer face.
  const outerFaceAnchor = { 0: { kind: 'vertex', value: 0 } };
  const parentAnchor = { 0: null };

  const oldFaces = traceFaces([], [[]]); // dot 0 alone, trivial face
  const splitFace = oldFaces[0]; // the trivial face

  // After: self-loop bigon (PR 3's exact fixture).
  const newEdges = [{ a: 0, b: 1 }, { a: 0, b: 1 }];
  const newRotations = [[0, 2], [1, 3]];
  const newFaces = traceFaces(newEdges, newRotations);
  const newDarts = [0, 1, 2, 3];

  const result = updateContainmentForSplit(outerFaceAnchor, parentAnchor, 0, oldFaces, splitFace, newFaces, newDarts);

  // Deterministic rule: the new face with the smaller minimum dart wins.
  assert.deepEqual(result.outerFaceAnchor[0], { kind: 'dart', value: 0 });
  assert.equal(result.parentAnchor[0], null); // unchanged — still a root
});

test('updateContainmentForSplit: leaves outerFaceAnchor untouched when a DIFFERENT face split', () => {
  // Simulates: component's outer face is NOT the one that split (a
  // split of some other, non-outer face). outerFaceAnchor must be
  // left exactly as it was.
  const outerFaceAnchor = { 0: { kind: 'dart', value: 99 } };
  const parentAnchor = { 0: null };
  const oldFaces = [
    { component: 0, darts: [99] },      // the (unrelated) outer face
    { component: 0, darts: [5, 6] },    // the face that actually split
  ];
  const splitFace = oldFaces[1];
  const newFaces = [
    { component: 0, darts: [99] },
    { component: 0, darts: [5, 100] },
    { component: 0, darts: [101, 6] },
  ];
  const newDarts = [100, 101];

  const result = updateContainmentForSplit(outerFaceAnchor, parentAnchor, 0, oldFaces, splitFace, newFaces, newDarts);
  assert.deepEqual(result.outerFaceAnchor[0], { kind: 'dart', value: 99 }); // unchanged
});

// ── checkContainmentInvariants (I-1…I-4) ──────────────────────────

test('checkContainmentInvariants: valid seeded state passes cleanly', () => {
  const state = {
    outerFaceAnchor: { 0: { kind: 'vertex', value: 0 }, 1: { kind: 'vertex', value: 1 } },
    parentAnchor: { 0: null, 1: null },
  };
  const faces = traceFaces([], [[], []]);
  const components = [[0], [1]];
  const result = checkContainmentInvariants(state, faces, components);
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('checkContainmentInvariants: I-1 catches a missing key', () => {
  const state = {
    outerFaceAnchor: { 0: { kind: 'vertex', value: 0 } }, // dot 1 missing
    parentAnchor: { 0: null, 1: null },
  };
  const faces = traceFaces([], [[], []]);
  const components = [[0], [1]];
  const result = checkContainmentInvariants(state, faces, components);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === ContainmentError.KEY_SET_MISMATCH));
});

test('checkContainmentInvariants: I-1 catches an orphaned key', () => {
  const state = {
    outerFaceAnchor: { 0: { kind: 'vertex', value: 0 }, 1: { kind: 'vertex', value: 1 }, 99: { kind: 'vertex', value: 99 } },
    parentAnchor: { 0: null, 1: null, 99: null },
  };
  const faces = traceFaces([], [[], []]);
  const components = [[0], [1]];
  const result = checkContainmentInvariants(state, faces, components);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === ContainmentError.KEY_SET_MISMATCH && v.rep === 99));
});

test('checkContainmentInvariants: I-2 catches an outer-face anchor resolving to the WRONG component', () => {
  const state = {
    outerFaceAnchor: { 0: { kind: 'vertex', value: 1 } }, // wrong! points at dot 1's face
    parentAnchor: { 0: null, 1: null },
  };
  const faces = traceFaces([], [[], []]);
  const components = [[0], [1]];
  // fabricate a mismatched key set on purpose (only checking I-2 here)
  state.outerFaceAnchor[1] = { kind: 'vertex', value: 1 };
  const result = checkContainmentInvariants(state, faces, components);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === ContainmentError.OUTER_FACE_UNSOUND && v.rep === 0));
});

test('checkContainmentInvariants: I-3 catches a parentAnchor resolving to its OWN component', () => {
  // Bigon (dots 0,1), dot 0's own component wrongly claims a parent
  // dart from within itself.
  const edges = [{ a: 0, b: 1 }, { a: 0, b: 1 }];
  const rotations = [[0, 2], [1, 3]];
  const faces = traceFaces(edges, rotations);
  const state = {
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 } },
    parentAnchor: { 0: 3 }, // dart 3 is IN component 0 itself — invalid
  };
  const components = [[0, 1]];
  const result = checkContainmentInvariants(state, faces, components);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === ContainmentError.PARENT_UNSOUND));
});

test('checkContainmentInvariants: I-4 catches a parent-chain cycle', () => {
  // Deliberately broken fixture: component 0's parentAnchor is a
  // dart that belongs to component 0 itself — an immediate
  // self-cycle. (This also trips I-3, since a parent dart must
  // belong to a DIFFERENT component — both firing on one broken
  // fixture is fine; checkInvariants reports every violation it
  // finds, not just one.)
  const edges = [{ a: 0, b: 1 }, { a: 0, b: 1 }];
  const rotations = [[0, 2], [1, 3]];
  const faces = traceFaces(edges, rotations);
  const state = {
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 } },
    parentAnchor: { 0: 0 }, // dart 0 belongs to component 0 — self-cycle
  };
  const components = [[0, 1]];

  const result = checkContainmentInvariants(state, faces, components);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(
    v => v.rule === ContainmentError.PARENT_UNSOUND || v.rule === ContainmentError.FOREST_CYCLE
  ));
});
