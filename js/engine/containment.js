/* ================================================================
   containment.js — Sprouts Engine Containment (v0.9.2 — PR 5)

   Responsibility
   ──────────────
   Containment (spec §3): outerFaceAnchor and parentAnchor, keyed by
   component representative (spec §10.2 — smallest vertex id). This
   is the third and final piece of authoritative state alongside
   darts (S1) and σ (S2) — proven not derivable from (edges, σ) alone
   (spec Appendix A.1).

   Anchor representation
   ──────────────────────
   outerFaceAnchor[rep]: { kind: 'vertex', value: v } (isolated
   vertex — its own trivial face) or { kind: 'dart', value: d }.
   parentAnchor[rep]: a dart number, or null (⊥ — the plane's outer
   region; spec §3.4 — parentAnchor is NEVER a vertex-token, since an
   isolated vertex cannot be a parent).

   SCOPE RESTRICTION (deliberate, flagged at PR 5 design review —
   see docs/migration-plan.md's PR 5 entry)
   ─────────────────────────────────────────────────────────────────
   This PR implements and verifies containment updates ONLY for:
     - MERGE of two components that are BOTH currently roots
       (parentAnchor === null for both) with no occupants of their
       own — the ordinary "connect two separate structures" case.
     - SPLIT of a component's own face when K = ∅ (no occupants) —
       matching PR 4's existing placement restriction.
   Nested containment (merging/splitting a component that already
   has its own occupants) is NOT handled here — a known, documented
   limitation, not silently assumed away.

   A SECOND, related limitation surfaced by PR 5's own exhaustive
   test (P-O2, tests/engine/regions.test.js): connecting two corners
   that are ALREADY in the SAME component but on DIFFERENT faces of
   it (e.g. a chord between two points on an existing multi-face
   structure) is neither a clean merge (repA === repB — there's only
   one component, not two to combine) nor a clean split (the two
   corners aren't on the same face, so isSplit is false) under the
   classification this file uses. This case is NOT handled correctly
   here — calling updateContainmentForMerge with repA === repB
   produces a syntactically harmless but mathematically meaningless
   no-op, not a correct containment update. It is excluded by
   construction from every test in this PR (self-loops always
   compare a vertex's corner against itself — trivially the same
   face; cross-component moves are always genuine root merges, since
   nothing in this restricted universe ever becomes non-root — see
   the PR 5 implementation review for why these two guarantees
   together mean the restriction is actually CLOSED under every move
   reachable so far, not just a narrow slice of it).

   The functions below trust their preconditions (reducer.js only
   calls them when they apply) rather than defensively checking,
   consistent with this project's existing "reducer trusts the
   caller" philosophy.

   Depends on: nothing. Every function here operates on already-
   traced faces (from faces.js's traceFaces()) passed in as a
   parameter — this module never calls traceFaces itself, keeping it
   a pure function of whatever face structure the caller already
   computed.
   ================================================================ */

/**
 * Resolves a dart to the face (from a traceFaces() result) that
 * contains it. Returns null if not found.
 *
 * @param {Array<{component:number, darts:number[]}>} faces
 * @param {number} dart
 * @returns {?{component:number, darts:number[]}}
 */
function resolveDartFace(faces, dart) {
  return faces.find(f => f.darts.includes(dart)) ?? null;
}

/**
 * Resolves an outerFaceAnchor value to a face.
 *
 * @param {Array<{component:number, darts:number[]}>} faces
 * @param {{kind: 'vertex'|'dart', value: number}} anchor
 * @returns {?{component:number, darts:number[]}}
 */
export function resolveOuterFaceAnchor(faces, anchor) {
  if (anchor.kind === 'vertex') {
    return faces.find(f => f.component === anchor.value && f.darts.length === 0) ?? null;
  }
  return resolveDartFace(faces, anchor.value);
}

/**
 * Resolves a parentAnchor value to a face, or null for ⊥ (the
 * plane's outer region — not itself a face object).
 *
 * @param {Array<{component:number, darts:number[]}>} faces
 * @param {?number} anchor — a dart, or null (⊥)
 * @returns {?{component:number, darts:number[]}} null means EITHER
 *   ⊥ or "not found" — callers needing to distinguish should check
 *   `anchor === null` themselves first.
 */
export function resolveParentAnchor(faces, anchor) {
  if (anchor === null) return null;
  return resolveDartFace(faces, anchor);
}

/**
 * Computes K — the occupant component representatives of a host
 * face, excluding the touched component itself (spec §7.2).
 *
 * @param {Array<{component:number, darts:number[]}>} faces — a
 *   single traceFaces() result; hostFace MUST be a face object from
 *   this SAME array (compared by reference)
 * @param {object} parentAnchor — state.parentAnchor
 * @param {object} hostFace — the face object occupants are checked against
 * @param {number} excludeRep — the touched component's own representative
 * @returns {number[]} occupant representatives (as numbers)
 */
export function computeK(faces, parentAnchor, hostFace, excludeRep) {
  const occupants = [];
  for (const key of Object.keys(parentAnchor)) {
    const rep = Number(key);
    if (rep === excludeRep) continue;
    const resolvedFace = resolveParentAnchor(faces, parentAnchor[key]);
    if (resolvedFace === hostFace) {
      occupants.push(rep);
    }
  }
  return occupants;
}

/**
 * Containment update for a MERGE (double-boundary move) — spec
 * §8.2. RESTRICTED to both components being roots with no occupants
 * (see file header). Trusts this precondition; does not verify it.
 *
 * @param {object} outerFaceAnchor — state.outerFaceAnchor (old)
 * @param {object} parentAnchor — state.parentAnchor (old)
 * @param {number} repA — representative of the first component
 * @param {number} repB — representative of the second component
 * @param {Array<{component:number, darts:number[]}>} newFaces —
 *   traceFaces() result AFTER the move's σ-update
 * @param {number[]} newDarts — the 4 dart ids this move created
 * @returns {{ outerFaceAnchor: object, parentAnchor: object }}
 */
export function updateContainmentForMerge(outerFaceAnchor, parentAnchor, repA, repB, newFaces, newDarts) {
  const survivingRep = Math.min(repA, repB);
  const removedRep = survivingRep === repA ? repB : repA;

  // The fused face: the one new face containing any of this move's
  // new darts (exactly one, per the hand-traced bridge/tree case in
  // PR 3 — a merge fuses the two old outer faces into one new face
  // wrapping around the new sprout).
  const fusedFace = newFaces.find(f => newDarts.some(d => f.darts.includes(d)));

  const newOuterFaceAnchor = { ...outerFaceAnchor };
  delete newOuterFaceAnchor[removedRep];
  newOuterFaceAnchor[survivingRep] = { kind: 'dart', value: fusedFace.darts[0] };

  const newParentAnchor = { ...parentAnchor };
  delete newParentAnchor[removedRep];
  newParentAnchor[survivingRep] = null; // still a root

  return { outerFaceAnchor: newOuterFaceAnchor, parentAnchor: newParentAnchor };
}

/**
 * Containment update for a SPLIT (single-boundary move) — spec
 * §8.2. RESTRICTED to K = ∅ (see file header). Trusts this
 * precondition; does not verify it.
 *
 * The component's own representative never changes on a split (no
 * merge occurs). parentAnchor[rep] never changes either — a split
 * only restructures the component's OWN internal faces; its
 * relationship to its parent (if any) is untouched. Only
 * outerFaceAnchor[rep] might need updating, and only if the face
 * that split was the one outerFaceAnchor was pointing to.
 *
 * @param {object} outerFaceAnchor
 * @param {object} parentAnchor
 * @param {number} rep — the touched component's representative
 * @param {Array<{component:number, darts:number[]}>} oldFaces —
 *   traceFaces() result BEFORE the move
 * @param {object} splitFace — the (old) face that split — the face
 *   object from oldFaces that both corners resolved to
 * @param {Array<{component:number, darts:number[]}>} newFaces —
 *   traceFaces() result AFTER the move
 * @param {number[]} newDarts — the 4 dart ids this move created
 * @returns {{ outerFaceAnchor: object, parentAnchor: object }}
 */
export function updateContainmentForSplit(outerFaceAnchor, parentAnchor, rep, oldFaces, splitFace, newFaces, newDarts) {
  const oldOuterFace = resolveOuterFaceAnchor(oldFaces, outerFaceAnchor[rep]);
  const outerFaceWasSplit = oldOuterFace === splitFace;

  const newParentAnchor = { ...parentAnchor }; // never changes on a split (see header)

  if (!outerFaceWasSplit) {
    // outerFaceAnchor still correctly resolves to its old (unchanged)
    // face — nothing to do.
    return { outerFaceAnchor: { ...outerFaceAnchor }, parentAnchor: newParentAnchor };
  }

  // The two new faces descending from the split: this component's
  // faces (post-move) that contain any of the move's new darts.
  const descendants = newFaces.filter(
    f => f.component === rep && newDarts.some(d => f.darts.includes(d))
  );

  // Deterministic but arbitrary choice of which becomes the new
  // outer face (P-O3, revised at PR 3: orientation isn't tracer-
  // decidable; since K = ∅, nothing currently distinguishes the two
  // faces functionally, so any fixed, documented rule is valid).
  // Rule: the one whose smallest dart is smaller.
  const newOuterFace = descendants.reduce((a, b) =>
    Math.min(...a.darts) <= Math.min(...b.darts) ? a : b
  );

  const newOuterFaceAnchor = { ...outerFaceAnchor };
  newOuterFaceAnchor[rep] = { kind: 'dart', value: newOuterFace.darts[0] };

  return { outerFaceAnchor: newOuterFaceAnchor, parentAnchor: newParentAnchor };
}

/**
 * Checks containment invariants I-1 through I-4 (spec §9.2) — a NEW
 * checker, additive alongside regions.js's existing (untouched)
 * checkInvariants(). Does not check I-5 (Euler) or I-6/I-7 (lives) —
 * those are checked by checkInvariantsV2 in regions.js, which calls
 * this function for the containment-specific subset.
 *
 * @param {object} state
 * @param {Array<{component:number, darts:number[]}>} faces — a
 *   traceFaces() result for the CURRENT state
 * @param {number[][]} components — a getComponents() result for the
 *   CURRENT state
 * @returns {{ ok: boolean, violations: Array<object> }}
 */
export const ContainmentError = {
  KEY_SET_MISMATCH:       'KEY_SET_MISMATCH',
  OUTER_FACE_UNSOUND:     'OUTER_FACE_UNSOUND',
  PARENT_UNSOUND:         'PARENT_UNSOUND',
  FOREST_CYCLE:           'FOREST_CYCLE',
};

export function checkContainmentInvariants(state, faces, components) {
  const violations = [];
  const reps = components.map(c => c[0]);
  const repSet = new Set(reps);

  // I-1: key exactness for BOTH maps.
  const outerKeys = Object.keys(state.outerFaceAnchor).map(Number);
  const parentKeys = Object.keys(state.parentAnchor).map(Number);

  for (const rep of reps) {
    if (!(rep in state.outerFaceAnchor) || !(rep in state.parentAnchor)) {
      violations.push({ rule: ContainmentError.KEY_SET_MISMATCH, rep, reason: 'missing' });
    }
  }
  for (const key of [...outerKeys, ...parentKeys]) {
    if (!repSet.has(key)) {
      violations.push({ rule: ContainmentError.KEY_SET_MISMATCH, rep: key, reason: 'orphaned' });
    }
  }

  // I-2: outer-face soundness — resolves to a face OF that component.
  for (const rep of reps) {
    if (!(rep in state.outerFaceAnchor)) continue; // already reported above
    const face = resolveOuterFaceAnchor(faces, state.outerFaceAnchor[rep]);
    if (!face || face.component !== rep) {
      violations.push({ rule: ContainmentError.OUTER_FACE_UNSOUND, rep });
    }
  }

  // I-3: parent soundness — ⊥ or a dart of a DIFFERENT component.
  for (const rep of reps) {
    if (!(rep in state.parentAnchor)) continue;
    const anchor = state.parentAnchor[rep];
    if (anchor === null) continue; // ⊥, always sound
    const face = resolveDartFace(faces, anchor);
    if (!face || face.component === rep) {
      violations.push({ rule: ContainmentError.PARENT_UNSOUND, rep });
    }
  }

  // I-4: forest acyclicity — follow parent chains to ⊥, bounded by
  // component count (a real cycle would otherwise loop forever).
  for (const rep of reps) {
    let current = rep;
    let steps = 0;
    const seen = new Set();
    while (current !== null && steps <= reps.length) {
      if (seen.has(current)) {
        violations.push({ rule: ContainmentError.FOREST_CYCLE, rep });
        break;
      }
      seen.add(current);
      const anchor = state.parentAnchor[current];
      if (anchor === undefined) break; // already reported by I-1
      if (anchor === null) { current = null; break; }
      const face = resolveDartFace(faces, anchor);
      current = face ? face.component : null;
      steps++;
    }
  }

  return { ok: violations.length === 0, violations };
}
