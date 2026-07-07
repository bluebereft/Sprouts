 /* ================================================================
   rules.js — Sprouts Engine Rules (v0.9.2 — PR 5b)

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

   v0.9.2 PR 4 — corner and placement checks
   ────────────────────────────────────────────
   validateMove gained checks for the v2 Move shape's startCorner/
   endCorner/placement fields (move.js). These check bounds and
   presence only — general region/topological legality remains
   v0.9.3's (PR 7's) job.

   placement is temporarily REQUIRED to be null/empty for every move
   validated by this version — containment doesn't exist until PR 5,
   so there's nothing to check a non-empty placement against yet.
   This is a deliberate, temporary restriction (PLACEMENT_NOT_YET_
   SUPPORTED), not a permanent rule.

   v0.9.2 PR 5b — same-component, different-face is ALWAYS illegal
   ───────────────────────────────────────────────────────────────────
   Found by PR 5's own exhaustive test (P-O2): a move whose two
   corners belong to the SAME component but land on DIFFERENT faces
   of it is illegal, unconditionally — not a restricted-scope gap,
   a general mathematical fact.

   Proof: spec D4 defines region identity as a function of (host
   component, host face) — each face of a component hosts exactly
   one region, and two DISTINCT faces of the SAME component always
   host two DISTINCT regions (there is no mechanism in D4 by which
   two different faces of one component could resolve to the same
   region). Spec §7.3 requires both corners of a legal Move to
   border the SAME region. Two corners on different faces of the
   same component therefore always border different regions, and
   the move is always illegal. This holds in full generality — it is
   NOT dependent on PR 5's restricted containment scope.

   This check is a genuine, provable SPECIAL CASE of PR 7's eventual
   general region-legality machinery ("do these two corners border
   the same region"), pulled forward because it's simple to prove
   and because leaving it unchecked let the reducer silently process
   a mathematically meaningless containment update. PR 7 should
   generalize or absorb this check, not duplicate it independently.

   Scope: this check runs ONLY when both corners are explicitly
   present (the v2 Move shape). Legacy (cornerless) moves use an
   IMPLIED corner in the reducer (an arbitrary convention, not
   necessarily faithful to a v1 game's actual history) — retroactively
   rejecting old-convention replays here would compound spec open
   question O-Q1's already-flagged ambiguity rather than resolve it.
   This residual gap for legacy replay is tied to O-Q1, not a new,
   uncontained risk.

   Future rules (added here as the engine grows)
   ─────────────────────────────────────────────
   hasLegalMoves(state) — v1.0, game-over detection.
   validateMove will grow additional (general) region-legality checks
   at v0.9.3 (PR 7) — its signature and return shape stay the same.

   These functions are pure: no DOM, no imports, no side effects.
   The same rules module can be used by the browser, bots, AI,
   replay system, and command-line tools without modification.
   ================================================================ */

import { traceFaces, getComponents, cornerFace } from './faces.js';

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
  DOT_NOT_FOUND:                 'DOT_NOT_FOUND',
  INSUFFICIENT_LIVES:            'INSUFFICIENT_LIVES',
  START_CORNER_OUT_OF_RANGE:     'START_CORNER_OUT_OF_RANGE',
  END_CORNER_OUT_OF_RANGE:       'END_CORNER_OUT_OF_RANGE',
  INCONSISTENT_CORNER_DATA:      'INCONSISTENT_CORNER_DATA',
  PLACEMENT_NOT_YET_SUPPORTED:   'PLACEMENT_NOT_YET_SUPPORTED',
  SAME_COMPONENT_DIFFERENT_FACE: 'SAME_COMPONENT_DIFFERENT_FACE',
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
 * Returns the number of valid corner indices for a vertex of the
 * given degree — max(degree, 1), per spec §10.3's "index 0 for
 * degree 0" convention (see move.js's file header for the full
 * corner-indexing convention this checks against).
 *
 * @param {number} degree
 * @returns {number}
 */
function cornerCount(degree) {
  return Math.max(degree, 1);
}

/**
 * Validates a move against the current engine state.
 * Pure function — no mutation, no side effects.
 *
 * v0.8 scope: existence and lives. v0.9.2 PR 4 scope: corner bounds
 * and placement presence. v0.9.2 PR 5b scope: same-component/
 * different-face rejection (see file header). General region
 * legality remains v0.9.3's (PR 7's) job.
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
 * @param {object} state — engine state { dots, edges, moves, rotations, ... }
 * @param {object} move  — { startDotId, endDotId, regionId, startCorner, endCorner, placement }
 * @returns {{ ok: boolean, violations: Array<{ rule: string, dotId: number }> }}
 */
export function validateMove(state, move) {
  const { startDotId, endDotId, startCorner, endCorner, placement } = move;
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

  // Corner presence must be consistent: either both corners given
  // (v2 shape) or neither (legacy v1 shape, reducer's append
  // fallback). One without the other is malformed.
  const hasStartCorner = startCorner !== null && startCorner !== undefined;
  const hasEndCorner   = endCorner   !== null && endCorner   !== undefined;

  if (hasStartCorner !== hasEndCorner) {
    violations.push({ rule: RuleError.INCONSISTENT_CORNER_DATA, dotId: startDotId });
  }

  // Corner bounds — only checkable, and only meaningful, for a dot
  // that was actually found (a missing dot already has its own
  // violation above; state.rotations has no useful entry to check
  // against for an id that doesn't exist as a dot).
  let startCornerInRange = false;
  let endCornerInRange = false;

  if (hasStartCorner && startDot) {
    const count = cornerCount(state.rotations[startDotId].length);
    if (startCorner < 0 || startCorner >= count) {
      violations.push({ rule: RuleError.START_CORNER_OUT_OF_RANGE, dotId: startDotId });
    } else {
      startCornerInRange = true;
    }
  }
  if (hasEndCorner && endDot && !isLoop) {
    const count = cornerCount(state.rotations[endDotId].length);
    if (endCorner < 0 || endCorner >= count) {
      violations.push({ rule: RuleError.END_CORNER_OUT_OF_RANGE, dotId: endDotId });
    } else {
      endCornerInRange = true;
    }
  }
  // Self-loop: both corners target the SAME vertex's SAME (current,
  // pre-move) rotation — checked once against startDotId above is
  // sufficient for range, but endCorner must independently be in
  // range too (it's a different corner index on the same vertex).
  if (hasEndCorner && startDot && isLoop) {
    const count = cornerCount(state.rotations[startDotId].length);
    if (endCorner < 0 || endCorner >= count) {
      violations.push({ rule: RuleError.END_CORNER_OUT_OF_RANGE, dotId: endDotId });
    } else {
      endCornerInRange = true;
    }
  }

  // Same-component/different-face — see file header (PR 5b). Only
  // meaningful once both corners are present AND in range; anything
  // else already has its own violation above and comparing garbage
  // indices would be meaningless.
  if (hasStartCorner && hasEndCorner && startCornerInRange && endCornerInRange) {
    const dotIds = state.dots.map(d => d.id);
    const components = getComponents(state.edges, dotIds);
    const componentOf = new Map();
    components.forEach(members => members.forEach(id => componentOf.set(id, members[0])));

    if (componentOf.get(startDotId) === componentOf.get(endDotId)) {
      const faces = traceFaces(state.edges, state.rotations);
      const startFace = cornerFace(state.edges, state.rotations, faces, startDotId, startCorner);
      const endFace    = cornerFace(state.edges, state.rotations, faces, endDotId, endCorner);
      if (startFace !== endFace) {
        violations.push({ rule: RuleError.SAME_COMPONENT_DIFFERENT_FACE, dotId: startDotId });
      }
    }
  }

  // Placement (spec's π): temporarily required to be empty — see
  // file header. A non-null, non-empty value can't yet be checked
  // against real containment (PR 5), so it's rejected rather than
  // silently ignored.
  const placementIsEmpty =
    placement === null || placement === undefined ||
    (typeof placement === 'object' && Object.keys(placement).length === 0);
  if (!placementIsEmpty) {
    violations.push({ rule: RuleError.PLACEMENT_NOT_YET_SUPPORTED, dotId: startDotId });
  }

  return { ok: violations.length === 0, violations };
}
