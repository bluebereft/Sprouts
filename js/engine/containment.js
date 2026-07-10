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

   SCOPE (updated at PR 10 — enclosure / non-empty K now supported)
   ─────────────────────────────────────────────────────────────────
   SPLIT now handles NON-EMPTY K: a move that encloses other
   components redistributes those occupant subtrees to the two sides
   of the split per a placement π (spec §7.2). This includes the
   common real case of looping a line so it encloses other dots,
   which PR 5 had deliberately deferred. The key enabler is
   computeK's ⊥ (plane's outer region) handling below: sibling root
   components sharing the plane's outer region are now correctly seen
   as occupants when that shared region is split.

   MERGE is still restricted to two ROOT components (the ordinary
   "connect two separate structures" case). Merging a component that
   is itself nested, or that carries its own occupants needing
   re-parenting, is NOT yet exercised — it does not arise from the
   move set the browser currently produces. Left for the enumeration
   work (PR 11) to surface with real cases if it can; recorded as a
   residual limitation in docs/migration-plan.md rather than silently
   assumed away.

   Same-component/different-face moves (a "chord") remain rejected
   upstream in rules.js (DIFFERENT_REGIONS, since PR 7) and so never
   reach this module — they are illegal, not unhandled.

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
 * The plane's outer region (⊥) is a special case that MUST be
 * handled, or enclosure moves silently lose their occupants (the
 * bug PR 10 fixes): root components have parentAnchor === null,
 * which resolves to null, never to any face object — so a naive
 * "resolvedFace === hostFace" test can never see sibling roots
 * sharing the plane's outer region. Per spec D4, the plane's outer
 * region is bounded by the outer walks of ALL root components; so
 * when hostFace is itself a root's OWN outer face (i.e. hostFace is
 * the ⊥-adjacent face being split), every OTHER root is an occupant
 * of that shared region. Detecting this requires outerFaceAnchor
 * (to know whether hostFace is a root's outer face) — passed in for
 * exactly this. When omitted, the ⊥ branch is skipped and behaviour
 * is identical to the pre-PR-10 version (used by call sites that
 * only ever ask about genuinely-nested host faces).
 *
 * @param {Array<{component:number, darts:number[]}>} faces — a
 *   single traceFaces() result; hostFace MUST be a face object from
 *   this SAME array (compared by reference)
 * @param {object} parentAnchor — state.parentAnchor
 * @param {object} hostFace — the face object occupants are checked against
 * @param {number} excludeRep — the touched component's own representative
 * @param {?object} [outerFaceAnchor=null] — state.outerFaceAnchor;
 *   required to detect the ⊥ (plane's outer region) case above
 * @returns {number[]} occupant representatives (as numbers)
 */
export function computeK(faces, parentAnchor, hostFace, excludeRep, outerFaceAnchor = null) {
  const occupants = [];

  // Is hostFace a ROOT component's own outer face — i.e. is this the
  // plane's outer region (⊥) being hosted? hostFace.component tells
  // us which component owns the face; it's the ⊥-adjacent face iff
  // that component is a root (parentAnchor null) AND hostFace is the
  // face its outerFaceAnchor resolves to.
  let hostIsOuterRegion = false;
  if (outerFaceAnchor) {
    const hostOwner = hostFace.component;
    const ownerIsRoot = parentAnchor[hostOwner] === null || parentAnchor[hostOwner] === undefined;
    if (ownerIsRoot && outerFaceAnchor[hostOwner] !== undefined) {
      const ownerOuter = resolveOuterFaceAnchor(faces, outerFaceAnchor[hostOwner]);
      hostIsOuterRegion = ownerOuter === hostFace;
    }
  }

  for (const key of Object.keys(parentAnchor)) {
    const rep = Number(key);
    if (rep === excludeRep) continue;

    const anchor = parentAnchor[key];

    if (anchor === null) {
      // A root. It occupies the host region only when the host IS
      // the plane's outer region (all roots share ⊥, spec D4).
      if (hostIsOuterRegion) occupants.push(rep);
      continue;
    }

    const resolvedFace = resolveParentAnchor(faces, anchor);
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
 * The two new faces descending from a split, in a DETERMINISTIC
 * order: index 0 is the face whose smallest dart is smaller. This
 * ordering is the shared "side 1 / side 2" convention that both the
 * containment update and any placement π (spec §7.2) MUST agree on:
 * an occupant π-assigned to side 1 is re-anchored into descendants
 * [0], side 2 into descendants[1]. The browser's geometric π
 * derivation (js/regionGeometry.js) uses the SAME ordering so a
 * drawn move and its recorded π never disagree about which side is
 * which.
 *
 * @param {Array<{component:number, darts:number[]}>} newFaces
 * @param {number} rep
 * @param {number[]} newDarts
 * @returns {Array<{component:number, darts:number[]}>} exactly 2 faces
 */
export function splitDescendantFaces(newFaces, rep, newDarts) {
  const descendants = newFaces.filter(
    f => f.component === rep && newDarts.some(d => f.darts.includes(d))
  );
  return descendants.slice().sort(
    (a, b) => Math.min(...a.darts) - Math.min(...b.darts)
  );
}

/**
 * Containment update for a SPLIT (single-boundary move) — spec
 * §8.2. Now handles NON-EMPTY K (PR 10): occupant subtrees named in
 * K are re-anchored to whichever descendant face the placement π
 * assigns them. K = ∅ is the ordinary common case and still works
 * (the K loop simply runs zero times).
 *
 * The touched component's own representative never changes on a
 * split (no merge occurs). parentAnchor[rep] never changes either —
 * a split only restructures the component's OWN internal faces; its
 * relationship to its OWN parent (if any) is untouched. What CAN
 * change: (a) outerFaceAnchor[rep], if the split face was the one it
 * pointed to; (b) parentAnchor of each occupant in K, which now
 * points into one of the two descendant faces.
 *
 * Subtrees move rigidly (spec §7.2): only a subtree's ROOT is
 * re-anchored here; its descendants keep their own parentAnchors,
 * which point at faces inside the subtree root and are unaffected by
 * where the root sits. So nested multi-level occupants need no
 * special handling.
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
 * @param {number[]} [K=[]] — occupant reps to redistribute
 * @param {object} [placement={}] — π: occupantRep → 1 | 2
 * @param {?number} [exteriorSide=null] — when this splits the plane's
 *   outer region, which side (1 or 2) is the unbounded / ⊥-adjacent
 *   one (PR 10, Option 1). Occupants π-assigned to that side stay
 *   roots (parentAnchor ⊥ / null) instead of becoming nested, and
 *   the touched component's outerFaceAnchor is pointed at that side.
 *   null when the geometric exterior isn't known/relevant (K = ∅,
 *   interior splits, merges) — then the legacy arbitrary rule applies.
 * @returns {{ outerFaceAnchor: object, parentAnchor: object }}
 */
export function updateContainmentForSplit(
  outerFaceAnchor, parentAnchor, rep, oldFaces, splitFace, newFaces, newDarts,
  K = [], placement = {}, exteriorSide = null
) {
  const oldOuterFace = resolveOuterFaceAnchor(oldFaces, outerFaceAnchor[rep]);
  const outerFaceWasSplit = oldOuterFace === splitFace;

  const descendants = splitDescendantFaces(newFaces, rep, newDarts);
  // descendants[0] = side 1, descendants[1] = side 2 (see
  // splitDescendantFaces). A dart on each side, for anchoring.
  const sideDart = [descendants[0].darts[0], descendants[1].darts[0]];

  const newParentAnchor = { ...parentAnchor };

  // Re-anchor each occupant subtree root to the side π assigns it.
  // EXCEPTION (Option 1): an occupant assigned to the known exterior
  // (⊥-adjacent) side is topologically still a root in the plane, so
  // it keeps parentAnchor ⊥ (null) rather than being anchored into
  // the touched component's exterior face — otherwise two encodings
  // of the same position would differ (breaks canonicalisation).
  for (const occRep of K) {
    const side = placement[occRep]; // 1 or 2
    if (exteriorSide !== null && side === exteriorSide) {
      newParentAnchor[occRep] = null; // stays a root (⊥)
    } else {
      newParentAnchor[occRep] = sideDart[side - 1];
    }
  }

  // outerFaceAnchor[rep]: only changes if the split face was the one
  // it pointed to. When it was, point it at the descendant that is
  // the component's true outer face: the exterior side when known,
  // else the fixed "smaller smallest-dart" rule (descendants[0]) —
  // an arbitrary-but-deterministic choice retained for the cases
  // where the geometric exterior isn't supplied (P-O3: which side is
  // ⊥ isn't tracer-decidable from σ alone; when K = ∅ it also makes
  // no containment difference).
  const newOuterFaceAnchor = { ...outerFaceAnchor };
  if (outerFaceWasSplit) {
    const outerIdx = (exteriorSide !== null) ? (exteriorSide - 1) : 0;
    newOuterFaceAnchor[rep] = { kind: 'dart', value: descendants[outerIdx].darts[0] };
  }

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
