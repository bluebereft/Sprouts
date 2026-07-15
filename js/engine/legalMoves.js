/* ================================================================
   legalMoves.js — Sprouts Engine Layer (v1.0 — PR 11)

   Responsibility
   ────────────────
   Answers "what legal moves exist right now?" and "is the game
   over?" — questions about the SPACE of moves, as opposed to
   rules.js's validateMove, which answers "is this ONE given move
   legal?". Kept in a separate module rather than folded into
   rules.js for that reason: rules.js validates a candidate; this
   file searches for one.

   Everything here is built ON TOP of validateMove, never by
   reimplementing its logic independently — a candidate move is only
   ever accepted after validateMove itself says so. This guarantees
   enumeration can never silently drift out of sync with the actual
   rules, at the cost of a small amount of redundant computation.

   Key optimisation, verified directly against validateMove's own
   code before relying on it (not assumed): validateMove never checks
   exteriorSide, and for a split, ANY placement whose domain exactly
   equals K (values 1 or 2) passes — spec Proposition 7.4
   ("placement freeness") — there is no such thing as an illegal
   placement shape once the domain is right. So hasLegalMove can
   cheaply pre-filter candidate corner pairs on region-sharing + lives
   alone (a simple, fast check), and only construct a full candidate
   move (with a real K-based placement) — then confirm it via
   validateMove — for the few pairs that pass the pre-filter. It never
   needs to search all 2^|K| placement combinations just to answer a
   yes/no question.

   enumerateLegalMoves does NOT take this shortcut: it returns every
   DISTINCT legal move, including every distinct placement for a
   split with occupants (K ≠ ∅), since future callers (bots, puzzle
   generation) need the real, complete move set, not just an
   existence answer.

   exteriorSide IS supplied whenever a split touches the touched
   component's own current outer/⊥ face (2, consistently — see
   buildCandidate) — required for the resulting state to stay sound
   when a move is actually APPLIED, not just checked for existence.
   Found the hard way: the random-game simulation test (which applies
   real enumerated moves in sequence, not just calls hasLegalMove)
   corrupted containment (PARENT_UNSOUND / FOREST_CYCLE) until this
   was added — leaving exteriorSide null let the reducer's default
   collide with wherever the canonical placement had just nested an
   occupant. Which occupant ends up nested vs. root is still fully
   determined by π alone (verified sufficient to hold exteriorSide
   fixed rather than also varying it — see enumerateLegalMoves).
   None of this requires real drawn geometry: which ABSTRACT side (1
   or 2) is exterior is a free, always-realisable choice by Prop 7.4,
   independent of which physical face a real curve would trace —
   only that latter fact (needed for rendering/UI, not legality or
   game-state soundness) stays out of scope here.

   Normal-play convention (confirmed for this project): the player
   who cannot move loses.

   Depends on: engine/rules.js (validateMove), engine/faces.js
               (traceFaces, cornerFace, getComponents),
               engine/containment.js (computeK), engine/move.js
               (createMove).
   ================================================================ */

import { validateMove } from './rules.js';
import { traceFaces, cornerFace, getComponents } from './faces.js';
import { computeK, resolveOuterFaceAnchor } from './containment.js';
import { createMove } from './move.js';

/**
 * Number of usable corners for a dot of the given degree — mirrors
 * rules.js's own cornerCount (degree 0 still has exactly one usable
 * corner, index 0).
 *
 * @param {number} degree
 * @returns {number}
 */
function cornerCount(degree) {
  return Math.max(degree, 1);
}

/**
 * Builds one candidate move for a given dot pair and corner pair,
 * with a real K-based placement when the move is a split with
 * occupants. Used internally by both hasLegalMove and
 * enumerateLegalMoves so they agree on construction.
 *
 * @param {object} state
 * @param {Array<{component:number,darts:number[]}>} faces
 * @param {Array<number[]>} components — getComponents() result
 * @param {number} aId
 * @param {number} bId
 * @param {number} cornerA
 * @param {number} cornerB
 * @returns {{ move: object, K: number[] }}
 */
function buildCandidate(state, faces, components, aId, bId, cornerA, cornerB) {
  const faceA = cornerFace(state.edges, state.rotations, faces, aId, cornerA);
  const faceB = cornerFace(state.edges, state.rotations, faces, bId, cornerB);
  const isSplit = faceA === faceB;

  if (!isSplit) {
    return { move: createMove(aId, bId, cornerA, cornerB, null, null), K: [] };
  }

  const touched = components.find(members => members.includes(aId));
  const rep = touched[0];
  const K = computeK(faces, state.parentAnchor, faceA, rep, state.outerFaceAnchor);

  if (K.length === 0) {
    return { move: createMove(aId, bId, cornerA, cornerB, null, null), K };
  }

  // A single canonical placement (all occupants to side 1) suffices
  // for a legality-existence check — Prop 7.4 guarantees it's valid
  // shape-wise, and validateMove will confirm it below regardless.
  //
  // exteriorSide MUST be supplied whenever this split touches the
  // touched component's OWN current outer face — otherwise the
  // reducer's default (side 1, when exteriorSide is null) collides
  // with wherever the canonical placement just nested K's occupants
  // (also side 1), leaving the component's own outer-face anchor
  // pointing at the SAME face one of its own occupants was just
  // nested into — a real, confirmed corruption (PARENT_UNSOUND /
  // FOREST_CYCLE), found by the random-game simulation actually
  // APPLYING an enumerated move, not just checking it exists. Always
  // safe to declare side 2 exterior here: nothing is assigned there
  // (every K member is on side 1 in this canonical placement), so
  // no occupant is wrongly forced to root — and per Prop 7.4 (any
  // placement is realisable by some drawing), "enclose everyone in
  // K, leave the other side empty" is always a real, drawable shape.
  const placement = {};
  K.forEach(occRep => { placement[occRep] = 1; });

  const ownOuterFace = resolveOuterFaceAnchor(faces, state.outerFaceAnchor[rep]);
  const exteriorSide = (ownOuterFace === faceA) ? 2 : null;

  return { move: createMove(aId, bId, cornerA, cornerB, placement, exteriorSide), K, exteriorSide };
}

/**
 * All 2^|K| distinct placements for a given occupant set — used only
 * by enumerateLegalMoves, which needs every distinct resulting move,
 * not just one representative.
 *
 * @param {number[]} K
 * @returns {Array<object>} each a placement object occupantRep -> 1|2
 */
function allPlacements(K) {
  const total = 1 << K.length;
  const placements = [];
  for (let mask = 0; mask < total; mask++) {
    const placement = {};
    K.forEach((occRep, idx) => { placement[occRep] = ((mask >> idx) & 1) ? 2 : 1; });
    placements.push(placement);
  }
  return placements;
}

/**
 * Does at least one legal move exist for the current player?
 * Short-circuits on the first one found. See file header for the
 * placement-freeness shortcut this relies on.
 *
 * @param {object} state
 * @returns {boolean}
 */
export function hasLegalMove(state) {
  const faces = traceFaces(state.edges, state.rotations);
  const dotIds = state.dots.map(d => d.id);
  const components = getComponents(state.edges, dotIds);

  for (let i = 0; i < state.dots.length; i++) {
    const a = state.dots[i];
    for (let j = i; j < state.dots.length; j++) {
      const b = state.dots[j];
      const isLoop = a.id === b.id;
      const livesOk = isLoop ? a.lives >= 2 : (a.lives >= 1 && b.lives >= 1);
      if (!livesOk) continue;

      const degA = cornerCount(state.rotations[a.id].length);
      const degB = isLoop ? degA : cornerCount(state.rotations[b.id].length);

      for (let ca = 0; ca < degA; ca++) {
        for (let cb = 0; cb < degB; cb++) {
          const { move } = buildCandidate(state, faces, components, a.id, b.id, ca, cb);
          if (validateMove(state, move).ok) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Every distinct legal move for the current player, including every
 * distinct placement for a split with occupants. Each returned move
 * has been individually confirmed via validateMove.
 *
 * @param {object} state
 * @returns {Array<object>} legal Move objects
 */
export function enumerateLegalMoves(state) {
  const moves = [];
  const faces = traceFaces(state.edges, state.rotations);
  const dotIds = state.dots.map(d => d.id);
  const components = getComponents(state.edges, dotIds);

  for (let i = 0; i < state.dots.length; i++) {
    const a = state.dots[i];
    for (let j = i; j < state.dots.length; j++) {
      const b = state.dots[j];
      const isLoop = a.id === b.id;
      const livesOk = isLoop ? a.lives >= 2 : (a.lives >= 1 && b.lives >= 1);
      if (!livesOk) continue;

      const degA = cornerCount(state.rotations[a.id].length);
      const degB = isLoop ? degA : cornerCount(state.rotations[b.id].length);

      for (let ca = 0; ca < degA; ca++) {
        for (let cb = 0; cb < degB; cb++) {
          const { move, K, exteriorSide } = buildCandidate(state, faces, components, a.id, b.id, ca, cb);

          if (K.length === 0) {
            if (validateMove(state, move).ok) moves.push(move);
            continue;
          }

          // exteriorSide is fixed once per corner-pair (not varied
          // per placement below) — verified sufficient, not assumed:
          // holding it constant while placement ranges over all
          // 2^|K| assignments already reaches every distinct
          // nested-vs-root outcome for K (flipping exteriorSide
          // instead would just relabel the SAME outcomes under a
          // different placement dict, not add new ones — e.g.
          // {occ:1},ext=2 and {occ:2},ext=1 both mean "occupant
          // nested"). See migration-plan.md's PR 11 entry.
          for (const placement of allPlacements(K)) {
            const candidate = createMove(a.id, b.id, ca, cb, placement, exteriorSide);
            if (validateMove(state, candidate).ok) moves.push(candidate);
          }
        }
      }
    }
  }
  return moves;
}

/**
 * Is the game over, and if so, who won? Normal-play convention: the
 * player who cannot move loses.
 *
 * @param {object} state
 * @returns {{ over: boolean, winner: ?number }}
 */
export function checkGameOver(state) {
  if (hasLegalMove(state)) return { over: false, winner: null };
  return { over: true, winner: 1 - state.currentPlayer };
}
