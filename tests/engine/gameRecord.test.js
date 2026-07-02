/* ================================================================
   tests/engine/gameRecord.test.js — Sprouts v0.8.5

   Tests for js/engine/gameRecord.js — pure Game Record export,
   import, and round-trip replay through the real engine.

   Engine is a module-level singleton — see tests/engine/engine.test.js
   for why every test that touches import/export must not assume a
   clean starting state, and why importGame()'s snapshot/restore
   behaviour on failure is worth testing explicitly here, not just
   trusted.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../../js/engine/engine.js';
import { createMove } from '../../js/engine/move.js';
import {
  FORMAT_VERSION,
  ImportError,
  exportGame,
  exportGameToJSON,
  importGame,
  importGameFromJSON,
} from '../../js/engine/gameRecord.js';

function freshState() {
  return {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }, { id: 2, lives: 3 }],
    edges: [],
    nextDotId: 3,
    moves: [],
    currentPlayer: 0,
    initialDotCount: 3,
    startingPlayer: 0,
  };
}

/** Plays two legal moves against a fresh 3-dot game and returns the
 *  resulting engine state, for use as test fixtures. */
function playTwoMoves() {
  Engine.init(freshState());
  Engine.apply(createMove(0, 1));
  Engine.apply(createMove(2, 2)); // self-loop, dot 2 still has 3 lives
  return Engine.getState();
}

// ── exportGame ─────────────────────────────────────────────────

test('exportGame: includes formatVersion, initialDotCount, startingPlayer, moves', () => {
  const state = playTwoMoves();
  const record = exportGame(state);
  assert.equal(record.formatVersion, FORMAT_VERSION);
  assert.equal(record.initialDotCount, 3);
  assert.equal(record.startingPlayer, 0);
  assert.equal(record.moves.length, 2);
});

test('exportGame: does NOT include dots, edges, nextDotId, or currentPlayer', () => {
  const state = playTwoMoves();
  const record = exportGame(state);
  assert.equal('dots' in record, false);
  assert.equal('edges' in record, false);
  assert.equal('nextDotId' in record, false);
  assert.equal('currentPlayer' in record, false);
});

test('exportGame: moves are plain {startDotId, endDotId, regionId} objects', () => {
  const state = playTwoMoves();
  const record = exportGame(state);
  assert.deepEqual(record.moves[0], { startDotId: 0, endDotId: 1, regionId: 0 });
  assert.deepEqual(record.moves[1], { startDotId: 2, endDotId: 2, regionId: 0 });
});

test('exportGameToJSON: produces valid, parseable JSON', () => {
  const state = playTwoMoves();
  const json = exportGameToJSON(state);
  assert.doesNotThrow(() => JSON.parse(json));
});

// ── importGame: round trip ──────────────────────────────────────

test('round trip: importGame(exportGame(state)) reproduces the same moves', () => {
  const original = playTwoMoves();
  const record = exportGame(original);
  const result = importGame(record);

  assert.equal(result.ok, true);
  assert.deepEqual(result.state.moves, original.moves);
});

test('round trip: reproduces identical dots, edges, and currentPlayer', () => {
  const original = playTwoMoves();
  const record = exportGame(original);
  const result = importGame(record);

  assert.deepEqual(result.state.dots, original.dots);
  assert.deepEqual(result.state.edges, original.edges);
  assert.equal(result.state.currentPlayer, original.currentPlayer);
});

test('round trip: via JSON string end to end', () => {
  const original = playTwoMoves();
  const json = exportGameToJSON(original);
  const result = importGameFromJSON(json);

  assert.equal(result.ok, true);
  assert.deepEqual(result.state.moves, original.moves);
});

test('round trip: works for a game with startingPlayer 1', () => {
  Engine.init({
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    edges: [], nextDotId: 2, moves: [],
    currentPlayer: 1, initialDotCount: 2, startingPlayer: 1,
  });
  Engine.apply(createMove(0, 1));
  const original = Engine.getState();

  const result = importGame(exportGame(original));
  assert.equal(result.ok, true);
  assert.equal(result.state.startingPlayer, 1);
  assert.equal(result.state.currentPlayer, original.currentPlayer);
});

// ── importGame: malformed record shape ──────────────────────────

test('importGame: rejects a record with the wrong formatVersion', () => {
  const result = importGame({ formatVersion: 999, initialDotCount: 2, startingPlayer: 0, moves: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error, ImportError.INVALID_FORMAT_VERSION);
});

test('importGame: rejects a non-object record', () => {
  const result = importGame(null);
  assert.equal(result.ok, false);
  assert.equal(result.error, ImportError.INVALID_RECORD_SHAPE);
});

test('importGame: rejects a non-positive initialDotCount', () => {
  const result = importGame({ formatVersion: FORMAT_VERSION, initialDotCount: 0, startingPlayer: 0, moves: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error, ImportError.INVALID_RECORD_SHAPE);
});

test('importGame: rejects an invalid startingPlayer', () => {
  const result = importGame({ formatVersion: FORMAT_VERSION, initialDotCount: 2, startingPlayer: 2, moves: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error, ImportError.INVALID_RECORD_SHAPE);
});

test('importGame: rejects a non-array moves field', () => {
  const result = importGame({ formatVersion: FORMAT_VERSION, initialDotCount: 2, startingPlayer: 0, moves: 'nope' });
  assert.equal(result.ok, false);
  assert.equal(result.error, ImportError.INVALID_RECORD_SHAPE);
});

test('importGameFromJSON: rejects unparseable JSON', () => {
  const result = importGameFromJSON('{not valid json');
  assert.equal(result.ok, false);
  assert.equal(result.error, ImportError.INVALID_RECORD_SHAPE);
});

// ── importGame: illegal move sequence ────────────────────────────

test('importGame: rejects a record whose move sequence is illegal', () => {
  const record = {
    formatVersion: FORMAT_VERSION,
    initialDotCount: 1,
    startingPlayer: 0,
    // dot 0 starts with 3 lives; a self-loop needs 2. Second loop
    // attempt on the same dot leaves only 1 life — illegal.
    moves: [
      { startDotId: 0, endDotId: 0, regionId: 0 },
      { startDotId: 0, endDotId: 0, regionId: 0 },
    ],
  };
  const result = importGame(record);
  assert.equal(result.ok, false);
  assert.equal(result.error, ImportError.ILLEGAL_MOVE);
  assert.equal(result.moveIndex, 1);
  assert.ok(Array.isArray(result.violations));
});

test('importGame: a failed import restores whatever game was previously active', () => {
  // Start a real, distinguishable game.
  Engine.init(freshState());
  Engine.apply(createMove(0, 1));
  const before = Engine.getState();

  // Attempt an import that will fail partway through.
  const badRecord = {
    formatVersion: FORMAT_VERSION,
    initialDotCount: 1,
    startingPlayer: 0,
    moves: [
      { startDotId: 0, endDotId: 0, regionId: 0 },
      { startDotId: 0, endDotId: 0, regionId: 0 }, // illegal — insufficient lives
    ],
  };
  const result = importGame(badRecord);

  assert.equal(result.ok, false);
  // The engine must be back to exactly what it was before the
  // failed import attempt — same moves, same dots, not the
  // partially-replayed bad record.
  assert.deepEqual(Engine.getState(), before);
});

test('importGame: malformed-shape rejection never touches Engine at all', () => {
  Engine.init(freshState());
  const before = Engine.getState();
  importGame({ formatVersion: 999, initialDotCount: 2, startingPlayer: 0, moves: [] });
  assert.strictEqual(Engine.getState(), before); // exact same reference
});
