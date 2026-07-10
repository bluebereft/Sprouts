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

   v0.9.4 PR 8: FORMAT_VERSION bumped to 2 (regionId retired,
   corners/placement serialized instead — spec §7.5). formatVersion 1
   is dropped entirely (spec O-Q1, product ruling) and rejected the
   same way any unsupported version already was.
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
  // PR 10: dot 2's self-loop, drawn while the {0,1,sprout} component
  // also sits in the plane's outer region, is an enclosure move —
  // K = {rep of that component, = 0}. It therefore carries a real
  // placement (send that component to side 2) and an exteriorSide,
  // so the fixture models a genuinely legal, containment-sound game
  // rather than an underspecified one.
  state = applyMove(state, createMove(2, 2, 0, 0, { 0: 2 }, 2));
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

test('exportGame: moves are plain {startDotId, endDotId, startCorner, endCorner, placement, exteriorSide} objects', () => {
  // v0.9.4 PR 8: regionId retired, corners/placement serialized
  // instead (spec §7.5). PR 10: exteriorSide added, and move 1 is now
  // a real enclosure move (see playTwoMoves), so it carries real
  // corners, a placement, and an exteriorSide — all of which export.
  const state = playTwoMoves();
  const record = exportGame(state);
  assert.deepEqual(record.moves[0], { startDotId: 0, endDotId: 1, startCorner: null, endCorner: null, placement: null, exteriorSide: null });
  assert.deepEqual(record.moves[1], { startDotId: 2, endDotId: 2, startCorner: 0, endCorner: 0, placement: { 0: 2 }, exteriorSide: 2 });
});

test('exportGameToJSON: produces valid, parseable JSON', () => {
  const state = playTwoMoves();
  const json = exportGameToJSON(state);
  assert.doesNotThrow(() => JSON.parse(json));
});

// ── importGame: round trip ──────────────────────────────────────

test('round trip: importGame(exportGame(state)) reproduces the same moves', () => {
  // v0.9.4 PR 8: with regionId retired, both a live game's moves
  // (built via createMove()) and a replayed record's moves (built
  // by importGame()) now share the exact same shape —
  // {startDotId, endDotId, startCorner, endCorner, placement} — so a
  // direct comparison works with no shape-stripping needed. (PR 4
  // through PR 7 needed a stripping helper here, since regionId's
  // presence/absence varied by construction path; that workaround is
  // gone along with regionId itself.)
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

  // Same simplification as the round-trip test above — no
  // shape-stripping needed now that regionId is gone.
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.moves, original.moves);
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

test('importGame: rejects a formatVersion 1 record (spec O-Q1 — dropped entirely, not migrated)', () => {
  // The exact old v1 shape — dropped, not given special handling;
  // rejected the identical way any other unsupported version is.
  const v1Record = {
    formatVersion: 1,
    initialDotCount: 2,
    startingPlayer: 0,
    moves: [{ startDotId: 0, endDotId: 1, regionId: 0 }],
  };
  const result = importGame(v1Record);
  assert.equal(result.ok, false);
  assert.equal(result.error, ImportError.INVALID_FORMAT_VERSION);
});

test('P-O5: round trip preserves real corners AND convenience-fallback (null) corners in the same game', () => {
  // Discharges P-O5 (spec S11.3): corner-index serialization must
  // round-trip under replay. A mix, not just one or the other,
  // since that's the case most likely to expose a serialization bug
  // (e.g. accidentally coercing null to 0, or vice versa).
  //
  // PR 10: freshState() has 3 dots, so the second move (connecting
  // dots 0 and 1, already joined by the first move's sprout) is a
  // split whose region still contains the isolated dot 2 — i.e. an
  // enclosure move with K = {2}. It therefore now carries a real
  // placement π = {2: 1} and an exteriorSide, both of which must
  // ALSO round-trip. This makes the test stronger than before:
  // corners, placement, AND exterior-side all serialize and replay.
  let state = freshState();
  state = applyMove(state, createMove(0, 1)); // convenience fallback: null corners
  state = applyMove(state, createMove(0, 1, 0, 0, { 2: 1 }, 2)); // real corners + enclosure π

  const record = exportGame(state);
  assert.equal(record.moves[0].startCorner, null);
  assert.equal(record.moves[0].placement, null);
  assert.equal(record.moves[1].startCorner, 0);
  assert.equal(record.moves[1].endCorner, 0);
  assert.deepEqual(record.moves[1].placement, { 2: 1 });
  assert.equal(record.moves[1].exteriorSide, 2);

  const result = importGame(record);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.moves, state.moves);
  assert.deepEqual(result.state.rotations, state.rotations);
  assert.deepEqual(result.state.outerFaceAnchor, state.outerFaceAnchor);
  assert.deepEqual(result.state.parentAnchor, state.parentAnchor);
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
      { startDotId: 0, endDotId: 0 },
      { startDotId: 0, endDotId: 0 },
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
      { startDotId: 0, endDotId: 0 },
      { startDotId: 0, endDotId: 0 }, // illegal
    ],
  };
  const goodRecord = exportGame(playTwoMoves());

  const failureResult = importGame(badRecord);
  const successResult = importGame(goodRecord);

  assert.equal(failureResult.ok, false);
  assert.equal(successResult.ok, true);
  assert.equal(successResult.state.moves.length, 2);
});
