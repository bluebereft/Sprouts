 /* ================================================================
   reducer.js — Sprouts Engine Core (v0.5)

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
 * @param {Object} state        - current engine state
 * @param {Array}  state.dots   - all dots on board { id, lives }
 * @param {Array}  state.edges  - all edges { a, b }
 * @param {number} state.nextDotId - next dot id counter
 * @param {Array}  state.moves  - move history
 * @param {Object} move         - move object { startDotId, endDotId }
 *
 * @returns {Object} new game state
 */
export function applyMove(state, move) {
  const { startDotId, endDotId } = move;

  // 1. Reduce lives of both selected endpoints
  const updatedDots = state.dots.map(dot => {
    if (dot.id === startDotId || dot.id === endDotId) {
      return {
        ...dot,
        lives: dot.lives - 1
      };
    }
    return dot;
  });

  // 2. Create new dot (sprout point).
  // x and y are deliberately absent — screen coordinates are not
  // part of the mathematical game state. The browser client stores
  // dot positions in boardView.js.
  const newDot = {
    id:    state.nextDotId,
    lives: 3,
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

  // 5. Return new immutable state
  return {
    ...state,
    dots: [...updatedDots, newDot],
    edges: newEdges,
    moves: newMoves,
    nextDotId: state.nextDotId + 1
  };
}