/* ================================================================
   tests/engine/legalMoves.test.js — Sprouts v1.0 (PR 11)

   Tests for js/engine/legalMoves.js — hasLegalMove,
   enumerateLegalMoves, checkGameOver.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialTopology } from '../../js/engine/regions.js';
import { checkInvariantsV2 } from '../../js/engine/regions.js';
import { applyMove } from '../../js/engine/reducer.js';
import { hasLegalMove, enumerateLegalMoves, checkGameOver } from '../../js/engine/legalMoves.js';

function fresh(n) {
  return {
    dots: Array.from({ length: n }, (_, i) => ({ id: i, lives: 3 })),
    edges: [], moves: [], initialDotCount: n, startingPlayer: 0,
    nextDotId: n, currentPlayer: 0, ...buildInitialTopology(n),
  };
}

test('hasLegalMove: a fresh 2-dot game has legal moves', () => {
  assert.equal(hasLegalMove(fresh(2)), true);
});

test('hasLegalMove: a lone dot down to 1 life, nothing else on the board, has no legal move', () => {
  // Degree 2 already (1 life remains); a self-loop needs 2 lives, and
  // there is no other dot to merge with.
  const state = {
    dots: [{ id: 0, lives: 1 }],
    edges: [{ a: 0, b: 1, originatingMoveIndex: 0 }, { a: 0, b: 1, originatingMoveIndex: 0 }],
    rotations: [[0, 2], [1, 3]],
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 } },
    parentAnchor: { 0: null },
    moves: [{ startDotId: 0, endDotId: 0 }],
    initialDotCount: 1, startingPlayer: 0, nextDotId: 2, currentPlayer: 0,
  };
  assert.equal(hasLegalMove(state), false);
});

test('enumerateLegalMoves: a fresh 2-dot game — hand-derived count', () => {
  // 1 merge (dot0-dot1, both degree 0, one corner combo each) + 2
  // self-loops (one on each dot), each of which encloses the OTHER
  // dot as a K = {sibling} occupant with 2 distinct placements
  // (1 and 2) = 2 moves per self-loop. Total: 1 + 2 + 2 = 5.
  const moves = enumerateLegalMoves(fresh(2));
  assert.equal(moves.length, 5);
});

test('hasLegalMove and enumerateLegalMoves always agree on existence', () => {
  const scenarios = [fresh(1), fresh(2), fresh(3)];
  for (const state of scenarios) {
    assert.equal(hasLegalMove(state), enumerateLegalMoves(state).length > 0);
  }
});

test('checkGameOver: not over on a fresh game', () => {
  const result = checkGameOver(fresh(2));
  assert.equal(result.over, false);
  assert.equal(result.winner, null);
});

test('checkGameOver: over when no legal move remains, winner is the OTHER player (normal play)', () => {
  const state = {
    dots: [{ id: 0, lives: 1 }],
    edges: [{ a: 0, b: 1, originatingMoveIndex: 0 }, { a: 0, b: 1, originatingMoveIndex: 0 }],
    rotations: [[0, 2], [1, 3]],
    outerFaceAnchor: { 0: { kind: 'dart', value: 0 } },
    parentAnchor: { 0: null },
    moves: [{ startDotId: 0, endDotId: 0 }],
    initialDotCount: 1, startingPlayer: 0, nextDotId: 2, currentPlayer: 1,
  };
  const result = checkGameOver(state);
  assert.equal(result.over, true);
  assert.equal(result.winner, 0); // player 1 is stuck, player 0 (who made the last move) wins
});

// ── Random-game simulation against the classical Sprouts bound ────
//
// A Sprouts game starting with n spots lasts at least 2n and at most
// 3n-1 moves (confirmed against multiple independent sources before
// using it as a test oracle here, not assumed from memory — see
// docs/migration-plan.md's PR 11 entry). This is a strong, math-
// grounded end-to-end check that enumeration/legality is producing
// genuinely valid Sprouts games, not just individually-plausible moves.

function playRandomGame(n, rng) {
  let state = fresh(n);
  let moveCount = 0;
  while (true) {
    const result = checkGameOver(state);
    if (result.over) return { moveCount, winner: result.winner, finalState: state };
    const legal = enumerateLegalMoves(state);
    assert.ok(legal.length > 0, 'enumerateLegalMoves must agree with checkGameOver');
    const chosen = legal[Math.floor(rng() * legal.length)];
    state = applyMove(state, chosen);
    moveCount++;
    // Safety valve: the theorem bounds this above by 3n-1; if we ever
    // exceed a generous multiple of that, something is wrong and this
    // test should fail loudly rather than loop forever.
    assert.ok(moveCount <= 10 * n + 10, 'game ran far longer than the theoretical maximum — enumeration or legality is likely wrong');
  }
}

// Deterministic seeded RNG so failures are reproducible.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (let n = 1; n <= 5; n++) {
  test(`random-game simulation: n=${n} starting dots — move count within [2n, 3n-1] across many trials`, () => {
    const rng = mulberry32(1000 + n);
    const trials = 15;
    for (let t = 0; t < trials; t++) {
      const { moveCount, winner, finalState } = playRandomGame(n, rng);
      assert.ok(
        moveCount >= 2 * n && moveCount <= 3 * n - 1,
        `trial ${t}: move count ${moveCount} outside [${2 * n}, ${3 * n - 1}] for n=${n}`
      );
      assert.ok(winner === 0 || winner === 1);
      const inv = checkInvariantsV2(finalState);
      assert.equal(inv.ok, true, `final state invariants failed: ${JSON.stringify(inv.violations)}`);
    }
  });
}
