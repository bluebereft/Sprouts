/* ================================================================
   tests/engine/gameRecord.test.js — Sprouts v0.9

   Tests for js/engine/gameRecord.js — pure Game Record export,
   import, and round-trip replay.

   v0.8.6: gameRecord.js no longer touches the Engine singleton at
   all — it operates purely on local state, via reducer.js's
   applyMove() and rules.js's validateMove() directly. These tests
   build their own fixtures the same way (direct applyMove() calls),
   never importing engine.js, so this file has no shared-singleton
   ordering concerns the way tests/engine/engine.test.js does.

   v0.9: fixtures now seed topology (regions/boundaries) via
   buildInitialTopology(), matching exactly what a real game's
   starting state looks like post-v0.9 — see freshState() below.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove } from '../../js/engine/reducer.js';
import { createMove } from '../../js/engine/move.js';
import { buildInitialTopology } from '../../js/engine/regions.js';
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
    ...buildInitialTopology(3),
  };
}

/** Plays two legal moves against a fresh 3-dot game and returns the
 *  resulting state, for use as test fixtures. Built via applyMove()
 *  directly — gameRecord.js is the thing under test, not the thing
 *  used to construct fixtures for testing itself. */
function playTwoMoves() {
  let state = freshState();
  state = applyMove(state, createMove(0, 1));
  state = applyMove(state, createMove(2, 2)); // self-loop, dot 2 has 3 lives
  return state;
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
  // v0.9.2 PR 4: createMove() now defaults startCorner/endCorner/
  // placement to null, so a LIVE game's state.moves may carry those
  // extra (null) fields, while importGame() always reconstructs the
  // minimal v1 shape (Game Records are still formatVersion 1 and
  // never carry corner data — see move.js/gameRecord.js file
  // headers). The round-trip guarantee that actually matters is
  // over the v1-meaningful fields; comparing extra incidental nulls
  // would conflate "same game" with "byte-identical Move object",
  // which even the spec's own state-equivalence principle (§10.4)
  // says not to do.
  const original = playTwoMoves();
  const record = exportGame(original);
  const result = importGame(record);

  const toV1Shape = m => ({ startDotId: m.startDotId, endDotId: m.endDotId, regionId: m.regionId });

  assert.equal(result.ok, true);
  assert.deepEqual(result.state.moves.map(toV1Shape), original.moves.map(toV1Shape));
});

test('round trip: reproduces identical dots, edges, and currentPlayer', () => {
  const original = playTwoMoves();
  const record = exportGame(original);
  const result = importGame(record);

  assert.deepEqual(result.state.dots, original.dots);
  assert.deepEqual(result.state.edges, original.edges);
  assert.equal(result.state.currentPlayer, original.currentPlayer);
});

test('round trip: reproduces identical containment (outerFaceAnchor, parentAnchor)', () => {
  // v0.9.2 PR 6 — regions/boundaries (this test's pre-cutover
  // subject) no longer exist as separate stored state; the legacy
  // seeded arrays were deleted. Containment IS still derived/
  // re-seeded and, like rotations, grows with every move (PR 5) — so
  // this exercises the reducer's containment-update determinism
  // through replay, the same way the rotations test below does for
  // sigma.
  const original = playTwoMoves();
  const result = importGame(exportGame(original));

  assert.deepEqual(result.state.outerFaceAnchor, original.outerFaceAnchor);
  assert.deepEqual(result.state.parentAnchor, original.parentAnchor);
});

test('round trip: reproduces identical rotations (sigma)', () => {
  // v0.9.2 — rotations are likewise derived/re-seeded, never
  // persisted. Unlike regions/boundaries (which don't change yet,
  // since no split/merge logic exists), rotations DO grow with every
  // move (PR 2), so this test — unlike the one above — is actually
  // exercising the reducer's sigma-maintenance determinism, not just
  // buildInitialTopology's seeding: replaying the same moves through
  // the same reducer must produce byte-identical rotations both times.
  const original = playTwoMoves();
  const result = importGame(exportGame(original));

  assert.deepEqual(result.state.rotations, original.rotations);
});

test('round trip: reproduces edges with matching originatingMoveIndex', () => {
  // v0.8.6 — edge provenance must survive a full export/import cycle,
  // since renderer.js now depends on it entirely (no positional
  // fallback exists any more).
  const original = playTwoMoves();
  const result = importGame(exportGame(original));

  const originalIndices = original.edges.map(e => e.originatingMoveIndex);
  const importedIndices = result.state.edges.map(e => e.originatingMoveIndex);
  assert.deepEqual(importedIndices, originalIndices);
  assert.deepEqual(importedIndices, [0, 0, 1, 1]); // 2 edges per move, in order
});

test('round trip: via JSON string end to end', () => {
  const original = playTwoMoves();
  const json = exportGameToJSON(original);
  const result = importGameFromJSON(json);

  // Same v1-shape comparison rationale as the round-trip test above.
  const toV1Shape = m => ({ startDotId: m.startDotId, endDotId: m.endDotId, regionId: m.regionId });

  assert.equal(result.ok, true);
  assert.deepEqual(result.state.moves.map(toV1Shape), original.moves.map(toV1Shape));
});

test('round trip: works for a game with startingPlayer 1', () => {
  let state = {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    edges: [], nextDotId: 2, moves: [],
    currentPlayer: 1, initialDotCount: 2, startingPlayer: 1,
    ...buildInitialTopology(2),
  };
  state = applyMove(state, createMove(0, 1));

  const result = importGame(exportGame(state));
  assert.equal(result.ok, true);
  assert.equal(result.state.startingPlayer, 1);
  assert.equal(result.state.currentPlayer, state.currentPlayer);
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

// ── importGame: no shared state, v0.8.6 ──────────────────────────

test('importGame: successive calls are fully independent — no state leaks between them', () => {
  // Before v0.8.6 this would have gone through the shared Engine
  // singleton; a bad interaction between two calls would have shown
  // up as one call's replay bleeding into the other's result. Since
  // importGame() now only ever builds a local state object and
  // returns it, two calls with different records must produce
  // results that reflect only their own record, regardless of order
  // or what ran immediately before.
  const recordA = exportGame(playTwoMoves()); // 2 moves

  let singleMoveState = freshState();
  singleMoveState = applyMove(singleMoveState, createMove(0, 1));
  const recordB = exportGame(singleMoveState); // 1 move

  const resultA = importGame(recordA);
  const resultB = importGame(recordB);

  assert.equal(resultA.state.moves.length, 2);
  assert.equal(resultB.state.moves.length, 1);
});

test('importGame: a failed import does not affect a subsequent successful import', () => {
  const badRecord = {
    formatVersion: FORMAT_VERSION,
    initialDotCount: 1,
    startingPlayer: 0,
    moves: [
      { startDotId: 0, endDotId: 0, regionId: 0 },
      { startDotId: 0, endDotId: 0, regionId: 0 }, // illegal
    ],
  };
  const goodRecord = exportGame(playTwoMoves());

  const failureResult = importGame(badRecord);
  const successResult = importGame(goodRecord);

  assert.equal(failureResult.ok, false);
  assert.equal(successResult.ok, true);
  assert.equal(successResult.state.moves.length, 2);
});
