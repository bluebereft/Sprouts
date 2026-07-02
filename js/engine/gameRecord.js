/* ================================================================
   gameRecord.js — Sprouts Engine Game Records (v0.8.5)

   Responsibility
   ──────────────
   Pure functions converting between engine state and a Game Record
   — the project's stable persistence format.

   A Game Record is a description of what happened in a game, not a
   snapshot of how the engine happened to represent it. It contains
   only the player's choices: how many dots the game started with,
   who moved first, and the ordered sequence of moves. Everything
   else — dots, edges, nextDotId, currentPlayer at any point in the
   game — is derived by replaying the moves through the real engine,
   never stored.

   This means exportGame()/importGame() never need to change shape
   when the engine's internal state representation changes (e.g. when
   v0.9 adds region/boundary tracking) — the Game Record only ever
   describes the game, never the engine's current internals.

   importGame() replays every move through Engine.apply() — the same
   function used for ordinary play — so a Game Record's legality is
   checked by the exact same code path as a human player's move,
   never a second, independent implementation of the rules.

   No DOM. No browser APIs beyond JSON, which is standard JS, not a
   browser-specific API — this file runs identically under Node.

   Depends on: engine.js
   ================================================================ */

import Engine from './engine.js';

/** Current Game Record format version. Bump when the shape changes. */
export const FORMAT_VERSION = 1;

/** Coded reasons importGame()/importGameFromJSON() can fail. */
export const ImportError = {
  INVALID_FORMAT_VERSION: 'INVALID_FORMAT_VERSION',
  INVALID_RECORD_SHAPE:   'INVALID_RECORD_SHAPE',
  ILLEGAL_MOVE:           'ILLEGAL_MOVE',
};

// ── Private helpers ──────────────────────────────────────────────

/**
 * Builds the initial dots array for a fresh engine state. Explicitly
 * omits x/y — engine dots have no screen coordinates (see boardView.js
 * for why). This is a separate, minimal helper from models.js's
 * createDot(), which includes x/y for the browser's benefit and is
 * therefore the wrong shape for engine-side state construction.
 *
 * @param {number} count
 * @returns {Array<{id: number, lives: number}>}
 */
function buildInitialDots(count) {
  const dots = [];
  for (let i = 0; i < count; i++) dots.push({ id: i, lives: 3 });
  return dots;
}

/**
 * Validates the shape of a candidate Game Record before attempting
 * to replay it. Checked before Engine is touched at all.
 *
 * @param {*} record
 * @returns {{ ok: true } | { ok: false, error: string, message?: string }}
 */
function validateRecordShape(record) {
  if (!record || typeof record !== 'object') {
    return { ok: false, error: ImportError.INVALID_RECORD_SHAPE, message: 'Record must be an object.' };
  }
  if (record.formatVersion !== FORMAT_VERSION) {
    return { ok: false, error: ImportError.INVALID_FORMAT_VERSION, message: `Unsupported formatVersion: ${record.formatVersion}` };
  }
  if (!Number.isInteger(record.initialDotCount) || record.initialDotCount < 1) {
    return { ok: false, error: ImportError.INVALID_RECORD_SHAPE, message: 'initialDotCount must be a positive integer.' };
  }
  if (record.startingPlayer !== 0 && record.startingPlayer !== 1) {
    return { ok: false, error: ImportError.INVALID_RECORD_SHAPE, message: 'startingPlayer must be 0 or 1.' };
  }
  if (!Array.isArray(record.moves)) {
    return { ok: false, error: ImportError.INVALID_RECORD_SHAPE, message: 'moves must be an array.' };
  }
  for (const move of record.moves) {
    if (!move || !Number.isInteger(move.startDotId) || !Number.isInteger(move.endDotId)) {
      return { ok: false, error: ImportError.INVALID_RECORD_SHAPE, message: 'Each move needs integer startDotId and endDotId.' };
    }
  }
  return { ok: true };
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Converts engine state into a Game Record — a plain object
 * describing the game's starting parameters and move sequence.
 * Deliberately does NOT include dots, edges, nextDotId, or
 * currentPlayer: all of that is derivable by replaying moves
 * through the engine, and persisting it would tie saved files to
 * one moment in the engine's internal representation.
 *
 * @param {object} state — engine state (from Engine.getState())
 * @returns {{ formatVersion: number, initialDotCount: number,
 *             startingPlayer: number,
 *             moves: Array<{startDotId, endDotId, regionId}> }}
 */
export function exportGame(state) {
  return {
    formatVersion:   FORMAT_VERSION,
    initialDotCount: state.initialDotCount,
    startingPlayer:  state.startingPlayer,
    moves: state.moves.map(m => ({
      startDotId: m.startDotId,
      endDotId:   m.endDotId,
      regionId:   m.regionId,
    })),
  };
}

/**
 * exportGame() plus JSON stringification, pretty-printed for
 * readability when a human copies/pastes the result.
 *
 * @param {object} state
 * @returns {string}
 */
export function exportGameToJSON(state) {
  return JSON.stringify(exportGame(state), null, 2);
}

/**
 * Reconstructs a game from a Game Record by replaying its moves
 * through the real engine — Engine.apply(), the exact same function
 * ordinary play uses. There is no separate, independent legality
 * check for imported games; a Game Record is only as legal as the
 * moves it contains, verified the same way a human player's moves
 * always are.
 *
 * Snapshots whatever the Engine singleton currently holds before
 * starting the replay, and restores it if any move in the record
 * turns out to be illegal — so a failed import never leaves the
 * previously active game (if any) corrupted by a partial replay.
 * On success, the newly replayed state is left live in Engine.
 *
 * @param {*} record — candidate Game Record, e.g. from JSON.parse
 * @returns {{ ok: true, state: object } |
 *           { ok: false, error: string, message?: string } |
 *           { ok: false, error: string, moveIndex: number, violations: Array }}
 */
export function importGame(record) {
  const shapeCheck = validateRecordShape(record);
  if (!shapeCheck.ok) return shapeCheck;

  const previousState = Engine.getState(); // may be null on first-ever load

  Engine.init({
    dots:            buildInitialDots(record.initialDotCount),
    edges:           [],
    nextDotId:       record.initialDotCount,
    moves:           [],
    currentPlayer:   record.startingPlayer,
    initialDotCount: record.initialDotCount,
    startingPlayer:  record.startingPlayer,
  });

  for (let i = 0; i < record.moves.length; i++) {
    const m = record.moves[i];
    const result = Engine.apply({
      startDotId: m.startDotId,
      endDotId:   m.endDotId,
      regionId:   m.regionId ?? 0,
    });

    if (!result.ok) {
      if (previousState) Engine.init(previousState);
      return {
        ok: false,
        error: ImportError.ILLEGAL_MOVE,
        moveIndex: i,
        violations: result.violations,
      };
    }
  }

  return { ok: true, state: Engine.getState() };
}

/**
 * JSON.parse() plus importGame(). Parse failures are reported the
 * same way as any other malformed record — INVALID_RECORD_SHAPE.
 *
 * @param {string} jsonString
 * @returns {ReturnType<typeof importGame>}
 */
export function importGameFromJSON(jsonString) {
  let record;
  try {
    record = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: ImportError.INVALID_RECORD_SHAPE, message: 'Could not parse JSON.' };
  }
  return importGame(record);
}
