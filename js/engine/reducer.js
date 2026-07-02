 /* ================================================================
   reducer.js — Sprouts Engine Core (v0.8.6)

   Responsibility
   ──────────────
   Pure function that applies a Move to a Game State.

   ASSUMES THE MOVE IS ALREADY LEGAL. As of v0.8, engine.js calls
   engine/rules.js's validateMove() and only invokes this function
   if validation passes — see engine.js. This function performs no
   legality checking itself and never will; keeping it a pure,
   unconditional state transition is what makes it easy to reason
   about, test, and reuse for replay.

   v0.8.6 — edge provenance
   ────────────────────────
   Each edge now carries originatingMoveIndex: the position of the
   move that created it within THIS game's own move history (i.e.
   state.moves.length at the moment the edge is created — the same
   local, per-playthrough indexing already used everywhere else a
   move is referenced, e.g. Game Records, BoardView's edgePaths map).

   This is explicit provenance, not a global move identifier — a
   move is an event within one playthrough, not a mathematical
   entity with its own identity, so there is no moveId counter here.
   Before this, the only way to know which move produced an edge was
   positional arithmetic (floor(edgeIndex / 2)) duplicated across
   renderer.js and implicitly assumed by boardView.js. That's now
   explicit data on the edge itself.

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
 * @param {Object} state               - current engine state
 * @param {Array}  state.dots          - all dots { id, lives }
 * @param {Array}  state.edges         - all edges { a, b, originatingMoveIndex }
 * @param {number} state.nextDotId     - next dot id counter
 * @param {Array}  state.moves         - move history
 * @param {number} state.currentPlayer - 0 or 1
 * @param {Object} move                - { startDotId, endDotId, regionId }
 *
 * @returns {Object} new game state
 */
export function applyMove(state, move) {
  const { startDotId, endDotId } = move;
  const isLoop = startDotId === endDotId;

  // The index this move will occupy in state.moves once appended —
  // computed before the append, since it's needed to stamp the
  // edges below. This is a LOCAL index, scoped to this game's own
  // move history, not a globally unique identifier.
  const moveIndex = state.moves.length;

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

  // 3. Create new edges connecting endpoints → new dot.
  //    originatingMoveIndex is explicit provenance — see file header.
  const newEdges = [
    ...state.edges,
    {
      a: startDotId,
      b: newDot.id,
      originatingMoveIndex: moveIndex,
    },
    {
      a: endDotId,
      b: newDot.id,
      originatingMoveIndex: moveIndex,
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