 /* ================================================================
   reducer.js — Sprouts Engine Core (v0.9.2)

   Responsibility
   ──────────────
   Pure function that applies a Move to a Game State.

   ASSUMES THE MOVE IS ALREADY LEGAL. As of v0.8, engine.js calls
   engine/rules.js's validateMove() and only invokes this function
   if validation passes — see engine.js. This function performs no
   legality checking itself and never will; keeping it a pure,
   unconditional state transition is what makes it easy to reason
   about, test, and reuse for replay.

   ALSO ASSUMES state.rotations IS PRESENT AND WELL-FORMED — one
   array entry per existing dot, matching how state.dots/state.edges
   are already assumed well-formed. Construction of correct starting
   state is buildInitialTopology()'s job (regions.js), not this
   function's; every fixture that calls applyMove() must seed
   rotations via buildInitialTopology(), the same way v0.9 fixtures
   already had to start seeding regions/boundaries.

   v0.9.2 — σ (rotation system) maintenance
   ─────────────────────────────────────────
   state.rotations[v] is the array of dart ids originating at vertex
   v, in insertion order. Per the accepted specification's S1, edge k
   owns darts 2k/2k+1 (see js/engine/darts.js for the pinned
   convention; this file uses the same arithmetic directly rather
   than importing darts.js, since only edge-index → dart-id
   arithmetic is needed here, not any of darts.js's dart-based
   lookups — see docs/migration-plan.md's PR 2 design notes).

   Every move performs exactly ONE uniform update, regardless of
   normal/loop distinctions (spec §8.1): for each of the two new
   edges {a, b}, append dart 2k to rotations[a] and dart 2k+1 to
   rotations[b]. A self-loop's two new edges share the same `a`
   vertex, so that vertex simply receives both new darts, in edge-
   creation order — no branch is needed anywhere below.

   Insertion position within each vertex's rotation is currently a
   deterministic placeholder (append at the end) — nothing reads
   rotation ORDER yet, only membership and cardinality (see
   docs/specifications/topological-model.md §8.1, and the migration
   plan's Stage A). Real corner-driven insertion arrives at PR 4.

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
 * @param {Array}  state.rotations     - σ: rotations[v] = dart ids at v
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

  // The array index the FIRST of this move's two new edges will
  // occupy once appended — also needed before the edges array is
  // rebuilt below, since it determines the new darts' ids (edge k
  // owns darts 2k/2k+1).
  const firstEdgeIndex = state.edges.length;

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

  // 3b. σ maintenance — see file header. One uniform rule, applied
  //     to both new edges unconditionally; a self-loop's shared `a`
  //     vertex naturally receives both appends in sequence below,
  //     since appendDart always reads/writes the SAME running
  //     newRotations array, never the original (stale) state.
  const newRotations = state.rotations.map(r => r.slice());
  newRotations.push([]); // fresh, empty rotation for the new sprout

  function appendDart(vertexId, dart) {
    newRotations[vertexId] = [...newRotations[vertexId], dart];
  }

  appendDart(startDotId, 2 * firstEdgeIndex);           // edge L's 'a' dart
  appendDart(newDot.id,  2 * firstEdgeIndex + 1);        // edge L's 'b' dart
  appendDart(endDotId,   2 * (firstEdgeIndex + 1));      // edge L+1's 'a' dart
  appendDart(newDot.id,  2 * (firstEdgeIndex + 1) + 1);  // edge L+1's 'b' dart

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
    rotations:     newRotations,
  };
}