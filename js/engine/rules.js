/* ================================================================
   rules.js — Sprouts Engine Rules (v0.7)

   Responsibility
   ──────────────
   Pure functions that encode the rules of Sprouts.

   This is the canonical home for game knowledge that lives above
   the reducer (which handles state transitions) but below the UI
   (which handles interaction). Any module that needs to ask a
   question about the rules of Sprouts imports from here.

   Current rules
   ─────────────
   playerForMove — which player acts on a given move index.

   Future rules (added here as the engine grows)
   ─────────────────────────────────────────────
   isExhausted(dot)          — v0.8, replaces UI-layer lives guard
   isMoveLegal(state, move)  — v0.8, full legality enforcement
   hasLegalMoves(state)      — v1.0, game-over detection

   These functions are pure: no DOM, no imports, no side effects.
   The same rules module can be used by the browser, bots, AI,
   replay system, and command-line tools without modification.
   ================================================================ */

/**
 * Returns the player (0 or 1) who makes the move at the given index.
 *
 * Player alternation is a fundamental rule of Sprouts — turns pass
 * strictly between the two players after every move, with no
 * exceptions. This function encodes that rule.
 *
 * The starting player is 0 by convention in standard play. Passing
 * a different startingPlayer supports hypothetical reconstructions
 * or future variants, but callers should use the default in normal use.
 *
 * @param {number} moveIndex      — 0-based position in state.moves
 * @param {number} startingPlayer — 0 or 1 (default: 0)
 * @returns {0|1}
 */
export function playerForMove(moveIndex, startingPlayer = 0) {
  return (startingPlayer + moveIndex) % 2;
}
