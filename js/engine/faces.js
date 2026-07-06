/* ================================================================
   faces.js — Sprouts Engine Face Tracer (v0.9.2 — PR 3)

   Responsibility
   ──────────────
   Pure derivation of faces (boundary walks) and connected components
   from (edges, rotations) — the accepted specification's φ = σ∘α
   (docs/specifications/topological-model.md §2.4). No mutation, no
   engine state changes; nothing calls this yet (Stage B of the
   migration plan — see docs/migration-plan.md).

   Depends on: js/engine/darts.js (alpha, originOf, dartCount).

   Convention (fixed here, arbitrarily but permanently for this
   implementation)
   ─────────────────────────────────────────────────────────────────
   φ(d) = the dart immediately AFTER alpha(d) in the cyclic rotation
   at alpha(d)'s origin vertex ("next in rotation"). This is the
   standard combinatorial-map face-tracing formula. Choosing
   "previous" instead produces the mirror-image embedding — equally
   valid combinatorially, not a matter of one choice being wrong.

   IMPORTANT FINDING (discovered during PR 3 implementation, not
   assumed in advance — see the PR 3 design review): hand-tracing
   confirmed that for any structure where every vertex has degree ≤ 2
   (paths, cycles, disjoint unions — i.e. every state PR 2's
   append-only σ can currently produce), "next" and "previous" give
   IDENTICAL face partitions, since a 2-element cyclic order has only
   one shape. More fundamentally: WHICH traced face is "clockwise" vs
   "counterclockwise" (spec §2.4/§11.2) only becomes meaningful
   relative to which face is externally designated the outer/border
   face — information this tracer does not have (that's containment/
   PR 5's job). This tracer therefore guarantees a mathematically
   correct, deterministic, self-consistent combinatorial embedding
   (verified via partition + Euler + hand-traced orbit contents in
   tests/engine/faces.test.js), fixes ONE arbitrary orientation, and
   leaves any needed clockwise/counterclockwise flip to be applied at
   the containment layer once the outer face is externally known —
   not baked in here.
   ================================================================ */

import { alpha, originOf, dartCount } from './darts.js';

/**
 * Groups dot ids into connected components via union-find over edges.
 * Deterministic: each component's members sorted ascending; the list
 * of components sorted by each one's smallest (representative)
 * member ascending, per the spec's component-representative
 * convention (§10.2).
 *
 * @param {Array<{a:number,b:number}>} edges
 * @param {number[]} dotIds — every dot id currently in the state
 * @returns {number[][]} components, each an ascending array of dot ids
 */
export function getComponents(edges, dotIds) {
  const parent = new Map();
  dotIds.forEach(id => parent.set(id, id));

  function find(x) {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  }
  function union(x, y) {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) parent.set(rootX, rootY);
  }

  edges.forEach(edge => union(edge.a, edge.b));

  const groups = new Map();
  dotIds.forEach(id => {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  });

  const components = Array.from(groups.values()).map(members =>
    members.slice().sort((a, b) => a - b)
  );
  components.sort((a, b) => a[0] - b[0]);
  return components;
}

/**
 * φ(d) = next dart after alpha(d) in the rotation at alpha(d)'s
 * origin vertex. See file header for the convention note.
 */
function phi(edges, rotations, dart) {
  const partner = alpha(dart);
  const v = originOf(edges, partner);
  const rotation = rotations[v];
  const idx = rotation.indexOf(partner);
  return rotation[(idx + 1) % rotation.length];
}

/**
 * Traces faces (φ-orbits) over the full dart set, deterministically.
 *
 * Each dart-based face's dart sequence starts at its orbit's
 * smallest dart (a guaranteed consequence of processing darts
 * 0..dartCount-1 in order and marking each orbit's darts visited as
 * soon as found — the first unvisited dart encountered for any orbit
 * is necessarily its smallest, per spec §10.3). These faces are
 * returned in that same order (by increasing smallest dart).
 *
 * Degree-0 vertices contribute no darts, so they are invisible to
 * the dart-orbit walk above — but per spec §2.4, an isolated vertex
 * still has exactly one (trivial, empty-walk) face. These are
 * appended after all dart-based faces, ordered by vertex id.
 *
 * @param {Array<{a:number,b:number}>} edges
 * @param {number[][]} rotations — state.rotations
 * @returns {Array<{component:number, darts:number[]}>}
 *   component is the representative (smallest) dot id of the
 *   connected component this face's darts belong to.
 */
export function traceFaces(edges, rotations) {
  const total = dartCount(edges);
  const visited = new Array(total).fill(false);

  const dotIds = rotations.map((_, v) => v);
  const components = getComponents(edges, dotIds);
  const componentOf = new Map();
  components.forEach(members => {
    const rep = members[0];
    members.forEach(v => componentOf.set(v, rep));
  });

  const faces = [];

  for (let d = 0; d < total; d++) {
    if (visited[d]) continue;

    const darts = [];
    let cur = d;
    do {
      darts.push(cur);
      visited[cur] = true;
      cur = phi(edges, rotations, cur);
    } while (cur !== d);

    faces.push({ component: componentOf.get(originOf(edges, d)), darts });
  }

  for (let v = 0; v < rotations.length; v++) {
    if (rotations[v].length === 0) {
      faces.push({ component: componentOf.get(v), darts: [] });
    }
  }

  return faces;
}

/**
 * Resolves which face (from a traceFaces() result) a given corner
 * belongs to — v0.9.2 PR 5, needed by containment.js and rules.js.
 *
 * A corner is "vertex v, position cornerIndex in rotations[v]"
 * (spec §7.1; the indexing convention is pinned in move.js). The
 * corner "after dart X" belongs to the SAME face as whichever face
 * contains alpha(X): tracing computes φ(alpha(X)) = next-after(X) as
 * the face's continuation through this exact corner, so the face
 * containing alpha(X) is, by construction, the one this corner is
 * part of.
 *
 * For a degree-0 vertex (empty rotation), there is exactly one
 * trivial corner (index 0, ignored) and it belongs to that vertex's
 * own trivial face (spec §2.4).
 *
 * IMPORTANT: `faces` MUST be the result of a single traceFaces()
 * call — this function compares by array/object identity within
 * that result, not by recomputing anything.
 *
 * @param {Array<{a:number,b:number}>} edges
 * @param {number[][]} rotations
 * @param {Array<{component:number, darts:number[]}>} faces
 * @param {number} vertexId
 * @param {number} cornerIndex
 * @returns {?{component:number, darts:number[]}} the face, or null
 *   if not found (shouldn't happen for well-formed input)
 */
export function cornerFace(edges, rotations, faces, vertexId, cornerIndex) {
  const rotation = rotations[vertexId];

  if (rotation.length === 0) {
    return faces.find(f => f.darts.length === 0 && f.component === vertexId) ?? null;
  }

  const dart = rotation[cornerIndex];
  const partner = alpha(dart);
  return faces.find(f => f.darts.includes(partner)) ?? null;
}
