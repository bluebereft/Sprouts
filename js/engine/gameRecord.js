/* ================================================================
   gameRecord.js — Sprouts Engine Game Records (v0.8.6)

   Responsibility
   ──────────────
   Pure functions converting between engine state and a Game Record
   — the project's stable persistence format.

   A Game Record is a description of what happened in a game, not a
   snapshot of how the engine happened to represent it. It contains
   only the player's choices: how many dots the game started with,
   who moved first, and the ordered sequence of moves. Everything
   else — dots, edges, nextDotId, currentPlayer at any point in the
   game — is derived by replaying the moves, never stored.

   This means exportGame()/importGame() never need to change shape
   when the engine's internal state representation changes (e.g. when
   v0.9 adds region/boundary tracking) — the Game Record only ever
   describes the game, never the engine's current internals.

   v0.8.6 — no dependency on the live Engine singleton
   ──────────────────────────────────────────────────────
   Earlier, importGame() called Engine.init()/Engine.apply() directly
   against the shared Engine singleton, snapshotting and restoring it
   on failure so a bad import wouldn't corrupt a game in progress. But
   there was no equivalent protection on SUCCESS — a legal-but-unwanted
   import would silently become the live game, with no way to just
   ask "is this record valid?" or "what would this produce?" without
   it taking over the actual session.

   This file no longer imports engine.js at all. importGame() calls
   engine/rules.js's validateMove() and engine/reducer.js's applyMove()
   directly — the exact same pure functions Engine.apply() itself
   calls internally — building up a local state object and returning
   it. It never touches any shared singleton, so there is nothing to
   snapshot or restore, and calling it never has any effect on a live
   game unless the CALLER explicitly decides to act on the result
   (see gameRecordUI.js, which calls Engine.init(result.state) itself,
   only after seeing result.ok === true).

   This also makes importGame() safe to call many times in a row with
   different records — e.g. a database validating a batch of stored
   games, or a bot exploring several hypothetical continuations — with
   zero risk of one call's replay leaking into another's.

   Game Record legality is still checked by the exact same rules a
   human player's move is checked against (validateMove), never a
   second, independent implementation — that guarantee didn't depend
   on going through the Engine singleton and is preserved here.

   No DOM. No browser APIs beyond JSON, which is standard JS, not a
   browser-specific API — this file runs identically under Node.

   Depends on: reducer.js, rules.js
   ================================================================ */

import { applyMove } from './reducer.js';
import { validateMove } from './rules.js';

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
 * Builds a fresh engine state object from a (already shape-validated)
 * Game Record's starting parameters. Matches exactly what ui.js's
 * startGame() constructs for an ordinary new game.
 *
 * @param {{ initialDotCount: number, startingPlayer: number }} record
 * @returns {object} fresh engine state
 */
function buildInitialState(record) {
  return {
    dots:            buildInitialDots(record.initialDotCount),
    edges:           [],
    nextDotId:       record.initialDotCount,
    moves:           [],
    currentPlayer:   record.startingPlayer,
    initialDotCount: record.initialDotCount,
    startingPlayer:  record.startingPlayer,
  };
}

/**
 * Validates the shape of a candidate Game Record before attempting
 * to replay it.
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
 * currentPlayer: all of that is derivable by replaying moves, and
 * persisting it would tie saved files to one moment in the engine's
 * internal representation.
 *
 * @param {object} state — engine state (e.g. from Engine.getState())
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
 * through validateMove() + applyMove() — the exact same pure
 * functions Engine.apply() itself calls. There is no separate,
 * independent legality check for imported games; a Game Record is
 * only as legal as the moves it contains, verified the same way a
 * human player's moves always are.
 *
 * Operates entirely on a local state object. Never touches any
 * shared singleton, so this function has no effect on a live game
 * unless the caller explicitly acts on a successful result (e.g.
 * gameRecordUI.js calling Engine.init(result.state)).
 *
 * @param {*} record — candidate Game Record, e.g. from JSON.parse
 * @returns {{ ok: true, state: object } |
 *           { ok: false, error: string, message?: string } |
 *           { ok: false, error: string, moveIndex: number, violations: Array }}
 */
export function importGame(record) {
  const shapeCheck = validateRecordShape(record);
  if (!shapeCheck.ok) return shapeCheck;

  let state = buildInitialState(record);

  for (let i = 0; i < record.moves.length; i++) {
    const m = record.moves[i];
    const move = {
      startDotId: m.startDotId,
      endDotId:   m.endDotId,
      regionId:   m.regionId ?? 0,
    };

    const validation = validateMove(state, move);
    if (!validation.ok) {
      return {
        ok: false,
        error: ImportError.ILLEGAL_MOVE,
        moveIndex: i,
        violations: validation.violations,
      };
    }

    state = applyMove(state, move);
  }

  return { ok: true, state };
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
