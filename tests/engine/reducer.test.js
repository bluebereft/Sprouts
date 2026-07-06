/* ================================================================
   tests/engine/reducer.test.js — Sprouts v0.8.6

   Direct unit tests for js/engine/reducer.js's applyMove() — the
   single most mathematically load-bearing function in the codebase.
   Its arithmetic IS the rules of Sprouts; canonicalisation and
   everything built on top of it will assume this is correct.

   Previously only exercised indirectly, through Engine.apply() in
   engine.test.js (which also runs validateMove() first). These tests
   call applyMove() directly — no Engine, no validation layer in the
   way — so a failure here points at the reducer specifically.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove } from '../../js/engine/reducer.js';
import { createMove } from '../../js/engine/move.js';
import { buildInitialTopology } from '../../js/engine/regions.js';
import { degreeOf } from '../../js/engine/darts.js';

function freshState() {
  return {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    edges: [],
    nextDotId: 2,
    moves: [],
    currentPlayer: 0,
    initialDotCount: 2,
    startingPlayer: 0,
    ...buildInitialTopology(2),
  };
}

// ── Lives arithmetic ────────────────────────────────────────────

test('applyMove: decrements lives by 1 on each of two distinct endpoints', () => {
  const result = applyMove(freshState(), createMove(0, 1));
  assert.equal(result.dots[0].lives, 2);
  assert.equal(result.dots[1].lives, 2);
});

test('applyMove: decrements lives by 2 on a self-loop endpoint', () => {
  const result = applyMove(freshState(), createMove(0, 0));
  assert.equal(result.dots[0].lives, 1);
});

test('applyMove: does not touch lives of dots not involved in the move', () => {
  const state = freshState();
  state.dots.push({ id: 2, lives: 3 });
  const result = applyMove(state, createMove(0, 1));
  assert.equal(result.dots.find(d => d.id === 2).lives, 3);
});

test('applyMove: total lives across all dots decreases by exactly 1 per move', () => {
  // Published invariant (verified against primary sources at v0.6):
  // a move consumes 2 lives from its endpoint(s) but the new sprout
  // restores 1, for a net change of -1 every time, loop or not.
  const before = freshState();
  const totalBefore = before.dots.reduce((sum, d) => sum + d.lives, 0);

  const afterNormal = applyMove(before, createMove(0, 1));
  const totalAfterNormal = afterNormal.dots.reduce((sum, d) => sum + d.lives, 0);
  assert.equal(totalAfterNormal, totalBefore - 1);

  const afterLoop = applyMove(before, createMove(0, 0));
  const totalAfterLoop = afterLoop.dots.reduce((sum, d) => sum + d.lives, 0);
  assert.equal(totalAfterLoop, totalBefore - 1);
});

// ── New sprout dot ──────────────────────────────────────────────

test('applyMove: new sprout dot starts with exactly 1 life', () => {
  const result = applyMove(freshState(), createMove(0, 1));
  const sprout = result.dots[result.dots.length - 1];
  assert.equal(sprout.lives, 1);
});

test('applyMove: new sprout dot id equals state.nextDotId', () => {
  const state = freshState();
  const result = applyMove(state, createMove(0, 1));
  const sprout = result.dots[result.dots.length - 1];
  assert.equal(sprout.id, state.nextDotId);
});

test('applyMove: nextDotId increments by exactly 1', () => {
  const state = freshState();
  const result = applyMove(state, createMove(0, 1));
  assert.equal(result.nextDotId, state.nextDotId + 1);
});

// ── Edges and provenance ────────────────────────────────────────

test('applyMove: appends exactly 2 new edges', () => {
  const state = freshState();
  const result = applyMove(state, createMove(0, 1));
  assert.equal(result.edges.length, state.edges.length + 2);
});

test('applyMove: both new edges connect an endpoint to the new sprout', () => {
  const state = freshState();
  const result = applyMove(state, createMove(0, 1));
  const sprout = result.dots[result.dots.length - 1];
  const [edge1, edge2] = result.edges;
  assert.equal(edge1.a, 0);
  assert.equal(edge1.b, sprout.id);
  assert.equal(edge2.a, 1);
  assert.equal(edge2.b, sprout.id);
});

test('applyMove: both new edges carry originatingMoveIndex equal to this move\'s position in history', () => {
  // v0.8.6 — explicit provenance. moveIndex is state.moves.length at
  // the moment the move is applied (i.e. BEFORE it's appended), local
  // to this game's own move history, not a global identifier.
  let state = freshState();
  state = applyMove(state, createMove(0, 1)); // move 0
  const [edge1, edge2] = state.edges;
  assert.equal(edge1.originatingMoveIndex, 0);
  assert.equal(edge2.originatingMoveIndex, 0);

  state = applyMove(state, createMove(0, 1)); // move 1 (dot 0 and 1 still have lives)
  const [, , edge3, edge4] = state.edges;
  assert.equal(edge3.originatingMoveIndex, 1);
  assert.equal(edge4.originatingMoveIndex, 1);
});

// ── Move history and turn order ──────────────────────────────────

test('applyMove: appends the move to move history unchanged', () => {
  const state = freshState();
  const move = createMove(0, 1);
  const result = applyMove(state, move);
  assert.deepEqual(result.moves[result.moves.length - 1], move);
});

test('applyMove: toggles currentPlayer', () => {
  const state = freshState();
  assert.equal(applyMove(state, createMove(0, 1)).currentPlayer, 1);

  const state2 = { ...state, currentPlayer: 1 };
  assert.equal(applyMove(state2, createMove(0, 1)).currentPlayer, 0);
});

// ── Immutability and field preservation ───────────────────────────

test('applyMove: does not mutate the input state object', () => {
  const state = freshState();
  const originalDotsSnapshot = state.dots.map(d => ({ ...d }));
  applyMove(state, createMove(0, 1));
  assert.deepEqual(state.dots, originalDotsSnapshot);
  assert.equal(state.edges.length, 0);
  assert.equal(state.moves.length, 0);
});

test('applyMove: preserves initialDotCount and startingPlayer unchanged', () => {
  const state = freshState();
  const result = applyMove(state, createMove(0, 1));
  assert.equal(result.initialDotCount, state.initialDotCount);
  assert.equal(result.startingPlayer, state.startingPlayer);
});

// ── σ (rotation system) maintenance — v0.9.2 PR 2 ─────────────────

test('applyMove: normal move appends one new dart to each endpoint\'s rotation, sprout gets a 2-dart rotation', () => {
  const result = applyMove(freshState(), createMove(0, 1));
  const sprout = result.dots[result.dots.length - 1];
  assert.deepEqual(result.rotations[0], [0]);
  assert.deepEqual(result.rotations[1], [2]);
  assert.deepEqual(result.rotations[sprout.id], [1, 3]);
});

test('applyMove: self-loop appends both new darts to the single vertex\'s rotation, sprout still gets 2 darts', () => {
  const result = applyMove(freshState(), createMove(0, 0));
  const sprout = result.dots[result.dots.length - 1];
  assert.deepEqual(result.rotations[0], [0, 2]);
  assert.deepEqual(result.rotations[sprout.id], [1, 3]);
});

test('applyMove: sigma partition — every dart appears in exactly one rotation entry, exactly once, across a scripted game', () => {
  let state = freshState();
  state.dots.push({ id: 2, lives: 3 });
  state.rotations.push([]);
  state.nextDotId = 3; // avoid colliding sprouts with dot 2's id
  state = applyMove(state, createMove(0, 1));
  state = applyMove(state, createMove(0, 2));
  state = applyMove(state, createMove(2, 2)); // self-loop, dot 2 has 2 lives left

  const totalDarts = 2 * state.edges.length;
  const seen = new Array(totalDarts).fill(0);
  state.rotations.forEach(rotation => {
    rotation.forEach(dart => { seen[dart]++; });
  });
  for (let d = 0; d < totalDarts; d++) {
    assert.equal(seen[d], 1, `dart ${d} appeared ${seen[d]} times, expected exactly 1`);
  }
});

test('applyMove: rotations[v].length === degreeOf(edges, v) for every vertex, after every move (cross-check against darts.js)', () => {
  let state = freshState();
  state.dots.push({ id: 2, lives: 3 });
  state.rotations.push([]);
  state.nextDotId = 3; // avoid colliding sprouts with dot 2's id
  const moves = [createMove(0, 1), createMove(0, 2), createMove(2, 2)];

  for (const move of moves) {
    state = applyMove(state, move);
    for (const dot of state.dots) {
      assert.equal(
        state.rotations[dot.id].length,
        degreeOf(state.edges, dot.id),
        `rotation/degree mismatch for dot ${dot.id}`
      );
    }
  }
});

test('applyMove: rotations for a vertex untouched by a move are unchanged (prefix-preservation)', () => {
  let state = freshState();
  state.dots.push({ id: 2, lives: 3 });
  state.rotations.push([]);
  state.nextDotId = 3; // avoid colliding the new sprout with dot 2's id
  state = applyMove(state, createMove(0, 1)); // dot 2 not involved
  assert.deepEqual(state.rotations[2], []);
});

test('applyMove: does not mutate the input state\'s rotations arrays', () => {
  const state = freshState();
  const before = state.rotations.map(r => [...r]);
  applyMove(state, createMove(0, 1));
  assert.deepEqual(state.rotations, before);
});

// ── Corner-driven insertion — v0.9.2 PR 4 ──────────────────────────

test('applyMove: with corners, inserts the new dart at the exact specified gap, not appended', () => {
  // Give dot 0 an existing rotation of 3 darts (from prior moves),
  // then make a move with startCorner=1 (insert after position 1).
  let state = freshState();
  state = applyMove(state, createMove(0, 1)); // dot0 rotation: [0]
  state = applyMove(state, createMove(0, 1)); // dot0 rotation: [0, 4] (appended, legacy path)
  state = applyMove(state, createMove(0, 1)); // dot0 rotation: [0, 4, 8]
  assert.deepEqual(state.rotations[0], [0, 4, 8]);

  const beforeEdgeCount = state.edges.length;
  const newStartDart = 2 * beforeEdgeCount; // the dart this move will create at dot0

  state = applyMove(state, createMove(0, 1, 0, 1, 0)); // startCorner=1, endCorner=0
  // Inserted immediately after position 1 (dart 4): [0, 4, newStartDart, 8]
  assert.deepEqual(state.rotations[0], [0, 4, newStartDart, 8]);
});

test('applyMove: without corners (legacy shape), falls back to append — unchanged from PR 2', () => {
  let state = freshState();
  state = applyMove(state, createMove(0, 1));
  state = applyMove(state, createMove(0, 1));
  const beforeEdgeCount = state.edges.length;
  const newStartDart = 2 * beforeEdgeCount;

  state = applyMove(state, createMove(0, 1)); // no corner args — legacy path
  assert.deepEqual(state.rotations[0], [0, 4, newStartDart]);
});

test('applyMove: self-loop with real corners inserts both new darts correctly without index shift corruption', () => {
  // Give dot 0 a 3-dart rotation first, then a self-loop with both
  // corners on dot 0 — this is exactly the case the reducer's
  // descending-order processing exists for (see file header).
  let state = freshState();
  state = applyMove(state, createMove(0, 1)); // dot0: [0]
  state = applyMove(state, createMove(0, 1)); // dot0: [0, 4]
  assert.deepEqual(state.rotations[0], [0, 4]);
  // dot0 has 2 lives left (started 3, -1 twice) — sufficient for a loop (needs >=2)

  const beforeEdgeCount = state.edges.length; // 4
  const startDart = 2 * beforeEdgeCount;       // 8
  const endDart    = 2 * (beforeEdgeCount + 1); // 10

  // Self-loop: startCorner=1 (after dart 4), endCorner=0 (after dart 0).
  state = applyMove(state, createMove(0, 0, 0, 1, 0));
  // Expected: process descending by original index — endCorner(0)
  // is lower than startCorner(1), so startCorner's insertion is
  // handled first against the original array, landing dart 8 after
  // position 1: [0, 4, 8]. Then endCorner=0 (original) inserts dart
  // 10 after position 0: [0, 10, 4, 8].
  assert.deepEqual(state.rotations[0], [0, 10, 4, 8]);
});

test('applyMove: corner-driven insertion still satisfies the sigma-partition invariant', () => {
  let state = freshState();
  state = applyMove(state, createMove(0, 1));
  state = applyMove(state, createMove(0, 1, 0, 0, 0));

  const totalDarts = 2 * state.edges.length;
  const seen = new Array(totalDarts).fill(0);
  state.rotations.forEach(r => r.forEach(d => { seen[d]++; }));
  for (let d = 0; d < totalDarts; d++) {
    assert.equal(seen[d], 1, `dart ${d} appeared ${seen[d]} times`);
  }
});

// ── Containment integration — v0.9.2 PR 5 ─────────────────────────
//
// Restricted scope (see containment.js's file header): merges of
// two root components with no occupants, and splits with K = ∅.

test('applyMove: merging two isolated dots produces one merged root component', () => {
  const state = applyMove(freshState(), createMove(0, 1)); // bridge move
  assert.deepEqual(Object.keys(state.outerFaceAnchor).sort(), ['0']);
  assert.deepEqual(Object.keys(state.parentAnchor).sort(), ['0']);
  assert.equal(state.parentAnchor[0], null); // still a root
  assert.deepEqual(state.outerFaceAnchor[0], { kind: 'dart', value: 0 });
});

test('applyMove: self-loop containment — the sprout folds into the touched component\'s entry, not its own', () => {
  // A genuinely single-dot fixture: freshState() has TWO dots, and a
  // self-loop on dot 0 correctly leaves dot 1's entry untouched —
  // this test isolates the specific claim "the sprout doesn't create
  // a spurious extra containment entry" by using only one dot.
  const state = {
    dots: [{ id: 0, lives: 3 }],
    edges: [], nextDotId: 1, moves: [], currentPlayer: 0,
    initialDotCount: 1, startingPlayer: 0,
    ...buildInitialTopology(1),
  };
  const result = applyMove(state, createMove(0, 0));
  assert.deepEqual(Object.keys(result.outerFaceAnchor), ['0']);
  assert.deepEqual(Object.keys(result.parentAnchor), ['0']);
  assert.equal(result.parentAnchor[0], null);
});

test('applyMove: containment survives a 3-move scripted game (merge, then merge, then self-loop) with correct key sets at every step', () => {
  let state = freshState();
  state.dots.push({ id: 2, lives: 3 });
  state.rotations.push([]);
  state.outerFaceAnchor[2] = { kind: 'vertex', value: 2 };
  state.parentAnchor[2] = null;
  state.nextDotId = 3;

  state = applyMove(state, createMove(0, 1)); // merge {0} and {1} -> {0}
  assert.deepEqual(Object.keys(state.outerFaceAnchor).sort(), ['0', '2']);

  state = applyMove(state, createMove(0, 2)); // merge {0,1,3} and {2} -> {0}
  assert.deepEqual(Object.keys(state.outerFaceAnchor).sort(), ['0']);
  assert.equal(state.parentAnchor[0], null);

  state = applyMove(state, createMove(2, 2)); // self-loop on dot 2 (2 lives left) — split
  assert.deepEqual(Object.keys(state.outerFaceAnchor).sort(), ['0']);
  assert.equal(state.parentAnchor[0], null);
});

test('applyMove: containment update does not mutate the input state\'s anchor objects', () => {
  const state = freshState();
  const outerBefore = { ...state.outerFaceAnchor };
  const parentBefore = { ...state.parentAnchor };
  applyMove(state, createMove(0, 1));
  assert.deepEqual(state.outerFaceAnchor, outerBefore);
  assert.deepEqual(state.parentAnchor, parentBefore);
});
