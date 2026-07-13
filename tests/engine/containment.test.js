/* ================================================================
   tests/engine/containment.test.js — Sprouts v0.9.2 (PR 5)

   Tests for js/engine/containment.js. Hand-built fixtures throughout
   — same discipline as faces.test.js: fixtures are constructed
   directly, not via applyMove(), so a coordinated bug between the
   reducer and this module can't slip through unnoticed.

   Reminder (PR 10 update): merge is still verified only for two ROOT
   components; split now covers NON-EMPTY K (enclosure) as well as
   K = ∅. The PR 10 tests at the end of this file exercise the
   enclosure path directly with hand-built fixtures.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceFaces, cornerFace } from '../../js/engine/faces.js';
import {
  resolveOuterFaceAnchor,
  resolveParentAnchor,
  computeK,
  splitDescendantFaces,
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

  // PR 10a: the merge now reads BOTH sides' OWN pre-move face to
  // decide whether that side's outer face was the one touched. Two
  // isolated roots: each one's own (trivial) face is necessarily the
  // one touched — verified directly via traceFaces, not assumed.
  const oldFaces = traceFaces([], [[], []]);
  const startFace = oldFaces.find(f => f.component === 0);
  const endFace = oldFaces.find(f => f.component === 1);

  const newEdges = [{ a: 0, b: 2 }, { a: 1, b: 2 }];
  const newRotations = [[0], [2], [1, 3]];
  const newFaces = traceFaces(newEdges, newRotations);
  const newDarts = [0, 1, 2, 3];

  const result = updateContainmentForMerge(
    outerFaceAnchor, parentAnchor, 0, 1, oldFaces, startFace, endFace, newFaces, newDarts
  );

  assert.deepEqual(Object.keys(result.outerFaceAnchor), ['0']);
  assert.deepEqual(Object.keys(result.parentAnchor), ['0']);
  assert.equal(result.parentAnchor[0], null); // still a root
  assert.deepEqual(result.outerFaceAnchor[0], { kind: 'dart', value: 0 }); // fused face's smallest dart
});

test('updateContainmentForMerge: surviving representative is always the smaller id, regardless of argument order', () => {
  // Two isolated roots again (own face always touched for both), but
  // called with repA/repB swapped, to isolate the id-ordering logic
  // from the fused/unfused decision (already covered above).
  const outerFaceAnchor = { 3: { kind: 'dart', value: 200 }, 5: { kind: 'dart', value: 100 } };
  const parentAnchor = { 3: null, 5: null };
  const oldFaces = [
    { component: 5, darts: [100] },
    { component: 3, darts: [200] },
  ];
  const startFace = oldFaces.find(f => f.component === 5); // repA(5)'s own face
  const endFace = oldFaces.find(f => f.component === 3);   // repB(3)'s own face
  const newFaces = [{ component: 3, darts: [10, 11] }];
  const result = updateContainmentForMerge(
    outerFaceAnchor, parentAnchor, 5, 3, oldFaces, startFace, endFace, newFaces, [10, 11]
  );
  assert.deepEqual(Object.keys(result.outerFaceAnchor), ['3']);
});

test('updateContainmentForMerge: absorbing an already-nested occupant preserves the host\'s real outer face (PR 10a — the Bug 2 fix)', () => {
  // Host (component 0) has TWO faces: its own true outer face (dart 0)
  // and an interior face (dart 1) hosting occupant B (component 1),
  // already nested there (parentAnchor[1] resolves into that interior
  // face). This move connects the host, drawn from a corner on its
  // INTERIOR face, to occupant B (whose own single face is always
  // "touched" trivially). The host's outer face must NOT change.
  const oldFaces = [
    { component: 0, darts: [0] },  // host's true outer face
    { component: 0, darts: [1] },  // host's interior face (hosts B)
    { component: 1, darts: [] },   // B's own (trivial) face
  ];
  const hostOuter = oldFaces[0];
  const hostInterior = oldFaces[1];
  const bOwnFace = oldFaces[2];

  const outerFaceAnchor = { 0: { kind: 'dart', value: 0 }, 1: { kind: 'vertex', value: 1 } };
  const parentAnchor = { 0: null, 1: 1 }; // B nested at dart 1 (host's interior face)

  // The move: host's corner touches its INTERIOR face (startFace);
  // B's corner touches its own (only) face (endFace).
  const startFace = hostInterior;
  const endFace = bOwnFace;

  const newFaces = [{ component: 0, darts: [0] }]; // host's outer face, untouched, still present
  // Any face containing the new darts is "the fused face" per the
  // existing search — construct it distinctly so a wrong answer
  // (accidentally using it) is detectable.
  const fusedFaceStandin = { component: 0, darts: [50, 51, 52, 53] };
  const allNewFaces = [...newFaces, fusedFaceStandin];

  const result = updateContainmentForMerge(
    outerFaceAnchor, parentAnchor, 0, 1, oldFaces, startFace, endFace, allNewFaces, [50, 51, 52, 53]
  );

  // The host's outer anchor is COMPLETELY UNCHANGED (still dart 0,
  // NOT the fused face) — this is the actual Bug 2 fix.
  assert.deepEqual(result.outerFaceAnchor[0], { kind: 'dart', value: 0 });
  assert.equal(result.parentAnchor[0], null); // host's own external relationship untouched
  assert.deepEqual(Object.keys(result.outerFaceAnchor), ['0']); // B's entry removed
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

// ── PR 10: enclosure / non-empty K ───────────────────────────────
//
// Shared fixture: component 0 is a self-loop — dot 0 with sprout dot
// 2, joined by two parallel edges (a "bigon"). Its σ:
//   edges = [{a:0,b:2},{a:0,b:2}]  → darts 0,1 (edge 0), 2,3 (edge 1)
//   rotations = [[0,2],[],[1,3]]   (dot 0 has darts 0,2; sprout 2 has 1,3)
// traceFaces gives two faces of component 0: [0,3] and [1,2]
// (verified by direct traceFaces call, not assumed). Dot 1 is an
// isolated sibling root sharing the plane's outer region.

const loopEdges = [{ a: 0, b: 2 }, { a: 0, b: 2 }];
const loopRotations = [[0, 2], [], [1, 3]];

test('computeK: a root sibling sharing the plane\'s outer region IS an occupant when that region is split', () => {
  const faces = traceFaces(loopEdges, loopRotations);
  // outerFaceAnchor for component 0 points at face [0,3] (say); dot 1
  // is an isolated root. parentAnchor: both roots (0 → ⊥, 1 → ⊥).
  const outerFaceAnchor = { 0: { kind: 'dart', value: 0 }, 1: { kind: 'vertex', value: 1 } };
  const parentAnchor = { 0: null, 1: null };
  // Host face = component 0's outer face [0,3] (the one the anchor
  // resolves to). Splitting the plane's outer region: sibling root 1
  // must appear in K.
  const hostFace = faces.find(f => f.darts.includes(0)); // [0,3]
  const K = computeK(faces, parentAnchor, hostFace, /*excludeRep=*/0, outerFaceAnchor);
  assert.deepEqual(K, [1]);
});

test('computeK: without outerFaceAnchor, the ⊥ branch is skipped (backward-compatible)', () => {
  const faces = traceFaces(loopEdges, loopRotations);
  const parentAnchor = { 0: null, 1: null };
  const hostFace = faces.find(f => f.darts.includes(0));
  // Omitting outerFaceAnchor: roots are never seen as occupants —
  // matches the pre-PR-10 behaviour exactly (empty K).
  const K = computeK(faces, parentAnchor, hostFace, 0);
  assert.deepEqual(K, []);
});

test('computeK: a genuinely nested occupant is found via its real parentAnchor (unchanged path)', () => {
  const faces = traceFaces(loopEdges, loopRotations);
  const hostFace = faces.find(f => f.darts.includes(1)); // [1,2]
  // Dot 1 nested INSIDE face [1,2] via a real dart anchor (dart 1).
  const parentAnchor = { 0: null, 1: 1 };
  const outerFaceAnchor = { 0: { kind: 'dart', value: 0 }, 1: { kind: 'vertex', value: 1 } };
  const K = computeK(faces, parentAnchor, hostFace, 0, outerFaceAnchor);
  assert.deepEqual(K, [1]);
});

test('splitDescendantFaces: returns the two new faces ordered by smallest dart', () => {
  const faces = traceFaces(loopEdges, loopRotations);
  // The move's new darts are all four (0..3) here. Both faces of
  // component 0 contain some of them, so both are descendants.
  // Ordered by smallest dart: [0,3] (min 0) before [1,2] (min 1).
  const descendants = splitDescendantFaces(faces, 0, [0, 1, 2, 3]);
  assert.equal(descendants.length, 2);
  assert.equal(Math.min(...descendants[0].darts), 0);
  assert.equal(Math.min(...descendants[1].darts), 1);
});

test('updateContainmentForSplit: an occupant on the INTERIOR side becomes nested; on the EXTERIOR side stays a root', () => {
  const oldFaces = traceFaces([], [[], [], []]); // pre-move: 3 isolated dots
  const newFaces = traceFaces(loopEdges, loopRotations); // post-move
  // Pre-move anchors: three roots (0,1,2 all ⊥). The split touches
  // component 0's own (trivial) outer face.
  const outerFaceAnchor = { 0: { kind: 'vertex', value: 0 }, 1: { kind: 'vertex', value: 1 }, 2: { kind: 'vertex', value: 2 } };
  const parentAnchor = { 0: null, 1: null, 2: null };
  const splitFace = oldFaces.find(f => f.component === 0); // dot 0's trivial face
  // K = {1, 2}; π sends 1 → side 1 (interior), 2 → side 2; exterior
  // side is 2. Descendants ordered [0,3]=side1, [1,2]=side2.
  const result = updateContainmentForSplit(
    outerFaceAnchor, parentAnchor, 0, oldFaces, splitFace, newFaces, [0, 1, 2, 3],
    /*K=*/[1, 2], /*placement=*/{ 1: 1, 2: 2 }, /*exteriorSide=*/2
  );
  // Occupant 1 (interior, side 1) → anchored to side-1 face's dart (0).
  assert.equal(result.parentAnchor[1], 0);
  // Occupant 2 (exterior, side 2) → stays a root (⊥ / null).
  assert.equal(result.parentAnchor[2], null);
  // Touched component 0 remains a root itself.
  assert.equal(result.parentAnchor[0], null);
});

test('updateContainmentForSplit: swapping which abstract side is exterior keeps exterior occupants as roots', () => {
  const oldFaces = traceFaces([], [[], [], []]);
  const newFaces = traceFaces(loopEdges, loopRotations);
  const outerFaceAnchor = { 0: { kind: 'vertex', value: 0 }, 1: { kind: 'vertex', value: 1 }, 2: { kind: 'vertex', value: 2 } };
  const parentAnchor = { 0: null, 1: null, 2: null };
  const splitFace = oldFaces.find(f => f.component === 0);
  // Now occupant 1 → side 2 (interior), occupant 2 → side 1, and the
  // EXTERIOR is side 1. So occupant 2 stays a root; occupant 1 nests.
  const result = updateContainmentForSplit(
    outerFaceAnchor, parentAnchor, 0, oldFaces, splitFace, newFaces, [0, 1, 2, 3],
    [1, 2], { 1: 2, 2: 1 }, /*exteriorSide=*/1
  );
  assert.equal(result.parentAnchor[2], null);     // exterior → root
  assert.equal(result.parentAnchor[1], 1);         // interior side 2 → dart 1
});

test('updateContainmentForSplit: K = ∅ still works unchanged (ordinary lone self-loop)', () => {
  const oldFaces = traceFaces([], [[]]);          // 1 isolated dot
  const newFaces = traceFaces(loopEdges, loopRotations);
  const outerFaceAnchor = { 0: { kind: 'vertex', value: 0 } };
  const parentAnchor = { 0: null };
  const splitFace = oldFaces.find(f => f.component === 0);
  const result = updateContainmentForSplit(
    outerFaceAnchor, parentAnchor, 0, oldFaces, splitFace, newFaces, [0, 1, 2, 3]
    // no K, placement, or exteriorSide — all default
  );
  // Component 0 stays a root; its outer face re-anchors to a descendant.
  assert.equal(result.parentAnchor[0], null);
  assert.equal(result.outerFaceAnchor[0].kind, 'dart');
});
