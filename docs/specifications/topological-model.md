# A Mathematical Model Specification for the Sprouts Engine

**Status:** Accepted (tech lead, July 2026) — normative.
**Migration:** see `docs/migration-plan.md` for the path from the
v0.9.1 engine to this model.
**Applies from:** v0.9.2 onward.
**Supersedes:** the topological portions of `design.md`'s "Topological
Model" section. `design.md` remains authoritative for architecture
outside the mathematical model (layering, module responsibilities,
workflow).

The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as
in RFC 2119.

This document defines the mathematical object the Sprouts Lab engine
represents, the state that encodes it, the Move that transforms it,
and the invariants that govern it. It does not specify JavaScript
modules, classes, or algorithms except where needed to define
observable behaviour. The exploratory reasoning behind these
definitions lives in the v0.9.2 pre-implementation memos (session
archive); only conclusions appear here. Uncertainty is confined to
§11 (Epistemic Status) and §12 (Open Questions).

---

## 1. The two levels of truth

### 1.1 The Game Record is authoritative

The authoritative description of a game is its Game Record:
`initialDotCount`, `startingPlayer`, and the ordered list of Moves
(§7). Every other piece of engine data is a deterministic function of
the Record. (Established at v0.8.5; unchanged.)

### 1.2 Engine state is a cache

The engine's per-position state (§4) is the minimal sufficient cache
of a partial replay: exactly the information needed to apply the next
Move and answer legality queries incrementally. It has no independent
authority. Where engine state and a replay of the Record disagree,
the replay is correct by definition.

Consequence: the engine MAY be rebuilt from the Record at any time.
Incremental application and rebuild-by-replay MUST produce equivalent
states (§10.4 defines equivalence).

## 2. Mathematical preliminaries

### 2.1 The underlying object

A Sprouts position is a plane multigraph considered up to
orientation-preserving homeomorphism of the plane: vertices,
unoriented edges (loops and parallel edges permitted), and an
embedding. Geometry — coordinates, curve shapes — is not part of the
position; it belongs to the browser layer (BoardView) and is discarded
by Game Records.

### 2.2 Darts

Each edge has two darts (directed edge-sides). The involution α maps
each dart to its partner on the same edge. Each dart has an origin
vertex.

### 2.3 Rotation system

σ assigns to each vertex the cyclic, counterclockwise order of the
darts originating at it. A degree-0 vertex has an empty rotation.

### 2.4 Faces

φ = σ ∘ α. For each connected component, the orbits of φ on that
component's darts are the component's face boundary walks. The
specific orientation (φ = next-in-rotation after α(d), rather than
previous) is fixed arbitrarily by the tracer implementation (PR 3);
choosing the other direction yields the mirror-image embedding,
equally valid combinatorially. Which traced face is clockwise vs.
counterclockwise in the sense of §11.2 is NOT determined by this
choice alone — it depends on which face is externally designated the
outer face, which is containment information (§3), not something a
face tracer can resolve in isolation. See P-O3 (§11.3, revised).

### 2.5 Heffter–Edmonds

For a connected multigraph, (G, σ) determines an embedding on an
orientable surface up to homeomorphism; the embedding is planar iff
Euler's formula holds with the traced face count. Consequences: per
connected component, faces are fully derived from σ; and σ carries no
information about the relative placement of distinct components.

## 3. Containment

### 3.1 Necessity (proven)

Containment is not derivable from (G, σ). Proof: Appendix A.1.

### 3.2 The containment forest

For components A ≠ B, define A < B iff A lies in a bounded face of B.
Then < is a strict partial order whose principal up-sets are chains;
its covering ("immediate encloser") relation is a forest: each
component has at most one parent, and roots are the components lying
in the plane's outer face. The forest is choice-free and
homeomorphism-invariant — a property of the position, not of any
encoding. Proof: Appendix A.2.

### 3.3 The decoration

The forest alone is coarser than full containment. The complete
containment datum is:

  (i)  for each component, which of its own faces is its **outer
       face** — the face "torn open" toward its parent when the
       component is embedded among the others;
  (ii) for each non-root component, **which face of its parent
       component** it sits in.

Both are choice-free facts of the position. The triple (per-component
σ-faces, forest, decoration) determines the position up to
homeomorphism.

### 3.4 Isolated vertices

A degree-0 vertex is a component with exactly one face; datum (i) is
forced and only (ii) carries content. Isolated vertices are pure
containment objects — invisible to σ by nature, not by defect. Only
components possessing at least two faces (i.e. containing a cycle or
loop) can be parents; an isolated vertex encloses nothing.

## 4. Authoritative engine state (normative)

The engine's per-position state consists of exactly:

**S1 — Dart ground set with deterministic identity.** Edge k (0-based,
creation order) owns darts 2k and 2k+1. α is arithmetic (2k ↔ 2k+1)
and MUST NOT be stored. A dart → origin-vertex map is maintained;
vertices and edges are implicit in it. Sprouts is monotone (no
deletion exists), so dart and vertex identities are permanent within
a game.

**S2 — σ**, the rotation system: per vertex, the cyclic sequence of
its darts, counterclockwise.

**S3 — Containment encoding**: two finite maps keyed by component
representatives (§10.2):

  - `outerFaceAnchor : component → dart | vertex-token`
    Resolves (§6.2) to the component's outer face (datum (i)). The
    vertex-token form is used exactly for isolated vertices.
  - `parentAnchor : component → dart | ⊥`
    Resolves to the parent face (datum (ii)); ⊥ means the plane's
    outer face. Never a vertex token (§3.4: isolated vertices cannot
    be parents).

Nothing else is authoritative. The following MUST NOT be stored as
authoritative state: faces, boundary walks, regions, components as
objects, lands, degree, lives, split/merge classification, region
ids, boundary ids. Any of them MAY appear in the derived view (§4.1).

### 4.1 The derived view

All derived structures (§5) MAY be computed eagerly at state creation
and attached to the state as an immutable view. Because states are
immutable (pure reducer), such a view cannot go stale. Downstream
consumers — legality, canonicalisation, UI — MUST read derived
structure from the view or recompute it, and MUST NOT maintain their
own cross-state caches of derived structure.

## 5. Derived structures (definitions)

**D1 — Components.** Connected components of the multigraph;
computable by union-find over edges.

**D2 — Faces (per component).** Orbits of φ = σ∘α on the component's
darts, traced deterministically (§10.3). A single-vertex component
has one face with an empty walk.

**D3 — Boundary walks.** The dart sequences of the φ-orbits. A vertex
occurrence is one appearance of a dart origin within a walk; a
degree-d vertex has exactly d occurrences across all walks (one
trivial occurrence when d = 0). For a connected component, every face
has exactly one boundary walk.

**D4 — Regions.** The faces of the whole position. Each face f of a
component P, together with every component whose `parentAnchor`
resolves into f, presents as one region whose boundary set is: f's
own walk, plus the outer walks (or trivial single-vertex boundaries)
of its immediate occupants. The plane's outer region is bounded by
the outer walks of all root components. Distinct boundaries of a
region always belong to distinct components. Region count satisfies
F = Σ_c F_c − C + 1, where F_c is component c's face count and C the
number of components.

**D5 — Degree and lives.** deg(v) = |σ(v)|; lives(v) = 3 − deg(v).

**D6 — Corners.** See §7.1.

**D7 — Move classification.** A Move is *single-boundary* (split) if
its two corners lie on the same boundary walk, *double-boundary*
(merge) otherwise. By D4, double-boundary within one region implies
the endpoints lie in different components. Classification is derived;
it is never stored in the Move.

**D8 — Lands.** The maximal subtrees of the containment forest;
equivalently the literature's lands. Consumed by canonicalisation and
search, not by the reducer. (This closes the open question recorded
at v0.9.1: lands are derived, not engine state.)

## 6. Anchors and resolution

### 6.1 Stable vocabulary

Dart ids and vertex ids are the only identifiers stable across moves
(permanent by monotonicity, S1). Faces split and components merge —
both are mutable in identity — so neither faces nor components MUST
ever be the target of a stored reference. All stored references are
darts, vertices, or ⊥.

### 6.2 Resolution

A dart anchor resolves to the face on its left — the φ-orbit
containing it — within its own component. A vertex token resolves to
that isolated vertex's single face. ⊥ resolves to the plane's outer
region. Constraint: `parentAnchor(C)`, when a dart, MUST belong to a
component other than C; `outerFaceAnchor(C)` MUST resolve to a face
of C itself.

### 6.3 Anchors are per-state caches

Anchors encode the decoration (§3.3) for one state only. They MUST
be treated as valid only within the state that created them. The
reducer MUST re-derive every anchor a Move could affect,
unconditionally (reconcile-always, §8.3); it MUST NOT test whether an
old anchor "still happens to be right" and patch only on failure.

## 7. The Move

### 7.1 Corner

A corner of vertex v is a gap between consecutive darts in σ(v) — a
degree-d vertex has d corners for d ≥ 1, and exactly one corner (its
whole surrounding angle) when d = 0. Each corner lies in exactly one
region. Corners, boundary-walk occurrences, and σ-insertion positions
are canonically bijective; they are three coordinates for one choice.

### 7.2 Definition

A **Move** is:

  - an unordered pair of corners {c₁, c₂} (c₁ = c₂ permitted — a
    loop leaving and re-entering one angular sector), together with
  - a placement function π : K → {1, 2}, where K is the set of
    maximal occupant subtrees of the region r common to c₁ and c₂ —
    that is, subtree(C) for each component C whose parent face
    resolves into r's host face, excluding any component containing
    a Move endpoint.

π assigns each occupant subtree to one of the two regions a split
produces. Subtrees move rigidly: π applies to a subtree's root and
all descendants follow. π MUST be empty when the Move is
double-boundary (D7) or when K = ∅. With K = ∅ — the overwhelmingly
common case — the Move degenerates to its corner pair, giving split
and merge Moves a uniform shape.

### 7.3 Legality

A Move is legal iff:

  - both corners border the same region;
  - if the corners' vertices are equal (a loop): lives(v) ≥ 2;
    otherwise lives ≥ 1 at each endpoint vertex;
  - dom(π) = K exactly when single-boundary; π empty when
    double-boundary.

Validation MUST NOT constrain π beyond domain exactness: by
Proposition 7.4 there is no such thing as an illegal placement.

### 7.4 Proposition (placement freeness)

For every legal corner pair and every π : K → {1, 2}, some drawing of
the curve realizes π — occupant subtrees are freely rearrangeable
within a region. Status: argued informally; discharged by exhaustive
small-case enumeration at PR 10 (P-O4) and cross-checked against
Čížek & Balko's single-boundary-move partition.

### 7.5 Serialization

In Game Records (a future formatVersion 2), corners MUST be named as
(vertex id, rotation index) under the deterministic conventions of
§10.3, and subtree roots MUST be named by any member vertex, with
re-resolution semantics: "the component containing vertex v at replay
time." Component representatives (§10.2) MUST NOT appear in
serialized form as identifiers carrying cross-state meaning.

## 8. Move application (reducer semantics)

### 8.1 Uniform σ-update

Every legal Move applies identically at the σ level. Mint one vertex
w (the sprout) and two edges — the curve's halves — contributing four
darts with arithmetic ids (S1). Insert one outward dart into σ(v₁) at
corner c₁ and one into σ(v₂) at corner c₂. σ(w) is the two-dart
rotation of the inward darts; a 2-element cyclic order is unique, so
σ(w) requires no convention. Split, merge, and loops are the same
σ-operation; their differences exist only in derived structure.

One convention remains: when both insertions land in the same corner
(c₁ = c₂), the relative order of the two new darts within that gap
MUST follow the fixed orientation convention of §11.2.

### 8.2 Containment update

**Merge (endpoints in different components A, B):** union A and B.
Re-derive the merged component's entries: its outer face anchor, and
a single parent anchor (both prior parents resolve to the same region
by legality; reconcile to one valid dart). Update the map keys of all
children of A and B to the merged representative; their semantics are
unchanged.

**Split (single-boundary):** the host face divides in two. Re-anchor
every subtree in K to a dart on the side π assigns it, and re-derive
the entries of the component containing the endpoints. New regions
come into existence only as derived structure — the reducer never
creates a region object.

Loops, including loops on isolated vertices, are degenerate instances
of the above; no additional cases exist.

### 8.3 Reconcile-always (normative)

The reducer MUST unconditionally re-derive all containment entries a
Move could affect — both components' entries on merge; all K-subtree
parent anchors plus the endpoint component's entries on split. The
alternative (test old anchors, patch only on failure) creates a
dormant rarely-executed branch and is prohibited.

### 8.4 Postconditions

After application: total lives has decreased by exactly 1; deg(w) = 2
and lives(w) = 1; endpoint lives are decremented per the loop/normal
rules of `design.md`. All are derivable facts, asserted as checked
invariants (§9.2).

## 9. Invariants

### 9.1 True by construction (violations unrepresentable)

- α is a fixed-point-free involution: arithmetic pairing, never
  stored, cannot be corrupted.
- Dart and vertex identity permanence: no deletion operation exists.
- Every value of σ is a valid rotation system — any assignment of
  cyclic orders is a legitimate embedding of the component on *some*
  orientable surface. A buggy σ-insertion produces a wrong position
  or a non-planar embedding, never a meaningless state; non-planarity
  is caught by exactly one check (I-5).

### 9.2 Checked (the normative content of `checkInvariants`)

- **I-1 Key exactness.** The key sets of both containment maps equal
  the set of canonical representatives of the current components —
  one entry per component, no orphans, no ghosts.
- **I-2 Outer-face soundness.** `outerFaceAnchor(C)` resolves to a
  face of C (dart belongs to C; vertex token only for isolated C).
- **I-3 Parent soundness.** `parentAnchor(C)` is ⊥ or a dart of a
  component other than C.
- **I-4 Forest.** Parent chains terminate at ⊥ (acyclicity — the map
  encoding cannot express a cycle *in intent*, but pathological
  writes could; cheap to check, so checked).
- **I-5 Global Euler / planarity certificate.**
  V − E + F = 1 + C, with F the derived region count (D4). Equivalent
  to per-component sphere Euler plus I-1. This is the single semantic
  check binding σ-validity and containment together.
- **I-6 Lives consistency.** Any lives value exposed by the derived
  view equals 3 − deg(v) and is ≥ 0 for all v.
- **I-7 Total lives.** Decreases by exactly 1 per applied Move (the
  existing v0.6 invariant, re-asserted here).
- **I-8 π-domain exactness** (Move-level, in `validateMove`): §7.3.
  Implemented at PR 10 (`PLACEMENT_DOMAIN_MISMATCH`): a split's π must
  have domain exactly K, values in {1,2}. No longer deferred.

Note: earlier drafts included a "sibling mutual exteriority" check.
It is dropped as vacuous — the anchors *define* the nesting, so there
is no independent truth for such a check to compare against.

### 9.3 Test discipline

`checkInvariants` MUST pass after every reducer step in tests. The
Čížek–Balko splice formulas serve as the property-test oracle
(P-O1) for the tracer-expressible subset of move types — see the
revised P-O1 (§11.3): general split/merge oracle comparisons carrying
a nontrivial placement function require containment (§3), which does
not yet exist, and are PR 5's obligation.

## 10. Identity, naming, determinism

### 10.1 Stable identifiers

Vertex ids: initial dots 0 … n−1, then sprouts in move order. Dart
ids: 2k and 2k+1 for edge k in creation order. These are the only
identifiers permitted in cross-state or serialized references.

### 10.2 Component representatives (encoding only)

The canonical representative of a component is its smallest vertex
id. Representatives are lookup keys with zero mathematical content.
They MUST NOT appear in: equivalence definitions (§10.4), canonical
forms, serialized Records as cross-state identifiers, or any logic
that assumes stability across a Move — a merge changes the
representative of every vertex in the absorbed class.

### 10.3 Deterministic derivation order

Face traces start at each orbit's smallest dart and follow φ. Faces
of a component are ordered by smallest dart; components by
representative. Corner indices count gaps from σ(v)'s deterministic
starting dart (index 0 for degree 0). All derived enumerations MUST
follow these conventions so replay reproduces identical derived
views.

### 10.4 State equivalence (normative for testing)

Two states are equivalent iff their dart ground sets, σ, and
*resolved* containment structure coincide — the vertex partition into
components, each component's outer face compared as a dart set, and
the parent forest up to that identification. Representative choices
and anchor choices are quotiented out. Implementations MUST compare
resolved structure, never representative or anchor identity;
comparing representatives lets representative bugs cancel.

## 11. Epistemic status

### 11.1 Proven in this project (Appendix A)

- Containment is not derivable from (G, σ) — A.1.
- The containment forest is a choice-free invariant of the
  position — A.2.
- No anchor representation can survive every legal Move
  automatically; per-split re-anchoring is intrinsic to Sprouts, not
  to this design — A.3.

### 11.2 Literature-supported

Verified against the primary source during the v0.9.2 pre-
implementation review (arXiv:2108.07671 including its appendix):

- The split/merge splice formulas and e/e^R bookkeeping (used here as
  test oracle, P-O1).
- Orientation conventions: inner boundaries clockwise, border
  boundary counterclockwise; loops handled as the degenerate
  single-boundary case under a fixed counterclockwise convention.
- The lands → regions → boundaries hierarchy of sr(P), matching
  D4/D8.
- Heffter–Edmonds (standard; see references).

### 11.3 Proof obligations (owed before or during v0.9.2)

- **P-O1.** *Revised, PR 3.* Property-test oracle: σ-insert-then-
  trace reproduces the published splice results, for the subset of
  move types expressible from (edges, σ) alone — trees, single
  cycles, bigons (a bridge/merge case and a degenerate self-loop
  split case, both hand-traced and verified in
  `tests/engine/faces.test.js`). General split/merge cases carrying a
  nontrivial placement function π require containment (§3), which
  does not exist until PR 5; the full oracle comparison for those
  cases is PR 5's obligation, checked against real containment state
  rather than PR 3's tracer alone.
- **P-O2.** Exhaustive small-n bisimulation: all legal move sequences
  from 1–3 initial dots to fixed depth; incremental apply vs.
  rebuild-by-replay must be equivalent (§10.4) after every move.
- **P-O3.** *Revised, PR 3.* Originally: fix and record the exact
  mapping between §2.4's φ-convention and the paper's e/e^R walk
  convention. Discovered during PR 3's design review: this mapping
  is not decidable from the tracer alone. Hand-tracing showed every
  structure with max degree ≤ 2 (paths, cycles — i.e. everything a
  bare rotation system without containment can distinguish) gives
  identical results under either φ-direction choice, and more
  fundamentally, clockwise-vs-counterclockwise is meaningful only
  relative to an externally designated outer face (§3), which the
  tracer does not have. Resolution: φ's direction is fixed
  arbitrarily (§2.4) and documented; matching the paper's specific
  cw/ccw labelling is deferred to PR 5, applied as an orientation
  flip at the containment layer once the outer face is known, not
  built into the tracer.
- **P-O4.** Placement freeness (Prop. 7.4): verify against the
  literature or by exhaustive small-case enumeration. **Discharged at
  PR 10:** the P-O2 exhaustive walker now generates every placement ×
  exterior-side choice for enclosure moves up to depth 2 and confirms
  every one yields a containment-sound state — the "some drawing
  realizes π" claim, checked by construction across all small cases.
  Cross-checked against Čížek & Balko's single-boundary-move analysis
  (their major/minor partition = our π).
- **P-O5.** Corner-index serialization round-trips under replay.
  Blocks Game Record formatVersion 2, not v0.9.2 itself. **Discharged
  at PR 8** (corners) and **extended at PR 10** (placement +
  exteriorSide now round-trip too).

## 12. Open questions

- **O-Q1 — formatVersion 1 replay semantics. RESOLVED (Jared, product
  ruling, July 2026).** Existing v1 Game Records store Moves as
  `{startDotId, endDotId, regionId}` with no corner data, making
  replay ambiguous whenever an endpoint has degree ≥ 2 under this
  model. Ruling: **v1 records are dropped entirely — no migration,
  no backward-compatible replay path is built.** `gameRecord.js`'s
  formatVersion gate is retired to formatVersion 2 only; anything
  else (including v1) is rejected the same way an invalid version is
  already rejected today. This removes the ambiguity rather than
  resolving it — there is no v1 data left to be ambiguous about.
  Consequence for PR 8: no "default corner" fallback path needs to
  be designed or built for import; the reducer's legacy (cornerless,
  append-only) code path likewise has no remaining caller once v1
  import is gone, and its removal is a related question for PR 8's
  design step (see `docs/migration-plan.md`'s PR 8 entry).

No other open questions block v0.9.2. Previously open and now closed:
lands (derived, D8); canonicalisation independence (this
specification is unchanged if canonicalisation is deleted from the
roadmap — checked explicitly during review).

## 13. Relationship to existing code (informative)

The v0.9.1 engine predates this specification. The deltas it implies:
boundary walks stored as dot-id lists become derived from σ (D2/D3);
stored `regions`/`boundaries` arrays become the derived view (§4.1);
`lives` on dots becomes derived (D5) with I-6 as the cross-check;
`Move {startDotId, endDotId, regionId}` becomes §7.2 (one derived
field too many, two fundamental components missing); `checkInvariants`
is replaced by §9.2. Migration sequencing is a ROADMAP concern, not
part of this specification.

## Appendix A — Proofs

### A.1 Containment is not derivable from (G, σ)

Take components A and B where A has at least two faces (one cycle or
one loop suffices). Embed B in face f₁ of A; separately, embed B in
face f₂ ≠ f₁ of A. Both embeddings have identical multigraph G,
identical σ, identical per-component face sets. They are
non-homeomorphic plane graphs — the legal-move sets differ, since a
vertex of B can share a region with the walk of f₁ in one embedding
and not in the other. Two distinct positions, one (G, σ); a third
coordinate is required. ∎

### A.2 The nesting relation is a forest

Define A < B iff A lies in a bounded face of B. Antisymmetry: by the
Jordan curve theorem, B cannot lie in a bounded face of A while A
lies in a bounded face of B. Transitivity: inside-of-inside is
inside. So < is a strict partial order. Chain condition: if A < B and
A < C, the closed curves of B and C each enclose A, so they are
nested — B < C or C < B; hence the set of components above any
component is a chain. A strict partial order whose principal up-sets
are chains is a forest under its covering relation: each element has
at most one immediate successor. Roots are the maximal elements —
components in the plane's outer face. Every step is homeomorphism-
invariant and choice-free. ∎

### A.3 No anchor survives every Move automatically

Suppose an anchor scheme resolved correctly across every legal Move
with no reducer intervention. Let component X float in face f, and
let a single-boundary Move split f into f₁, f₂. The player may
lawfully assign X to either side (Prop. 7.4): both futures are legal
and distinct. The pre-Move state — anchors included — is identical in
both, so any deterministic resolution returns the same face for X in
both futures. In one it is wrong. Automatic survival would require
the anchor to predict a free choice — a contradiction. Hence per-
split re-anchoring of the split face's occupants is intrinsic to the
game. (A second, shallow failure — an anchor dart landing on the
wrong side of a split it wasn't part of — is an artifact of naming
faces through single incidences, and is what §8.3's reconcile-always
rule exists to make routine.) ∎

## References

- T. Čížek, M. Balko, *Implementation of Sprouts: a graph drawing
  game*, GD 2021, LNCS 12868; full version arXiv:2108.07671
  (primary source; splice formulas in its appendix).
- L. Heffter (1891) / J. Edmonds (1960), rotation systems; standard
  treatment in B. Mohar, C. Thomassen, *Graphs on Surfaces*, JHU
  Press, 2001.
- Sprouts Lab `design.md` (architecture outside this model) and
  `ROADMAP.md` (versioned history: v0.6 rules verification, v0.8.5
  Game Record authority, v0.8.6 originatingMoveIndex, v0.9–v0.9.1
  topology scaffolding).
