 /* ================================================================
   reducer.js — Sprouts Engine Core (v0.9.2 — PR 4)

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

   v0.9.2 PR 2/3 — σ (rotation system) maintenance
   ─────────────────────────────────────────────────
   state.rotations[v] is the array of dart ids originating at vertex
   v. Per the accepted specification's S1, edge k owns darts 2k/2k+1
   (see js/engine/darts.js for the pinned convention; this file uses
   the same arithmetic directly rather than importing darts.js, since
   only edge-index → dart-id arithmetic is needed here).

   v0.9.2 PR 4 — corner-driven insertion
   ────────────────────────────────────────
   If move.startCorner and move.endCorner are both present, the new
   darts are inserted at exactly those corners — real σ, not a
   placeholder. If either is absent, both new endpoint darts fall
   back to APPEND (unchanged from PR 2). This is a general
   convenience for any caller that doesn't need to specify an exact
   corner (tests, bots, quick construction) — as of PR 8, it is no
   longer tied to Game Record compatibility; formatVersion 1 (the
   only format this fallback was ever specifically needed for) is
   dropped entirely (spec O-Q1, product ruling).

   Every move still performs exactly ONE uniform update regardless of
   normal/loop distinctions (spec §8.1) — corner-driven insertion is
   uniform too: a self-loop's two insertions target the SAME vertex,
   handled by applyCornerInsertions() processing both against the
   ORIGINAL (pre-move) rotation in descending corner-index order, so
   neither insertion invalidates the other's target position. Ties
   (both corners naming the same gap) are broken deterministically
   but arbitrarily — the orientation-sensitive version of that choice
   is deferred to PR 5 (spec P-O3, revised at PR 3).

   The new sprout's rotation is ALWAYS built fresh via append, in
   creation order, regardless of whether real corners were used for
   the endpoints — spec §8.1: a 2-element cyclic order is unique, so
   no corner/convention applies to it.

   v0.9.2 PR 5 — containment update
   ─────────────────────────────────
   After the σ-update, the move is classified (split if both corners
   resolved to the SAME face before the move, merge otherwise — spec
   D7) and the corresponding containment update (spec §8.2) is
   applied via containment.js. RESTRICTED to the cases verified at
   PR 5 (see containment.js's file header): merges of two root
   components with no occupants, and splits with K = ∅. Nested
   containment is a known, documented limitation, not yet handled.

   For moves without explicit corners, classification uses an
   IMPLIED corner — "after the last existing dart" (or the trivial
   corner 0 for degree-0), exactly matching what the append fallback
   above already does structurally. This keeps classification
   well-defined for every move this function accepts, without
   requiring a branch in the containment logic itself.

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

import { traceFaces, getComponents, cornerFace } from './faces.js';
import { updateContainmentForMerge, updateContainmentForSplit, computeK } from './containment.js';

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
 * @param {object} state.outerFaceAnchor - containment (v0.9.2 PR 5)
 * @param {object} state.parentAnchor    - containment (v0.9.2 PR 5)
 * @param {Object} move                - { startDotId, endDotId, startCorner, endCorner, placement }
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

  // 3b. σ maintenance — see file header.
  const newRotations = state.rotations.map(r => r.slice());
  newRotations.push([]); // fresh, empty rotation for the new sprout

  function appendDart(vertexId, dart) {
    newRotations[vertexId] = [...newRotations[vertexId], dart];
  }

  // Applies one or more corner-indexed insertions to a SINGLE
  // vertex's rotation, all expressed as indices into the ORIGINAL
  // (pre-this-move) array. Descending original-index order ensures
  // each splice only affects positions after ones already handled —
  // see file header for why this matters for self-loops.
  function applyCornerInsertions(vertexId, insertions) {
    const sorted = [...insertions].sort((a, b) => b.cornerIndex - a.cornerIndex);
    let rotation = newRotations[vertexId];
    for (const { cornerIndex, dart } of sorted) {
      if (rotation.length === 0) {
        rotation = [dart];
      } else {
        const updated = rotation.slice();
        updated.splice(cornerIndex + 1, 0, dart);
        rotation = updated;
      }
    }
    newRotations[vertexId] = rotation;
  }

  const hasCorners = move.startCorner !== null && move.startCorner !== undefined
                   && move.endCorner  !== null && move.endCorner  !== undefined;

  const startDart   = 2 * firstEdgeIndex;
  const sproutDartA = 2 * firstEdgeIndex + 1;
  const endDart     = 2 * (firstEdgeIndex + 1);
  const sproutDartB = 2 * (firstEdgeIndex + 1) + 1;

  if (hasCorners) {
    if (isLoop) {
      applyCornerInsertions(startDotId, [
        { cornerIndex: move.startCorner, dart: startDart },
        { cornerIndex: move.endCorner,   dart: endDart },
      ]);
    } else {
      applyCornerInsertions(startDotId, [{ cornerIndex: move.startCorner, dart: startDart }]);
      applyCornerInsertions(endDotId,   [{ cornerIndex: move.endCorner,   dart: endDart   }]);
    }
  } else {
    appendDart(startDotId, startDart);
    appendDart(endDotId, endDart);
  }

  // Sprout's rotation: always fresh append, in creation order — see
  // file header (no corner/convention applies to a new vertex).
  appendDart(newDot.id, sproutDartA);
  appendDart(newDot.id, sproutDartB);

  // 3c. Classification + containment update — see file header.
  const oldFaces = traceFaces(state.edges, state.rotations); // BEFORE this move

  function impliedCorner(vertexId) {
    const len = state.rotations[vertexId].length;
    return len === 0 ? 0 : len - 1;
  }
  const startCornerResolved = hasCorners ? move.startCorner : impliedCorner(startDotId);
  const endCornerResolved   = hasCorners ? move.endCorner   : impliedCorner(endDotId);

  const startFace = cornerFace(state.edges, state.rotations, oldFaces, startDotId, startCornerResolved);
  const endFace   = cornerFace(state.edges, state.rotations, oldFaces, endDotId,   endCornerResolved);
  const isSplit   = startFace === endFace;

  const newFaces = traceFaces(newEdges, newRotations); // AFTER this move
  const newDartsForThisMove = [startDart, sproutDartA, endDart, sproutDartB];

  const componentsBefore = getComponents(state.edges, state.dots.map(d => d.id));

  let newOuterFaceAnchor;
  let newParentAnchor;

  if (isSplit) {
    const touchedComponent = componentsBefore.find(members => members.includes(startDotId));
    const rep = touchedComponent[0];
    // K is computed against the OLD face being split, using the OLD
    // anchors — the occupants as they stood before this move. The
    // outerFaceAnchor argument enables computeK's ⊥ (plane's outer
    // region) branch (PR 10), so sibling roots are seen as occupants
    // when the shared outer region is split.
    const K = computeK(oldFaces, state.parentAnchor, startFace, rep, state.outerFaceAnchor);
    const placement = move.placement || {};
    const exteriorSide = (move.exteriorSide === undefined) ? null : move.exteriorSide;
    ({ outerFaceAnchor: newOuterFaceAnchor, parentAnchor: newParentAnchor } =
      updateContainmentForSplit(
        state.outerFaceAnchor, state.parentAnchor, rep,
        oldFaces, startFace, newFaces, newDartsForThisMove,
        K, placement, exteriorSide
      ));
  } else {
    const startComponent = componentsBefore.find(members => members.includes(startDotId));
    const endComponent   = componentsBefore.find(members => members.includes(endDotId));
    const repA = startComponent[0];
    const repB = endComponent[0];
    ({ outerFaceAnchor: newOuterFaceAnchor, parentAnchor: newParentAnchor } =
      updateContainmentForMerge(
        state.outerFaceAnchor, state.parentAnchor, repA, repB,
        newFaces, newDartsForThisMove
      ));
  }

  // 4. Append the new move to the move history.
  const newMoves = [
    ...(state.moves || []),
    move
  ];

  // 5. Return new immutable state.
  //    currentPlayer toggles between 0 and 1 after every move.
  return {
    ...state,
    dots:            [...updatedDots, newDot],
    edges:           newEdges,
    moves:           newMoves,
    nextDotId:       state.nextDotId + 1,
    currentPlayer:   state.currentPlayer === 0 ? 1 : 0,
    rotations:       newRotations,
    outerFaceAnchor: newOuterFaceAnchor,
    parentAnchor:    newParentAnchor,
  };
}