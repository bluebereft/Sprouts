/* ================================================================
   engine.js — Sprouts Engine Wrapper (v0.8)

   Responsibility
   ──────────────
   Stateful wrapper around the pure reducer and rules. Holds the
   current engine state and exposes the engine's public API.

   v0.8 — validate/apply split
   ────────────────────────────
   validate(move)  — checks legality without applying. Never mutates
                      state. Lets a caller (bot, UI, test) cheaply ask
                      "would this work" before committing to it.

   apply(move)     — validates first; only calls the reducer if legal.
                      On success: state is updated, returns
                        { ok: true, state }.
                      On failure: internal state is left COMPLETELY
                      UNCHANGED, returns { ok: false, violations }.
                      The reducer is never invoked for an illegal
                      move — it continues to assume every move it
                      receives is already legal.

   This makes calling apply() with a move that turns out to be
   illegal a safe, side-effect-free no-op from the caller's point of
   view — important for a bot trying many candidate moves.
   ================================================================ */

import { applyMove } from './reducer.js';
import { validateMove } from './rules.js';

let engineState = null;

function init(initialState) {
  engineState = {
    ...initialState,
    moves: initialState.moves || []
  };
}

function getState() {
  return engineState;
}

/**
 * Validates a move against the current state without applying it.
 * @param {object} move
 * @returns {{ ok: boolean, violations: Array<{rule: string, dotId: number}> }}
 */
function validate(move) {
  return validateMove(engineState, move);
}

/**
 * Validates and, if legal, applies a move.
 * @param {object} move
 * @returns {{ ok: true, state: object } | { ok: false, violations: Array }}
 */
function apply(move) {
  const result = validate(move);
  if (!result.ok) {
    return { ok: false, violations: result.violations };
  }
  engineState = applyMove(engineState, move);
  return { ok: true, state: engineState };
}

export default {
  init,
  validate,
  apply,
  getState
};
