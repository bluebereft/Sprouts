/* ================================================================
   rules.js — Sprouts Engine Rules (v0.8)

   Responsibility
   ──────────────
   Pure functions that encode the rules of Sprouts.

   This is the canonical home for game knowledge that lives above
   the reducer (which handles state transitions) but below the UI
   (which handles interaction). Any module that needs to ask a
   question about the rules of Sprouts imports from here.

   Current rules
   ─────────────
   playerForMove  — which player acts on a given move index.
   isExhausted    — whether a dot has no lives remaining.
   validateMove   — whether a move is legal against the current state.

   Future rules (added here as the engine grows)
   ─────────────────────────────────────────────
   hasLegalMoves(state) — v1.0, game-over detection.
   validateMove will grow additional checks at v0.9/v1.0 (crossings,
   regions) — its signature and return shape stay the same; only the
   body grows to push more entries into the violations array.

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

/**
 * Coded violation reasons returned by validateMove(). Deliberately
 * not English strings — the UI decides how to render each code into
 * player-facing text (see ui.js VIOLATION_MESSAGES). Bots, replay,
 * and tests only ever need the code, never prose.
 */
export const RuleError = {
  DOT_NOT_FOUND:      'DOT_NOT_FOUND',
  INSUFFICIENT_LIVES: 'INSUFFICIENT_LIVES',
};

/**
 * Returns true if a dot has no lives remaining.
 *
 * <= 0 rather than === 0: before this file's validateMove existed,
 * a UI-layer gap could let an illegal move through and drive a dot's
 * lives negative (e.g. an unchecked self-loop on a 1-life dot).
 * validateMove now prevents that at the source, but the exhaustion
 * check stays defensive — treating any non-positive value as
 * exhausted costs nothing and guards against any future path that
 * might otherwise under-check.
 *
 * @param {{ lives: number }} dot
 * @returns {boolean}
 */
export function isExhausted(dot) {
  return dot.lives <= 0;
}

/**
 * Validates a move against the current engine state.
 * Pure function — no mutation, no side effects.
 *
 * v0.8 scope: existence and lives only. Crossings and regions are
 * deferred to v0.9/v1.0 — this function will grow more checks then,
 * but its signature and return shape stay the same.
 *
 * Collects ALL applicable violations rather than stopping at the
 * first, so a single call tells the caller everything wrong with a
 * move (e.g. both endpoints simultaneously out of lives), rather
 * than requiring repeated calls to discover each problem in turn.
 *
 * Self-loop (startDotId === endDotId) and normal moves are checked
 * as mutually exclusive branches, not layered checks — a loop needs
 * exactly one combined lives >= 2 check on the single dot involved,
 * never two independent lives >= 1 checks against the same dot
 * (which would both pass a 1-life dot even though a loop on it is
 * actually illegal).
 *
 * @param {object} state — engine state { dots, edges, moves, ... }
 * @param {object} move  — { startDotId, endDotId, regionId }
 * @returns {{ ok: boolean, violations: Array<{ rule: string, dotId: number }> }}
 */
export function validateMove(state, move) {
  const { startDotId, endDotId } = move;
  const isLoop = startDotId === endDotId;
  const violations = [];

  const startDot = state.dots.find(d => d.id === startDotId);
  const endDot    = isLoop ? startDot : state.dots.find(d => d.id === endDotId);

  if (!startDot) {
    violations.push({ rule: RuleError.DOT_NOT_FOUND, dotId: startDotId });
  }
  if (!isLoop && !endDot) {
    violations.push({ rule: RuleError.DOT_NOT_FOUND, dotId: endDotId });
  }

  // Lives checks only run for dots that were actually found — a
  // missing dot already produced its own violation above, and there
  // is nothing meaningful to say about its lives.
  if (isLoop) {
    if (startDot && startDot.lives < 2) {
      violations.push({ rule: RuleError.INSUFFICIENT_LIVES, dotId: startDotId });
    }
  } else {
    if (startDot && startDot.lives < 1) {
      violations.push({ rule: RuleError.INSUFFICIENT_LIVES, dotId: startDotId });
    }
    if (endDot && endDot.lives < 1) {
      violations.push({ rule: RuleError.INSUFFICIENT_LIVES, dotId: endDotId });
    }
  }

  return { ok: violations.length === 0, violations };
}
