 /* ================================================================
   reducer.js — Sprouts Engine Core (v0.6.1)

   Responsibility
   ──────────────
   Pure function that applies a Move to a Game State.

   IMPORTANT RULES:
   - NO DOM access
   - NO UI state
   - NO rendering logic
   - MUST be deterministic
   - SAME INPUT → SAME OUTPUT

   This is the foundation for:
   - solver
   - replay system
   - database storage
   ================================================================ */

/**
 * Applies a move to the current game state and returns a new state.
 *
 * NOTE:
 * This is a simplified Sprouts model aligned with your current system.
 * (No planar embedding yet — v0.4 keeps engine lightweight.)
 *
 * @param {Object} state               - current engine state
 * @param {Array}  state.dots          - all dots { id, lives }
 * @param {Array}  state.edges         - all edges { a, b }
 * @param {number} state.nextDotId     - next dot id counter
 * @param {Array}  state.moves         - move history
 * @param {number} state.currentPlayer - 0 or 1
 * @param {Object} move                - { startDotId, endDotId }
 *
 * @returns {Object} new game state
 */
export function applyMove(state, move) {
  const { startDotId, endDotId } = move;
  const isLoop = startDotId === endDotId;

  // 1. Decrement lives of endpoint dots.
  //    A self-loop touches the same dot twice, consuming 2 lives.
  //    A normal move consumes 1 life from each of the two endpoints.
  //    Invariant: every move reduces total lives across all dots by
  //    exactly 1 (2 consumed by the edge, 1 restored by the new dot).
  const updatedDots = state.dots.map(dot => {
    if (isLoop && dot.id === startDotId) {
      return { ...dot, lives: dot.lives - 2 };
    }
    if (!isLoop && (dot.id === startDotId || dot.id === endDotId)) {
      return { ...dot, lives: dot.lives - 1 };
    }
    return dot;
  });

  // 2. Create new sprout dot.
  //    The new dot is born with the connecting curve passing through
  //    it, accounting for 2 of its 3 allowed connections. It therefore
  //    starts with 1 life remaining, not 3.
  //    Coordinates are absent — screen positions live in boardView.js.
  const newDot = {
    id:    state.nextDotId,
    lives: 1,
  };

  // 3. Create new edges connecting endpoints → new dot
  const newEdges = [
    ...state.edges,
    {
      a: startDotId,
      b: newDot.id
    },
    {
      a: endDotId,
      b: newDot.id
    }
  ];

  // 4. Append the new move to the move history.
  const newMoves = [
    ...(state.moves || []),
    move
  ];

  // 5. Return new immutable state.
  //    currentPlayer toggles between 0 and 1 after every move.
  return {
    ...state,
    dots:          [...updatedDots, newDot],
    edges:         newEdges,
    moves:         newMoves,
    nextDotId:     state.nextDotId + 1,
    currentPlayer: state.currentPlayer === 0 ? 1 : 0,
  };
}