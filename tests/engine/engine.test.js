/* ================================================================
   tests/engine/engine.test.js — Sprouts v0.8.1

   Tests for js/engine/engine.js — the stateful wrapper around the
   reducer and rules.

   IMPORTANT: Engine is a module-level singleton (a closed-over
   `let engineState` inside engine.js), not a class you instantiate
   fresh per test. Node's ES module cache means every test() in this
   file shares the SAME Engine instance. Every test must call
   Engine.init(...) first to establish a known starting state before
   asserting anything — otherwise a test could observe state left
   behind by whichever test ran immediately before it.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../../js/engine/engine.js';
import { createMove } from '../../js/engine/move.js';
import { buildInitialTopology } from '../../js/engine/regions.js';

/** Returns a fresh two-dot starting state, matching what ui.js
 *  constructs on game start (dots at full 3 lives, no edges yet). */
function freshState() {
  return {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    edges: [],
    nextDotId: 2,
    moves: [],
    currentPlayer: 0,
    ...buildInitialTopology(2),
  };
}

// ── apply(): success path ──────────────────────────────────────

test('apply(): a legal move returns { ok: true, state }', () => {
  Engine.init(freshState());
  const result = Engine.apply(createMove(0, 1));
  assert.equal(result.ok, true);
  assert.ok(result.state);
});

test('apply(): a legal move creates a new sprout dot', () => {
  Engine.init(freshState());
  const result = Engine.apply(createMove(0, 1));
  assert.equal(result.state.dots.length, 3);
  const sprout = result.state.dots[2];
  assert.equal(sprout.lives, 1);
});

test('apply(): a legal move decrements both endpoints by 1 life', () => {
  Engine.init(freshState());
  const result = Engine.apply(createMove(0, 1));
  assert.equal(result.state.dots[0].lives, 2);
  assert.equal(result.state.dots[1].lives, 2);
});

test('apply(): a legal self-loop decrements the one dot by 2 lives', () => {
  Engine.init(freshState());
  const result = Engine.apply(createMove(0, 0));
  assert.equal(result.state.dots[0].lives, 1);
});

test('apply(): toggles currentPlayer after a legal move', () => {
  Engine.init(freshState());
  const result = Engine.apply(createMove(0, 1));
  assert.equal(result.state.currentPlayer, 1);
});

// ── apply(): failure path — the core v0.8 guarantee ────────────

test('apply(): an illegal move (nonexistent dot) returns { ok: false, violations }', () => {
  Engine.init(freshState());
  const result = Engine.apply(createMove(0, 99));
  assert.equal(result.ok, false);
  assert.equal(Array.isArray(result.violations), true);
  assert.equal(result.violations.length, 1);
});

test('apply(): an illegal move leaves engine state as the exact same object reference', () => {
  // strictEqual, not deepEqual: this proves apply() never even
  // constructed a new state object for a rejected move, not just
  // that the values happened to still match afterward.
  Engine.init(freshState());
  const before = Engine.getState();
  Engine.apply(createMove(0, 99));
  assert.strictEqual(Engine.getState(), before);
});

test('apply(): an illegal self-loop (insufficient lives) is rejected and state is unchanged', () => {
  Engine.init({
    dots: [{ id: 0, lives: 1 }],
    edges: [], nextDotId: 1, moves: [], currentPlayer: 0,
    ...buildInitialTopology(1),
  });
  const before = Engine.getState();
  const result = Engine.apply(createMove(0, 0));
  assert.equal(result.ok, false);
  assert.strictEqual(Engine.getState(), before);
});

test('apply(): rejecting a move does not advance currentPlayer', () => {
  Engine.init(freshState());
  Engine.apply(createMove(0, 99));
  assert.equal(Engine.getState().currentPlayer, 0);
});

test('apply(): rejecting a move does not append to move history', () => {
  Engine.init(freshState());
  Engine.apply(createMove(0, 99));
  assert.equal(Engine.getState().moves.length, 0);
});

// ── validate(): read-only, never mutates ───────────────────────

test('validate(): a legal move reports ok:true without applying it', () => {
  Engine.init(freshState());
  const before = Engine.getState();
  const result = Engine.validate(createMove(0, 1));
  assert.equal(result.ok, true);
  // state must be untouched — validate() never applies anything
  assert.strictEqual(Engine.getState(), before);
  assert.equal(Engine.getState().dots.length, 2); // no sprout created
});

test('validate(): an illegal move reports violations without mutating state', () => {
  Engine.init(freshState());
  const before = Engine.getState();
  const result = Engine.validate(createMove(0, 99));
  assert.equal(result.ok, false);
  assert.strictEqual(Engine.getState(), before);
});

test('apply() internally agrees with validate(): same move, same ok value', () => {
  Engine.init(freshState());
  const move = createMove(0, 99);
  const validation = Engine.validate(move);
  const applyResult = Engine.apply(move);
  assert.equal(validation.ok, applyResult.ok);
});
