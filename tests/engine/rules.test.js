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
