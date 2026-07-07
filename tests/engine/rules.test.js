/* ================================================================
   tests/engine/rules.test.js — Sprouts v0.8.1

   Tests for js/engine/rules.js — the engine's pure legality rules.

   This mirrors the source layout deliberately (tests/engine/ ↔
   js/engine/) so the corresponding test file for any source file is
   always found at the same relative path.

   These are pure-function tests: no DOM, no browser, no mocking.
   The same property that makes rules.js usable by bots/replay/AI
   without a browser is what makes it directly testable under Node.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMove, isExhausted, playerForMove, RuleError } from '../../js/engine/rules.js';

// ── isExhausted ────────────────────────────────────────────────

test('isExhausted: true at exactly 0 lives', () => {
  assert.equal(isExhausted({ lives: 0 }), true);
});

test('isExhausted: true below 0 lives (defensive — see rules.js comment)', () => {
  assert.equal(isExhausted({ lives: -1 }), true);
});

test('isExhausted: false when lives remain', () => {
  assert.equal(isExhausted({ lives: 1 }), false);
  assert.equal(isExhausted({ lives: 3 }), false);
});

// ── playerForMove ──────────────────────────────────────────────

test('playerForMove: alternates strictly, starting at player 0', () => {
  assert.equal(playerForMove(0), 0);
  assert.equal(playerForMove(1), 1);
  assert.equal(playerForMove(2), 0);
  assert.equal(playerForMove(3), 1);
});

test('playerForMove: respects a non-default starting player', () => {
  assert.equal(playerForMove(0, 1), 1);
  assert.equal(playerForMove(1, 1), 0);
});

// ── validateMove: existence checks ─────────────────────────────

test('validateMove: rejects a move where startDotId does not exist', () => {
  const state = { dots: [{ id: 0, lives: 3 }] };
  const result = validateMove(state, { startDotId: 99, endDotId: 0, regionId: 0 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { rule: RuleError.DOT_NOT_FOUND, dotId: 99 },
  ]);
});

test('validateMove: rejects a move where endDotId does not exist', () => {
  const state = { dots: [{ id: 0, lives: 3 }] };
  const result = validateMove(state, { startDotId: 0, endDotId: 99, regionId: 0 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { rule: RuleError.DOT_NOT_FOUND, dotId: 99 },
  ]);
});

test('validateMove: a nonexistent self-loop dot reports exactly one violation, not two', () => {
  // startDotId === endDotId, so the existence check must not fire twice
  // for the same missing id.
  const state = { dots: [] };
  const result = validateMove(state, { startDotId: 5, endDotId: 5, regionId: 0 });
  assert.equal(result.violations.length, 1);
  assert.deepEqual(result.violations, [
    { rule: RuleError.DOT_NOT_FOUND, dotId: 5 },
  ]);
});

test('validateMove: missing start does not block checking a real end dot', () => {
  const state = { dots: [{ id: 1, lives: 0 }] };
  const result = validateMove(state, { startDotId: 99, endDotId: 1, regionId: 0 });
  assert.equal(result.violations.length, 2);
  assert.deepEqual(result.violations, [
    { rule: RuleError.DOT_NOT_FOUND, dotId: 99 },
    { rule: RuleError.INSUFFICIENT_LIVES, dotId: 1 },
  ]);
});

// ── validateMove: lives checks ─────────────────────────────────

test('validateMove: normal move needs >=1 life on each distinct endpoint', () => {
  const state = { dots: [{ id: 0, lives: 1 }, { id: 1, lives: 1 }] };
  const result = validateMove(state, { startDotId: 0, endDotId: 1, regionId: 0 });
  assert.equal(result.ok, true);
});

test('validateMove: normal move rejects an exhausted start dot', () => {
  const state = { dots: [{ id: 0, lives: 0 }, { id: 1, lives: 3 }] };
  const result = validateMove(state, { startDotId: 0, endDotId: 1, regionId: 0 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { rule: RuleError.INSUFFICIENT_LIVES, dotId: 0 },
  ]);
});

test('validateMove: reports BOTH endpoints when both lack lives', () => {
  const state = { dots: [{ id: 0, lives: 0 }, { id: 1, lives: 0 }] };
  const result = validateMove(state, { startDotId: 0, endDotId: 1, regionId: 0 });
  assert.equal(result.violations.length, 2);
  assert.deepEqual(result.violations, [
    { rule: RuleError.INSUFFICIENT_LIVES, dotId: 0 },
    { rule: RuleError.INSUFFICIENT_LIVES, dotId: 1 },
  ]);
});

test('validateMove: self-loop needs >=2 lives, not >=1', () => {
  const state = { dots: [{ id: 0, lives: 1 }] };
  const result = validateMove(state, { startDotId: 0, endDotId: 0, regionId: 0 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { rule: RuleError.INSUFFICIENT_LIVES, dotId: 0 },
  ]);
});

test('validateMove: self-loop with exactly 2 lives is legal', () => {
  const state = { dots: [{ id: 0, lives: 2 }] };
  const result = validateMove(state, { startDotId: 0, endDotId: 0, regionId: 0 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test('validateMove: self-loop does NOT double-count the same dot under the normal-move check', () => {
  // A dot with exactly 1 life would incorrectly pass two independent
  // "lives >= 1" checks if the loop branch weren't mutually exclusive
  // with the normal-move branch. It must fail as a loop instead.
  const state = { dots: [{ id: 0, lives: 1 }] };
  const result = validateMove(state, { startDotId: 0, endDotId: 0, regionId: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
});

test('validateMove: a fully-legal normal move has zero violations', () => {
  const state = { dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }] };
  const result = validateMove(state, { startDotId: 0, endDotId: 1, regionId: 0 });
  assert.deepEqual(result, { ok: true, violations: [] });
});

// ── validateMove: corner and placement checks — v0.9.2 PR 4 ──────

test('validateMove: accepts valid in-range corners for both endpoints', () => {
  // Real, consistent topology (not disconnected hand-picked darts):
  // dot0 connects to dots 2,3 (degree 2, a tree); dot1 connects to
  // dot4 separately (degree 1, its own tree). Two never-connected
  // ROOT components — per regions.test.js's finding, they already
  // share the plane's one outer region, so this move is legal.
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }, { id: 2, lives: 3 }, { id: 3, lives: 3 }, { id: 4, lives: 3 }],
    edges: [{ a: 0, b: 2 }, { a: 0, b: 3 }, { a: 1, b: 4 }],
    rotations: [[0, 2], [4], [1], [3], [5]], // dot0 degree 2 (valid corners 0-1), dot1 degree 1 (valid corner 0)
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 }, 1: { kind: 'dart', value: 4 } },
    parentAnchor: { 0: null, 1: null },
  };
  const result = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: 1, endCorner: 0, placement: null,
  });
  assert.equal(result.ok, true);
});

test('validateMove: rejects an out-of-range startCorner', () => {
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    rotations: [[0, 2], []],
  };
  const result = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: 5, endCorner: 0, placement: null,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { rule: RuleError.START_CORNER_OUT_OF_RANGE, dotId: 0 },
  ]);
});

test('validateMove: rejects an out-of-range endCorner', () => {
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    rotations: [[], [4]],
  };
  const result = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: 0, endCorner: 3, placement: null,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { rule: RuleError.END_CORNER_OUT_OF_RANGE, dotId: 1 },
  ]);
});

test('validateMove: degree-0 vertex accepts corner index 0 only', () => {
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    edges: [],
    rotations: [[], []],
    outerFaceAnchor: { 0: { kind: 'vertex', value: 0 }, 1: { kind: 'vertex', value: 1 } },
    parentAnchor: { 0: null, 1: null },
  };
  const okResult = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: 0, endCorner: 0, placement: null,
  });
  assert.equal(okResult.ok, true);

  const badResult = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: 1, endCorner: 0, placement: null,
  });
  assert.equal(badResult.ok, false);
  assert.deepEqual(badResult.violations, [
    { rule: RuleError.START_CORNER_OUT_OF_RANGE, dotId: 0 },
  ]);
});

test('validateMove: rejects inconsistent corner data (one corner given, not the other)', () => {
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    rotations: [[], []],
  };
  const result = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: 0, endCorner: null, placement: null,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { rule: RuleError.INCONSISTENT_CORNER_DATA, dotId: 0 },
  ]);
});

test('validateMove: legacy shape (no corners at all) is still valid — no INCONSISTENT_CORNER_DATA violation', () => {
  const state = { dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }] };
  const result = validateMove(state, { startDotId: 0, endDotId: 1, regionId: 0 });
  assert.equal(result.ok, true);
});

test('validateMove: self-loop checks endCorner against the same vertex\'s rotation independently of startCorner', () => {
  // Real, consistent topology (not disconnected hand-picked darts):
  // dot 0 is the center of a 3-edge star/tree to dots 1, 2, 3 (a
  // tree has exactly one face, per faces.test.js's bridge case
  // generalized — so corners 0 and 2 at dot 0 are genuinely on the
  // SAME face, correctly passing PR 5b's same-component check
  // rather than coincidentally comparing two nulls).
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }, { id: 2, lives: 3 }, { id: 3, lives: 3 }],
    edges: [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }],
    rotations: [[0, 2, 4], [1], [3], [5]], // degree 3, valid corners 0-2
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 } },
    parentAnchor: { 0: null },
  };
  const okResult = validateMove(state, {
    startDotId: 0, endDotId: 0, regionId: 0, startCorner: 0, endCorner: 2, placement: null,
  });
  assert.equal(okResult.ok, true);

  const badResult = validateMove(state, {
    startDotId: 0, endDotId: 0, regionId: 0, startCorner: 0, endCorner: 9, placement: null,
  });
  assert.equal(badResult.ok, false);
  assert.deepEqual(badResult.violations, [
    { rule: RuleError.END_CORNER_OUT_OF_RANGE, dotId: 0 },
  ]);
});

test('validateMove: rejects a non-empty placement (temporary restriction — see rules.js file header)', () => {
  const state = { dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }] };
  const result = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, placement: { someComponent: 1 },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { rule: RuleError.PLACEMENT_NOT_YET_SUPPORTED, dotId: 0 },
  ]);
});

test('validateMove: rejects a negative corner index', () => {
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    rotations: [[0, 2], []],
  };
  const result = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: -1, endCorner: 0, placement: null,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { rule: RuleError.START_CORNER_OUT_OF_RANGE, dotId: 0 },
  ]);
});

test('validateMove: accepts null placement and empty-object placement equally', () => {
  const state = { dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }] };
  const nullResult = validateMove(state, { startDotId: 0, endDotId: 1, regionId: 0, placement: null });
  const emptyResult = validateMove(state, { startDotId: 0, endDotId: 1, regionId: 0, placement: {} });
  assert.equal(nullResult.ok, true);
  assert.equal(emptyResult.ok, true);
});

// ── validateMove: same-component/different-face — v0.9.2 PR 5b ───
//
// See rules.js's file header for the proof: two different faces of
// the SAME component always host two different regions (spec D4),
// so connecting them is always illegal, unconditionally. This was
// PR 5b's SAME_COMPONENT_DIFFERENT_FACE check; PR 7 absorbs it into
// the general DIFFERENT_REGIONS check (regions.js's
// areDotsInSameRegion) rather than keeping both.

test('validateMove: rejects a chord connecting two DIFFERENT faces of the same component (the exact case that broke P-O2)', () => {
  // Self-loop bigon (dot 0, sprout 1) — 2 faces, per faces.test.js's
  // hand-traced fixture: face A = darts [0,3], face B = darts [1,2].
  // cornerFace(0, 1) -> alpha(2)=3 -> face A.
  // cornerFace(1, 1) -> alpha(3)=2 -> face B. Different faces.
  const state = {
    dots: [{ id: 0, lives: 1 }, { id: 1, lives: 1 }],
    edges: [{ a: 0, b: 1 }, { a: 0, b: 1 }],
    rotations: [[0, 2], [1, 3]],
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 } },
    parentAnchor: { 0: null },
  };
  const result = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: 1, endCorner: 1, placement: null,
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === RuleError.DIFFERENT_REGIONS));
});

test('validateMove: accepts a chord connecting the SAME face of one component (a genuine split, not rejected)', () => {
  // Same bigon. cornerFace(0, 0) -> alpha(0)=1 -> face B ({1,2}).
  // cornerFace(1, 1) -> alpha(3)=2 -> face B ({1,2}) too — genuinely
  // the same face, a legitimate same-face split. Nothing else
  // occupies anything here, so K is empty and the move is fully
  // legal (region-match AND K = empty AND placement = null).
  const state = {
    dots: [{ id: 0, lives: 1 }, { id: 1, lives: 1 }],
    edges: [{ a: 0, b: 1 }, { a: 0, b: 1 }],
    rotations: [[0, 2], [1, 3]],
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 } },
    parentAnchor: { 0: null },
  };
  const result = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: 0, endCorner: 1, placement: null,
  });
  assert.equal(result.ok, true);
});

test('validateMove: does not apply the region check to legacy (cornerless) moves', () => {
  // Documented residual gap, tied to spec open question O-Q1 (see
  // rules.js file header) — legacy moves are NOT checked here. No
  // corners supplied means the whole region-check block is skipped,
  // so this fixture doesn't even need parentAnchor/outerFaceAnchor.
  const state = {
    dots: [{ id: 0, lives: 1 }, { id: 1, lives: 1 }],
    edges: [{ a: 0, b: 1 }, { a: 0, b: 1 }],
    rotations: [[0, 2], [1, 3]],
  };
  const result = validateMove(state, { startDotId: 0, endDotId: 1, regionId: 0 });
  assert.ok(!result.violations.some(v => v.rule === RuleError.DIFFERENT_REGIONS));
});

test('validateMove: accepts a merge between two different (root) components — unaffected by the new check', () => {
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    edges: [],
    rotations: [[], []],
    outerFaceAnchor: { 0: { kind: 'vertex', value: 0 }, 1: { kind: 'vertex', value: 1 } },
    parentAnchor: { 0: null, 1: null },
  };
  const result = validateMove(state, {
    startDotId: 0, endDotId: 1, regionId: 0, startCorner: 0, endCorner: 0, placement: null,
  });
  assert.equal(result.ok, true);
});

// ── validateMove: I-8, real K — v0.9.3 PR 7 ───────────────────────

test('validateMove: rejects a split whose region has real occupants (NONEMPTY_K_NOT_YET_SUPPORTED)', () => {
  // Triangle (dots 1,2,3) with an occupant (dot 0) inside face A
  // ({0,2,4}) — same hand-built fixture shape as regions.test.js's
  // occupant test. Vertex 2's corner-0 (dart1 -> alpha=0 -> face A)
  // and vertex 3's corner-0 (dart3 -> alpha=2 -> face A) are BOTH
  // independently verified on face A — a genuine same-face split of
  // the occupied face. (Vertex 2's corner-1 is actually on face B,
  // not face A — a second hand-trace error caught by this test
  // failing on the first attempt, not by inspection; fixed by using
  // two different vertices' corner-0s instead of one vertex's two
  // corners.)
  const edges = [{ a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 1 }];
  const rotations = [[], [0, 5], [1, 2], [3, 4]];
  const state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 1 }, { id: 2, lives: 1 }, { id: 3, lives: 1 }],
    edges,
    rotations,
    outerFaceAnchor: { 0: { kind: 'vertex', value: 0 }, 1: { kind: 'dart', value: 1 } },
    parentAnchor: { 0: 0, 1: null }, // dot 0 occupies face A (dart 0's face)
  };
  const result = validateMove(state, {
    startDotId: 2, endDotId: 3, regionId: 0, startCorner: 0, endCorner: 0, placement: null,
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === RuleError.NONEMPTY_K_NOT_YET_SUPPORTED));
});
