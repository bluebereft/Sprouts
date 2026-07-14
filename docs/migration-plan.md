# Sprouts Lab — Topology Migration Plan

**Status:** For review (Jared + tech lead).
**Inputs:** `docs/specifications/topological-model.md` (accepted — "the
spec"); repository at v0.9.1 (88 tests passing).
**Scope:** the safest evolutionary path from today's engine to the
spec's model. No code in this document; PR-level sequencing only.

The governing stance: the current codebase is a successful,
incrementally-evolved architecture. The spec changes the engine's
*mathematical content*, not its *architectural philosophy*. Every
structural pattern that made v0.1–v0.9.1 work — pure reducer, Game
Record authority, engine/browser separation, coded errors,
tests-alongside — survives intact. What changes is what the reducer
computes and what the state stores.

---

## Phase 1 — The existing engine, module by module

### engine/reducer.js (124 lines)
**Responsibility:** pure state transition; appends 2 edges + 1 sprout,
decrements lives, toggles player. **Assumptions:** moves are pre-
validated; every move creates exactly 1 dot + 2 edges; unknown state
fields ride along via `...state` spread. **Represents:** a plain
multigraph plus lives arithmetic. **Under the new model:** the
assumptions all survive — the spec's §8.1 uniform update is *also*
"one sprout, two edges, no cases." The reducer gains σ-insertion and
containment reconciliation but keeps its flat, unconditional shape.
The v0.8.6 warning that its "easy-to-audit character" might not
survive turns out too pessimistic: the σ-primary model is *less*
case-ridden than the walk-splicing model that warning anticipated.

### engine/rules.js
**Responsibility:** legality (existence + lives), exhaustion,
player alternation. **Assumptions:** lives are stored on dots; loop
vs. normal are mutually exclusive branches. **Under the new model:**
fully valid. Lives semantics are unchanged (spec D5 derives the same
numbers); the violations-array shape was designed for exactly the
growth v0.9.3 brings (region check). Only addition, never rewrite.

### engine/engine.js
**Responsibility:** stateful singleton; validate/apply split; state
untouched on rejection. **Under the new model:** valid verbatim. The
spec's reducer semantics slot behind the identical API.

### engine/move.js
**Responsibility:** `createMove(startDotId, endDotId, regionId=0)`.
**Assumptions:** endpoints + region suffice to identify a move.
**Under the new model:** the core finding of the review — false once
degree ≥ 1. Corners + placement are fundamental; regionId is derived
(spec §7). Evolves additively, then sheds regionId.

### engine/regions.js
**Responsibility:** stored regions/boundaries arrays, five containment
queries, `checkInvariants`. **Assumptions:** boundaries are dot-id
lists; each dot in exactly one boundary. **Live finding F1, from the
code, not the docs:** the stored topology is *already stale after the
first move of every game*. No mutation logic exists, so a sprout never
joins any boundary — `getBoundaryForDot(sprout)` returns null today,
`getRegionForDot(sprout)` returns null, and `ui.js` therefore builds
moves from sprout endpoints with `regionId: null` (exported as null,
re-imported as `?? 0`). Harmless only because nothing consumes
regionId yet. Consequence for migration: the stored arrays are
vestigial after move 1 *today* — deleting them loses nothing that was
ever true mid-game. The five query *contracts* (signatures, call
sites) are good and survive; their bodies re-target the derived view.
`checkInvariants`' shape survives; its checks are replaced per spec
§9.2 (its rule #1 is the invariant the review proved wrong).

### engine/gameRecord.js
**Responsibility:** export/import via the real rules; no Engine
dependency; formatVersion gate. **Under the new model:** the
principle is canonized by spec §1 (Record = authoritative truth).
Survives whole. Needs: formatVersion 2 (corners + placement, spec
§7.5) and an O-Q1 ruling for v1 records. Its strict
`formatVersion !== 1` rejection means v2 introduction is an explicit,
visible change, not an accident — good.

### js/ui.js
**Responsibility:** orchestration; `commitMove(path, a, b)` receives
the *drawn path* before building the Move. **Live finding F2 (part
one):** the geometry needed to resolve corners is already delivered
to exactly the right place — `commitMove` holds the path, BoardView
holds every prior path. Corner/placement resolution is a new pure-
geometry step inside the existing callback, not a new pipeline.

### js/boardView.js, renderer.js, drawInteraction.js, pathSimplify.js, crossingDetection.js, selectionState.js, models.js
**Responsibility:** geometry, rendering, gesture. **Under the new
model:** unchanged. The engine/browser boundary was drawn (v0.5) so
that geometric knowledge stays browser-side — corner resolution is
precisely the geometric→combinatorial translation that boundary
anticipated. `crossingDetection.js`'s point/segment primitives get a
second consumer (placement resolution). No engine concept leaks in.

### The edges array — finding F2 (part two)
`edges` is an append-only creation-ordered array of `{a, b,
originatingMoveIndex}`. This *is* the spec's S1 dart ground set:
edge k owns darts 2k (origin `a`) and 2k+1 (origin `b`); α is
arithmetic; monotonicity already holds (nothing ever deletes).
**S1 requires zero new stored state** — only a thin pure module
exposing the dart view of what already exists.

---

## Phase 2 — Architecture diff

| Abstraction | Verdict | Why |
|---|---|---|
| Game Record (principle + v1 shape) | **Keep unchanged** (v2 later) | Spec §1 makes it the authoritative truth. v1 shape stays valid for v1 games; v2 adds corners/placement. |
| Reducer purity contract | **Keep unchanged** | Spec §4.1's eager derived view is *conditional on* immutability (spec Q7 of review). Load-bearing. |
| Engine wrapper API (init/validate/apply/getState) | **Keep unchanged** | Nothing in the spec touches the calling convention. |
| validate/apply split, coded errors, violations arrays | **Keep unchanged** | Designed for this growth; v0.9.3 adds a code, no shape change. |
| BoardView / renderer / gesture / geometry modules | **Keep unchanged** | Browser-side; the spec explicitly excludes geometry from the position. |
| `originatingMoveIndex` on edges | **Keep unchanged** | Event provenance, not topological identity (spec §3 quarantines it correctly already). |
| Reducer body | **Keep but evolve** | Gains σ-insertion (uniform, no cases) + containment reconcile-always. Keeps 1-sprout-2-edges shape. |
| `buildInitialTopology` | **Keep but evolve** | Same single seeding point (ui.js + gameRecord.js both call it); emits σ + anchors instead of arrays. |
| regions.js query five | **Keep but evolve** | Contracts + call sites survive; bodies re-target the derived view. Fixes F1 (sprouts get real answers). |
| `checkInvariants` | **Keep but evolve** | Same `{ok, violations}` shape; checks replaced by spec I-1…I-7. |
| Move | **Keep but evolve** | Gains corners + placement (additive); regionId retired at formatVersion 2. |
| `validateMove` | **Keep but evolve** | Gains region membership + π-domain checks (spec §7.3, I-8). |
| `dots[].lives` | **Keep but evolve** | Authoritative → cached-derived (spec D5); I-6 cross-checks stored vs. 3−deg. Removal optional, later. |
| ui.commitMove | **Keep but evolve** | Adds one resolution step (path → corners, π) before createMove. |
| Stored `regions`/`boundaries` arrays | **Replace** | Cannot represent degree ≥ 1 (occurrences); already stale after move 1 (F1). Replaced by derived view over σ + containment. |
| `TopologyError` check set | **Replace** | DOT_BOUNDARY_COUNT_WRONG enforces the disproven invariant. New codes per spec §9.2. |
| `nextRegionId` / `nextBoundaryId` | **Remove** | Derived face identity is per-state (spec §10.3); no minted ids to count. |
| `regionId` on Move | **Remove (at v2)** | Derived from the corner (spec §7); kept during transition for v1 compatibility. |

Not optimising for minimum diff: the stored-array replacement is the
big conceptual-debt payoff — it deletes the only structure in the
engine that can silently disagree with the mathematics.

---

## Phase 3 — Stable foundations, and why they hold

1. **Immutable reducer.** The spec's safety argument (derived view
   computed at state birth can never go stale) *only* works under
   immutability. The foundation isn't merely compatible — the new
   model depends on it.
2. **Game Record as truth / replay through the real rules.** Spec §1
   is this principle, formalized. `importGame`'s replay loop is
   untouched by the migration; only what a Move contains changes.
3. **Engine/browser separation.** Corner and placement resolution are
   geometric readings of player intent — browser work, per the v0.5
   boundary. The engine receives combinatorial facts, exactly as it
   receives dot ids today.
4. **Coded errors, violations arrays.** New legality (region, π
   domain) is new codes in existing shapes.
5. **Testing philosophy (pure layer under Node, tests alongside).**
   Strengthened: the tracer, darts, containment, and even corner
   resolution (pure geometry) are all Node-testable. The v0.9.1
   fixture problem dissolves — fixtures are built by scripted σ
   insertions and traced, never hand-declared, so they cannot be
   invalid embeddings.
6. **Single seeding point, singleton Engine, gameRecord's
   Engine-independence.** All untouched.

---

## Phase 4 — Transitional architecture: four stages

Every stage compiles, passes all tests, and preserves observable
behaviour. The pattern is the one this project has used since v0.7's
`regionId` stub and v0.9's ride-along topology fields: **new structure
enters silently, earns trust in isolation, then takes over.**

### Stage A — Shadow topology
**Becomes true:** engine state carries σ (`rotations`: per-dot dart
arrays), maintained by the reducer on every move; darts exist as a
pure arithmetic view over `edges`. **Still legacy:** stored
regions/boundaries arrays untouched; all queries and gameplay read
legacy structures; Move unchanged; σ-insertion uses a documented
deterministic default corner (nothing reads σ, so the default is
unobservable). **New:** `engine/darts.js`, σ on state. **Testable:**
σ well-formedness after every move; |σ(v)| = deg(v); lives = 3 −
deg cross-check (I-6 preview); export/import re-derives identical σ.

### Stage B — Trusted derivation
**Becomes true:** faces, boundaries, regions, components are
derivable from (edges, σ) by a tracer with deterministic order (spec
§10.3), validated against the literature's splice formulas as
property-test oracle (P-O1) and per-component Euler. **Still
legacy:** gameplay still reads the stored arrays; the tracer has no
production callers. **New:** `engine/faces.js` (tracer + derived-view
builder), components extracted from regions.js's private union-find.
**Testable:** the entire derived layer, headlessly, against scripted
σ fixtures — P-O1, P-O3 discharged here, before any live game depends
on them.

### Stage C — Real moves
**Becomes true:** Moves carry real corners and placement; the browser
resolves them from drawn geometry; the reducer inserts at the real
corner and reconciles containment (anchors on state, reconcile-always
per spec §8.3); new `checkInvariants` (I-1…I-7) passes after every
reducer step in tests. **Still legacy:** queries still answer from
the stored arrays; legality still lives-only; Game Records still v1
(corner fields not yet serialized). **New:** Move v2 fields,
`js/cornerResolution.js`, containment maps, invariant checker v2.
**Testable:** P-O2 (small-n bisimulation: incremental apply ≡
rebuild-by-replay), resolution geometry under Node, reconcile cases.

### Stage D — Cutover
**Becomes true:** the derived view is the only topology; queries
re-targeted; stored arrays, counters, and the disproven invariant
deleted; region-aware legality live (v0.9.3); Game Record v2 with the
O-Q1 ruling applied to v1 imports. **Still legacy:** nothing
topological. `dots[].lives` remains as a cached derived value with
I-6 enforcement (removal is optional future hygiene, not debt).
**Testable:** everything in spec §9.2; the browser finally *shows*
multi-region behaviour.

---

## Phase 5 — Module migrations

**reducer.js** — Current: lives + edges + sprout + toggle. Future:
same, plus σ-insertion (two darts into two corners; σ(sprout) is the
unique 2-cycle) and containment reconciliation (merge: union +
re-anchor; split: transcribe π). Strategy: additive — each stage adds
one block to the existing function; the 1-sprout-2-edges skeleton and
`...state` spread never change. Never touches derived structure.

**regions.js** — Current: seeding, stored-array queries, old checker.
Future: the *facade* over the derived view — same five query
signatures, bodies call `faces.js`; `buildInitialTopology` seeds σ +
anchors; `checkInvariants` implements I-1…I-7. Strategy: bodies swap
at Stage D in one PR; call sites (`ui.js`, tests) never change.
Keeping the filename preserves every import in the project.

**move.js** — Current: `{startDotId, endDotId, regionId}`. Future:
endpoints + corners + placement (spec §7.2); regionId gone. Strategy:
additive fields with defaults (Stage C), retirement with formatVersion
2 (Stage D). Two shape changes, both flag-days for tests only.

**rules.js** — Current: existence + lives. Future: + region
membership, + π-domain exactness. Strategy: push new codes into the
existing violations array (the shape built for this at v0.8).

**gameRecord.js** — Current: v1 records, replay loop. Future: v2
records; v1 handled per O-Q1. Strategy: replay loop unchanged; the
serializer/shape-validator grow a version branch. `buildInitialState`
tracks `buildInitialTopology` automatically (it spreads it today).

**ui.js** — Current: `commitMove` builds Move from endpoints +
`getRegionForDot`. Future: builds Move from endpoints + resolved
corners + resolved placement. Strategy: one new call into
`cornerResolution.js` before `createMove`; the self-loop shortcut
gains the same resolution; everything else identical.

**New: engine/darts.js** — pure dart arithmetic over `edges` (origin,
α, dart enumeration). **New: engine/faces.js** — tracer, components,
derived view, deterministic ordering. **New: js/cornerResolution.js**
— pure geometry: departure angle of a path at an endpoint vs. incident
edge tangents → corner index; point-in-region test over floating
components → π. Browser-side by design, Node-testable because it's
pure math over path data.

**Unchanged:** engine.js, boardView.js, renderer.js,
drawInteraction.js, pathSimplify.js, crossingDetection.js (gains a
consumer, not a change), selectionState.js, models.js, gameRecordUI.js.

---

## Phase 6 — Dependency graphs

Current (engine layer):
```
ui.js ──► engine.js ──► reducer.js
   │            └─────► rules.js
   ├──► rules.js  ├──► move.js
   ├──► regions.js (stored arrays)
gameRecord.js ──► reducer.js, rules.js, regions.js(seed)
renderer.js ──► rules.js (playerForMove)
```

Desired:
```
ui.js ──► cornerResolution.js (browser geometry → corners, π)
   │──► engine.js ──► reducer.js ──► darts.js
   │──► rules.js ──────► faces.js ──► darts.js
   │──► regions.js (facade) ──► faces.js, containment
gameRecord.js ──► reducer.js, rules.js, regions.js(seed)
renderer.js ──► rules.js   (unchanged)
```

**Disappears:** every dependency on the stored regions/boundaries
arrays (the arrays disappear). **Appears:** darts.js (bottom of the
engine, depends on nothing), faces.js (depends on darts), one
browser-side resolution module. **Moves:** topology *truth* moves
from stored arrays into (σ, anchors) + derivation; topology
*presentation* stays exactly where callers already look (regions.js).
No cycle is introduced; the engine still imports nothing from the
browser layer.

---

## Phase 7 — PR roadmap

Version mapping (confirmed, Jared, July 2026): PR 1–6 = v0.9.2 (landed
as six reviewable sub-steps, version bumped once at PR 6); PR 7 =
v0.9.3; PR 8 = v0.9.4. Folded into ROADMAP.md.

**PR 0 — hygiene (optional, any time).** Objective: fix `models.js`'s
stale header comment (already flagged in ROADMAP); sync version
headers. Files: `js/models.js`. Tests: none (comment-only).
Invariants: all 88 pass untouched.

**PR 1 — dart layer (Stage A begins).** ✅ **COMPLETE** — merged to
`main` (commits `0d65527`, `f94f709`), tagged `v0.9.2-pr1` as the
pre-architectural-changes checkpoint. Objective: pure dart
arithmetic over the existing edges array; no state change. Files:
`js/engine/darts.js` (new), `tests/engine/darts.test.js` (new).
Tests: dart↔edge↔origin correspondence, α involution, permanence
under applyMove. Invariants after: behaviour identical; 104 tests
pass (100 original design + 4 added at implementation-review —
independent synthetic fixtures for the origin convention, and
explicit degree-0/isolated-vertex coverage). Implementation review
found and fixed one Must-Fix (the original convention test compared
against reducer-derived data rather than an independent fixture) and
recorded a forward contract in the module header: PR 2's σ must
always be exactly a permutation of `incidentDarts(edges, v)`, never
independently maintained.

**PR 2 — σ on state.** ✅ **COMPLETE** — merged to `main` (commit
`6d5de93`). Objective: `rotations` seeded by
`buildInitialTopology` and maintained by the reducer (default-corner
insertion, documented as unobservable-by-construction). Files:
`regions.js` (seeding), `reducer.js` — plus, discovered during
implementation and not in the original estimate, three test fixture
files (`reducer.test.js`, `darts.test.js`, `engine.test.js`) that
build state by hand and needed `...buildInitialTopology(N)` added,
since the reducer now assumes `state.rotations` is present (a real
precondition of the feature, not scope creep — these fixtures were
already incomplete representations of real state, just unexercised
until the reducer started reading the field). `regions.test.js` and
`gameRecord.test.js` gained genuinely new tests. Tests: σ
well-formedness per move; |σ(v)| = deg(edges,v), cross-checked
directly against PR 1's `darts.js`; prefix-preservation;
round-trip determinism via Game Record replay. Invariants after:
legacy behaviour byte-identical (nothing reads σ); 112/112 tests
pass (104 prior + 8 new). One latent pre-existing fixture bug
surfaced (a hand-built dot in `reducer.test.js` collides its id with
the next sprout's) — currently harmless, still passing, left
unfixed to avoid scope creep, noted as a future cleanup candidate.

**PR 3 — tracer + oracle (Stage B).** ✅ **COMPLETE** — merged to
`main` (commit `e05d7c0`). Objective: faces/components/
derived-view from (edges, σ); discharge P-O1 and P-O3 for the
tracer-expressible subset. Files:
`js/engine/faces.js` (new), union-find extracted from `regions.js`,
`tests/engine/faces.test.js` (new; includes the splice-formula
oracle property tests). Tests: orbit tracing determinism (§10.3),
per-component Euler, hand-traced oracle agreement for tree/bigon/
triangle shapes. Invariants after: P-O1/P-O3 revised and partially
discharged in the spec (§11.3). Finding from design review:
clockwise vs. counterclockwise orientation isn't decidable from σ
alone (depends on containment's outer-face designation, not the
tracer), so P-O3 is resolved as "convention fixed arbitrarily, cw/ccw
flip deferred to containment" rather than "matches the paper's
labelling directly." General split/merge oracle cases carrying a
nontrivial placement function π remain P-O1's residual, owed by
**PR 5**, once containment exists to receive them. 126/126 tests
passing (112 prior + 14 new); no production caller yet.

**PR 4 — Move v2 + resolution (Stage C begins).** ✅ **COMPLETE** —
merged to `main` (commit `9f7d089`). Objective: Moves
carry real corners; the browser resolves them. Files:
`move.js` (startCorner/endCorner/placement, all optional/nullable),
`reducer.js` (corner-driven insertion via `applyCornerInsertions`,
descending-index processing for same-vertex self-loop insertions;
legacy append fallback unchanged for cornerless Moves), `rules.js`
(corner-bounds checks, INCONSISTENT_CORNER_DATA, temporary
PLACEMENT_NOT_YET_SUPPORTED guard), `js/cornerResolution.js` (new —
pure angle-to-corner-index geometry). Tests: resolution unit tests
(pure, Node, no DOM); corner-driven insertion incl. the self-loop
shift-safety case; legacy fallback unchanged; corner-bounds and
placement validation. **Two scope decisions made explicit at design
review, not silently narrowed:** (1) `ui.js`/`boardView.js` NOT
touched — real browser geometry integration needs DOM test
infrastructure this project doesn't have; shipping it untested would
violate the project's testing discipline, so the pure algorithm is
built and tested, the adapter is deferred. (2) Region-aware legality
("do these corners share a region") stays out of scope — confirmed
during implementation that `validateMove` has never checked this;
it remains v0.9.3/PR 7's job, unstarted, clean slate. Placement (π)
support stays deliberately absent — containment doesn't exist until
PR 5, so a non-empty placement is rejected rather than silently
accepted. Invariants after: legacy (cornerless) games byte-identical
to PR 2/3 behaviour; corner-driven games insert at the exact
specified gap. 146/146 tests passing (126 prior + 20 new). Confirmed
`gameRecord.js` needed ZERO changes — only two test fixtures needed
adjusting (their comparison values incidentally picked up
`createMove()`'s new default null fields) — good evidence Game
Records are correctly shape-insulated from Move's growth, per the
architecture's own design intent.

**PR 5 — containment + invariants v2.** ✅ **IMPLEMENTATION COMPLETE,
not yet committed.** Objective: anchors on state, containment update
in the reducer, `checkInvariantsV2` implementing I-1…I-7 (I-8
deferred, see below; new codes, old `checkInvariants` untouched).
Files: `js/engine/containment.js` (new — `resolveOuterFaceAnchor`,
`resolveParentAnchor`, `computeK`, `updateContainmentForMerge`,
`updateContainmentForSplit`, `checkContainmentInvariants`), one
additive export to `faces.js` (`cornerFace`), `regions.js` (seeding +
`checkInvariantsV2`, alongside the untouched legacy checker),
`reducer.js` (classification + containment update, wired in after
the existing σ-update). Tests: hand-built containment fixtures
(same discipline as PR 3's faces.test.js); reducer integration tests
for merge/split; `checkInvariantsV2` tests including I-6/I-7
corruption detection; an exhaustive small-n walk (P-O2) for 1–3
initial dots to depth 2. 175/175 tests passing (146 prior + 29 new).

**Scope, restricted deliberately at design review, not silently:**
containment is verified only for (a) merges of two root components
with no occupants, and (b) splits with K = ∅ — matching PR 4's
existing placement restriction. Nested containment (a component that
already has its own occupants) is a known, explicit limitation.
**Reassuring finding from the implementation review:** this
restricted scope is *closed* under every move reachable from the
natural starting state (all dots isolated) — root-merges only ever
produce roots, K=∅ splits never create an occupant — so nothing in
this universe ever becomes non-root. The restriction is the *entire*
reachable state space, not a narrow slice of it, with one exception:

**🚩 RESOLVED at PR 5b** (see below) — this was a legality gap, not a
containment algorithm gap. `containment.js`/`reducer.js` were never
wrong.

**I-8 (π-domain exactness) deferred, walked back mid-implementation:**
the original design proposed grounding `rules.js`'s placement check
in real computed K (distinguishing "K happens to be nonempty" from
"malformed placement data"). Decided against it during implementation
— observable accept/reject behaviour is identical either way
(placement is rejected regardless), so the added complexity wasn't
justified yet. `rules.js` is unchanged from PR 4 in this PR.

**PR 5b — same-component/different-face legality (inserted between
PR 5 and PR 6).** ✅ **COMPLETE** — merged to `main` (commit
`a58d5e0`). Objective: close the open risk above. **Reframe, not a patch:**
working the case through spec D4 + §7.3 gives a general proof —
region identity is a function of (host component, host face); two
distinct faces of the same component always host two distinct
regions; §7.3 requires both corners of a legal Move to border the
same region; therefore connecting two different faces of the same
component is ALWAYS illegal, unconditionally, in full generality —
not scoped to PR 5's restricted universe. This was a legality gap,
not a containment gap: `containment.js` and `reducer.js` needed zero
changes. Files: `rules.js` only (one check, one new violation code
`SAME_COMPONENT_DIFFERENT_FACE`), plus two test files. Scope: the
check runs only for v2 (real-corner) moves — legacy cornerless moves
use an implied corner (an arbitrary convention, not necessarily
faithful to a v1 game's history), so retroactively rejecting them
here would compound spec open question O-Q1 rather than resolve it;
this residual gap is tied to O-Q1, not new. Tests: the exact fixture
that broke PR 5's P-O2 test, now correctly rejected; a genuine
same-face split (correctly still accepted); legacy-move exemption
confirmed explicit; cross-component merge confirmed unaffected.
179/179 tests passing (175 prior + 4 new — 3 existing PR 4-era
`rules.test.js` fixtures also needed fixing: two gained `edges: []`
legitimately, one was rebuilt with genuine consistent topology after
a hand-trace error was caught rather than papered over — see the
PR 5b implementation review). **Note for PR 7:** this check is a
provable special case of PR 7's eventual general region-legality
machinery; PR 7 should generalize or absorb it, not duplicate it.

**PR 6 — cutover (Stage D; version → v0.9.2).** ✅ **COMPLETE** —
merged to `main` (commit `5fe7545`). Objective: queries
re-target the derived view; stored arrays, counters,
`DOT_BOUNDARY_COUNT_WRONG`, and the old checker deleted; F1's
null-for-sprouts bug ceases to exist. Files: `regions.js` (bodies) —
`gameRecord.js`/`ui.js` needed ZERO changes (grep-confirmed before
implementation: only `getRegionForDot` has an external caller, and
its contract — number in, number or null out — is preserved exactly;
`gameRecord.js` only ever spreads `buildInitialTopology(...)`, never
references field names). `regions.test.js` and `gameRecord.test.js`
rebuilt/fixed — the one PR with heavy test churn, accepted because
the *contracts* under test are unchanged. Tests: all five queries
against real multi-region positions built via scripted moves (a
star/tree for shared-boundary siblings; a self-loop bigon for
different-boundary/different-region within one component; two
never-connected isolated dots confirming they already share the
plane's one outer region — real, reachable, and would be wrong under
naive face-equality); `getRegionForDot(sprout)` now real, explicit
F1-closure test. 168/168 tests passing.

**Three findings from the cutover design/implementation, recorded
because they change what these functions mean, not just how they're
computed:** (1) a "boundary" is a face, given a disjoint numeric id
(smallest dart, or -(component+1) for trivial faces); (2) region and
boundary are the SAME identifier at the single-corner level, but
comparing two DIFFERENT dots' regions is never simple face equality
— spec D4's region = host face + occupants' outer walks means two
dots can share a region while on different faces (confirmed by the
"two unconnected isolated dots" test above, which the old, naive
v0.9.1 equality check would have gotten right only by accident of
having no occupant hierarchy at all); (3) `getRegionForDot`'s
corner-0 convention is documented as arbitrary-but-fixed, same
precedent as PR 3/PR 4, since its only caller (`ui.js`) doesn't yet
supply a real corner and its result isn't read for correctness by
anything (region-legality is PR 7's job). The occupant branch of (2)
is NOT reachable via real gameplay yet (PR 5's restricted containment
scope) — hand-built and clearly labeled, same discipline as
`containment.test.js`. A real hand-trace error (wrong vertex assumed
to be "on the occupied face") was caught and fixed while writing that
fixture — same pattern as PR 5b's caught error, worth noting twice
now as a real, recurring benefit of writing out traces in test
comments rather than just asserting expected values.

**PR 7 — region-aware legality (v0.9.3).** ✅ **COMPLETE** —
merged to `main` (commit `c70d472`). Objective: `validateMove`
gains `DIFFERENT_REGIONS` + π-domain exactness (I-8); UI message map
entry. Files: `rules.js` (main logic), `regions.js` (`areDotsInSameRegion`
extended with optional explicit-corner parameters, default 0,
preserving `ui.js`'s existing call contract exactly), `ui.js`
(one `VIOLATION_MESSAGES` entry), `rules.test.js`.

**Absorbs PR 5b's `SAME_COMPONENT_DIFFERENT_FACE` entirely** — removed,
not kept alongside `DIFFERENT_REGIONS`, per that check's own
forward note. A design-step finding caught before any code was
written: `areDotsInSameRegion`'s `a === b` short-circuit would have
silently broken self-loop moves with genuinely different corners
landing on different faces (exactly PR 5b's scenario) — fixed to
`a === b && cornerA === cornerB` before implementation began.

I-8 is now real, not just re-asserted: for a classified split, K
(the region's actual occupants, excluding the touched component) is
computed via `containment.js`'s `computeK` — K = ∅ falls through to
the existing placement-empty rule; K non-empty is rejected with the
new, more precise `NONEMPTY_K_NOT_YET_SUPPORTED` (distinguishing
"malformed placement" from "this position needs support the reducer
doesn't have yet" — PR 5's restriction to K = ∅ splits still stands).
Merge moves keep requiring placement empty, unconditionally, no K
concept applies to them.

**Third consecutive PR (5b, 6, 7) where a hand-traced corner→face
assumption was wrong on first attempt and caught before merge, not
after** — this time twice in one PR: several PR 4/5b-era test
fixtures needed reconstructing with genuinely consistent topology
(not just added containment fields) once region-checking required
real structure; and a new test's own assumption (a single vertex's
two corners both landing on the same face) was wrong, caught by the
assertion failing rather than by inspection, fixed using two
different vertices' corner-0s instead. Recorded as a real, recurring
pattern this project's write-out-the-trace discipline keeps catching,
not three unrelated incidents.

**Honest scope note:** these checks are correct and tested but not
yet reachable from real gameplay — `ui.js` still only constructs
legacy (cornerless) moves; browser wiring for real corners remains
PR 4's still-standing deferred scope decision. 169/169 tests passing.

**PR 8 — Game Record formatVersion 2 (v0.9.4).** ✅ **COMPLETE** —
merged to `main` (commit `1bb0b7a`). Objective: serialize corners +
placement per spec §7.5; apply the O-Q1 ruling to v1 imports; retire
`regionId` from Move; discharge P-O5 (round-trip under replay).

**O-Q1 ruling applied: v1 records dropped entirely.** `gameRecord.js`
now requires formatVersion 2; anything else (including v1) is
rejected via the existing, unmodified `INVALID_FORMAT_VERSION` path
— confirmed with an explicit test using the exact old v1 shape.

**The reducer's legacy-path question, resolved:** kept, deliberately
decoupled from v1 framing. Precise count taken before implementing
(not assumed): only 4 non-trivial `createMove()` call sites exist
across the whole codebase (2 in `ui.js`, 2 in `reducer.test.js`) —
the other ~87 use the plain two-argument form and are entirely
unaffected by removing `regionId` from a middle position. This
confirmed keeping the fallback (as a general construction
convenience, no longer tied to any Game Record format) was the right
call, made explicitly rather than assumed, after an earlier
under-scoped explanation of the tradeoff was caught and corrected
before the decision was finalized.

**Two real bugs caught during implementation, same discipline as
PR 5b/6/7's caught hand-trace errors, different category this time:**
(1) the two `reducer.test.js` corner-bearing calls shifted argument
meaning silently when `regionId` was removed from position 3 —
anticipated explicitly in the design step, still happened, caught
immediately by the test suite's clear diff output, fixed in the same
pass. (2) `gameRecord.test.js`'s `toV1Shape` comparator compared
`m.regionId` on both round-trip sides — once `regionId` doesn't
exist anywhere, this would silently compare `undefined === undefined`
and pass without checking anything, the same coincidental-pass
pattern PR 6 caught in a different test. Fixed by recognizing the
entire workaround was obsolete: both sides share the same v2 shape
now, so a direct `deepEqual` is simpler AND strictly more correct
than the stripping helper it replaced.

`ui.js`'s `getRegionForDot` import, both call sites, and one now-dead
local variable were removed as a direct, verified consequence, not
spuriously — `regions.js`'s own unrelated `getBoundariesForRegion`
`regionId` parameter (the derived-view face identifier from PR 6)
was correctly left untouched throughout.

Files: `move.js` (regionId retired), `gameRecord.js` (v2 shape),
`reducer.js`/`rules.js`/`regions.js` (documentation reframing only,
no functional change), `ui.js` (corner-0 placeholder, dead-code
removal), `reducer.test.js` + `gameRecord.test.js` (fixture/comparator
updates). 171/171 tests passing (169 prior + 2 new).

Every PR: compiles, all tests green, no observable behaviour change
until PR 6 (which changes only what was already wrong — F1) and PR 7
(which is the feature).

### PR dependency graph

```
              PR 0 (hygiene)        [independent — any time]

  PR 1 (darts)
    │
  PR 2 (σ on state) ────soft───┐   (σ format contract only;
    │                          │    PR 3 fixtures are scripted)
  PR 3 (tracer + oracle) ◄─────┘    discharges P-O1, P-O3
    │
  PR 4 (Move v2 + resolution)       needs σ (2) + tracer (3)
    │
  PR 5 (containment + inv. v2)      needs π from Move (4);
    │                               discharges P-O2, P-O4
  PR 6 (cutover, version bump)
    │           │
  PR 7 (legality)   PR 8 (record v2) ◄── O-Q1: RESOLVED (drop v1)
                    needs 4 + 6; independent of 7 (7-first is
                    a product choice); discharges P-O5
```

Critical path: 1→2→3→4→5→6 (PRs 7 and 8 fork after 6). External
gate resolved: O-Q1 ruled (drop v1 records entirely, no migration
path) — PR 8 now unblocked. Only useful parallelization: PR 3
alongside PR 2 once the σ representation is written down; with one
implementer,
serial order is simpler and preferred.

### PR 1 API note (adopted at design review)

`incidentDarts(edges, vertexId)` — renamed from the drafted
`dartsFrom` — returns a vertex's darts in ascending dart-id order,
which is incidence, NOT rotation: no cyclic or geometric meaning.
σ does not exist in darts.js and never will; when σ arrives (PR 2)
it lives on engine state and is the only source of rotation order.
Ascending dart-id order is nonetheless the deterministic base
enumeration that §10.3's conventions build on, and must not be
changed casually.

---

## Phase 8 — Technical debt: what dissolves, evolves, remains

**Dissolves (deleted by the migration, no replacement needed):**
- Stored regions/boundaries arrays and their staleness-after-move-1
  (F1) — the debt the whole migration exists to pay.
- `getRegionForDot(sprout) → null` and the resulting
  `regionId: null` in exported v1 records (F1's visible symptom).
- `DOT_BOUNDARY_COUNT_WRONG` — enforcement of a disproven invariant.
- `nextRegionId` / `nextBoundaryId` — counters for ids the spec
  makes per-state and derived.
- The v0.9.1 fixture-construction problem — multi-region fixtures
  are henceforth *produced* by scripted moves and traced, never
  hand-declared, so invalid embeddings are unconstructible.
- The scoped-down Euler test coverage (v0.9.1's documented
  limitation) — I-5 runs against every reducer-produced state.

**Evolves:**
- `regionId` on Move: derived-but-carried during transition, retired
  at formatVersion 2.
- `dots[].lives`: authoritative → cached derived value under I-6.
  Full removal (dots as bare ids) is optional future hygiene; the
  spec's §4.1 explicitly permits the cache.
- One-boundary-per-dot seeding: conceptually survives as
  vertex-token containment (spec §3.4) — same insight, correct
  encoding.
- `models.js` stale comment: PR 0.

**Remains, deliberately:**
- `originatingMoveIndex` — event provenance, correctly outside
  topological identity.
- `isExhausted`'s `<= 0` defensive check — cheap, harmless.
- Engine singleton — correct for one live browser game;
  gameRecord.js already bypasses it for everything headless.
- Placeholder geometry for imported games — a rendering concern the
  topology model doesn't touch.

---

## Phase 9 — Risks and mitigations

**R1 — Corner resolution geometry (highest risk).** Mapping a drawn
path's departure angle to a rotation gap, and floating components to
sides of a curve, is new geometric code with real edge cases (near-
tangent departures, paths hugging a dot's exclusion radius).
*Mitigate:* pure module, exhaustive Node tests; a commit-time
assertion that the resolved corner's region contains the resolved
placement targets (cheap cross-check via the derived view); Sprouts'
own structure caps ambiguity — legal endpoints have degree ≤ 2, so
resolution chooses between at most two corners, and often only one
borders the drawn-through region.

**R2 — Handedness/orientation mismatch (conceptual).** *Revised after
PR 3*: this risk was based on a false premise — that the tracer alone
determines cw/ccw handedness. It doesn't (§2.4, revised); handedness
is only meaningful relative to containment's outer-face designation.
The real version of this risk moves to **PR 5**: a consistent but
mirror-imaged containment/orientation choice there would pass
structural checks while producing a position mismatched with the
paper's specific labelling. *Mitigate:* resolve against a hand-traced
case where the outer face is unambiguous by construction (e.g. a
single bounded region with one occupant), pin it in the spec, then
let PR 5's oracle tests hold it fixed. **Resolved at PR 10:** the
enclosure work made the outer-face choice concrete via the Move's
`exteriorSide` field — which side of a ⊥-region split remains
unbounded is now supplied by the drawing (geometrically) rather than
guessed from σ, so occupants outside a loop stay roots and occupants
inside nest, with no mirror-image ambiguity. The residual "which dart
names a face" freedom is a canonicalisation concern (Phase 2), not an
orientation-correctness one.

**R3 — v1 replay compatibility (migration).** v1 records lack
corners; degree-2 replay is ambiguous (spec O-Q1). *Mitigate:* the
decision is explicitly gated (PR 8); until then v1 records replay
under the documented default corner, which is deterministic and
consistent — and note v1 records never recorded an embedding, so the
default is not "wrong," it is a choice among embeddings the record
never distinguished. Needs the tech lead's ruling before PR 8, not
before PR 1.

**R4 — Test churn at cutover (testing).** PR 6 rewrites most of
`regions.test.js`'s fixtures. *Mitigate:* contracts under test are
unchanged; fixtures move from hand-built data to scripted-move
construction, which is strictly more trustworthy; churn is confined
to one PR with no production logic beyond query bodies.

**R5 — Reducer state-shape churn (migration).** Three PRs touch
state shape (2, 5, 6); each breaks deep-equality assertions in
existing tests. *Mitigate:* the same ride-along pattern v0.8.5/v0.9
used twice already; shape-asserting tests are updated in the same PR
that changes the shape, never after.

**R6 — Performance (low).** Eager derivation per state is O(V+E)
with V+E bounded by ~4·initialDotCount. Negligible for play and
import; if Phase-4 search ever cares, memoization belongs in the
search layer (spec review, Q2). No action now.

**R7 — UI integration (moderate).** Multi-region play becomes
*visible* at PR 7 — status messages, rejection flows for
DIFFERENT_REGIONS, and the self-loop shortcut all need the same
resolution data. *Mitigate:* PR 4 routes the shortcut through the
identical resolution call as commitMove, so PR 7 changes messages,
not plumbing.

---

**PR 9 — Wire real corner resolution into the browser (v1.0).**
✅ **COMPLETE.** Objective: replace `ui.js`'s hardcoded corner-0
placeholder (PR 4/PR 8 stopgap) at the real commit path with actual
corners resolved from the drawn curve's geometry against each
endpoint's existing edges, using `js/cornerResolution.js` (built at
PR 4, unwired until now).

Two new pure/bridging modules, following the project's existing
zero-game-knowledge geometry module pattern (`pathSimplify.js`,
`crossingDetection.js`):
- `js/pathGeometry.js` — `departureAngle(points, end)` (a curve's
  angle at one endpoint) and `arcLengthSplit(points)` (the
  arc-length midpoint PLUS its two departure tangents — always
  exactly π apart, since splitting a smooth curve at an interior
  point creates no new bend).
- `js/cornerGeometry.js` — the actual bridge PR 4's scope note
  deferred ("does NOT extract real angles from boardView.js... NOT
  wired into ui.js"). `existingAngles(state, dotId, getEdgePath)`
  walks `state.rotations[dotId]` (already in σ order, which
  `resolveCornerIndex` requires) and, per dart, resolves its angle
  from whichever stored path created it — using dart parity
  (`d % 2`, per `darts.js`'s pinned convention) to tell whether the
  dart's origin is the move's ORIGINAL endpoint or its SPROUT.
  `resolveMoveCorners(...)` calls this for both endpoints of a move
  about to be committed and resolves against the just-drawn curve's
  own two departure angles.

**Key structural fact relied on, verified against the reducer (not
assumed):** `edges[k].a` is always the pre-existing endpoint of the
move that created edge k, `edges[k].b` is always that move's sprout
— and every move creates exactly 2 edges at array positions
`[2·moveIndex, 2·moveIndex+1]` (`firstEdgeIndex = state.edges.length`,
always 2·moveIndex since edges only ever grow by 2). This lets
`cornerGeometry.js` go from an edge index straight to "start-side or
end-side" with no search.

**`renderer.js`'s `pathMidpoint` refactored** to call
`arcLengthSplit(...).point` rather than re-implement the arc-length
walk — single source of truth, so sprout *placement* and PR 9's
*angle resolution* can never independently drift apart on where the
split point is. Verified byte-identical output on a known fixture
before and after (a corner-boundary case, arc length landing exactly
on a bend).

**Real finding, worth recording:** a self-loop is only ever legal on
a degree-0 or degree-1 dot (needs 2 fresh darts, max degree 3), and
`resolveCornerIndex` always returns corner 0 for degree ≤ 1
regardless of the new angle (only one gap exists). Consequence: for
every legal self-loop, both `startCorner` and `endCorner` **must**
resolve to 0 — a structural fact of the lives rule intersecting the
corner-indexing scheme, not a coincidence of any particular fixture.
Test added to record this explicitly rather than let it be
rediscovered by surprise later.

**Scope fence held:** no engine files touched (`rules.js`,
`reducer.js`, `regions.js`, `containment.js` all untouched — verified
via `git status`). The self-loop pre-tap shortcut in `ui.js`
(`SelectionState`'s second-tap branch) deliberately KEEPS its
corner-0 placeholder — it fires before any curve is drawn, so there
is no real departure angle yet to resolve; it remains a
responsiveness pre-check only, `Engine.apply`'s real validation at
`commitMove()` is unaffected and is where real corners now apply.
`placement` remains `null` (PR 10's job).

Tests: 2 new files, `tests/pathGeometry.test.js` (8 tests) and
`tests/cornerGeometry.test.js` (7 tests) — all hand-derived-angle
fixtures, no DOM/boardView, same testability discipline as
`cornerResolution.test.js`. 186/186 tests passing (171 prior + 15
new). No engine test needed changes — no engine files touched.

**Residual limitation, explicit:** still no browser/DOM test
infrastructure (same PR 4 scope cut). The pure geometry and the
engine-state bridging are fully tested headlessly; the actual
wiring into a real pointer-drag gesture in the browser has not been
exercised automatically and needs a manual playtest.

## Open items carried

**PR 10 — Nonempty-K placement / enclosure (v1.0).** ✅ **COMPLETE.**
The biggest remaining feature gap: moves that enclose other
components (looping a line around other dots) were silently accepted
by the engine without registering the enclosure. Fixed end-to-end,
engine + browser (Option B, one PR — Jared's call).

*Literature check first (house rule):* re-read Čížek & Balko
(arXiv:2108.07671, §3 + the single-boundary-move section). It
independently confirms our spec §7.2–§8.2: a split partitions the
region's other occupants into two sides ("major"/"minor" in their
terms), and that partition is NOT derivable from graph combinatorics
— it needs the drawn geometry. This validated the existing
placement/π mechanism (built at PR 4, empty until now) as the right
design; nothing needed re-architecting.

*Root cause found (verified by direct probe, not assumed):* the
enclosure bug lived in `computeK`. It only saw occupants whose
`parentAnchor` resolved to a real face; sibling ROOT components
(parentAnchor ⊥ / null) sharing the plane's outer region were
invisible to it. Fix: `computeK` gained an optional `outerFaceAnchor`
argument; when the host face is a root's own outer face (the
⊥-adjacent region being split), every other root is included in K
(spec D4: the plane's outer region is bounded by all roots' outer
walks). `getBoundariesForRegion` shared this latent bug and is fixed
for free.

*Engine changes:*
- `computeK` — ⊥ handling as above.
- `updateContainmentForSplit` — now redistributes occupant subtrees
  in K to the two descendant sides per placement π; K = ∅ still works
  (loop runs zero times). New `splitDescendantFaces` helper pins the
  deterministic side-1/side-2 ordering (by smallest dart) that π and
  the browser geometry both agree on.
- `rules.js` — the blanket `NONEMPTY_K_NOT_YET_SUPPORTED` rejection is
  replaced by real domain-exactness validation (spec §7.3: dom(π) = K,
  values in {1,2}), emitted as the new `PLACEMENT_DOMAIN_MISMATCH`.
  I-8 is now genuinely checked, not deferred.
- `move.js` / `gameRecord.js` — a `Move` gained `exteriorSide` (see
  below), appended as the 6th positional field (safe: no middle-shift,
  unlike PR 8's regionId removal) and serialized in the Game Record.

*Design decision surfaced mid-implementation and resolved by Jared
(Option 1):* a split of the plane's outer region produces one bounded
face and one still-⊥-adjacent face. An occupant placed on the
exterior side is topologically still a root and MUST keep
`parentAnchor = ⊥`, or two encodings of the same position would
differ and break canonicalisation (Phase 2). Rather than defer this
to the canonicaliser, the Move now carries `exteriorSide` (which of
the two sides is unbounded), derived geometrically at the same time
as π; occupants on that side stay roots. Keeps "roots have ⊥" true at
all times.

*Browser half (Option B):*
- `js/regionGeometry.js` (new, pure) — `pointInPolygon`,
  `partitionByEnclosure`, `signedArea`. Even-odd ray casting; zero
  game knowledge, same discipline as `pathGeometry.js`.
- `js/cornerGeometry.js` — new `resolveMovePlacement(...)`: computes K,
  partitions occupants by whether the drawn loop encloses their
  representative vertex's screen position, and emits π (inside →
  interior side 1, outside → exterior side 2) with `exteriorSide = 2`.
  Self-consistent by construction (verified: whichever side is
  declared exterior, the reducer nests the other side's occupants
  into a genuine bounded face and invariants hold).
- `ui.js` `commitMove` — now calls `resolveMovePlacement` and passes
  real π + exteriorSide on every committed move.

*Tests:* `computeK` ⊥ branch, `splitDescendantFaces`,
`updateContainmentForSplit` redistribution + exterior-root
normalisation (containment.test.js, +7); `regionGeometry.test.js`
(+6, pure point-in-polygon incl. a non-convex L-shape); enclosure
resolution end-to-end (cornerGeometry.test.js, +3). The P-O2
exhaustive walker (regions.test.js) now GENERATES enclosure moves —
every placement × exterior-side choice — so invariants are checked
after every reachable enclosure outcome up to depth 2, not just K = ∅.
Five existing tests updated for the behaviour change (old
NONEMPTY_K rejection test rewritten as domain-exactness; gameRecord
fixtures/round-trips carry the new field; P-O5 strengthened to
round-trip placement + exteriorSide). 202/202 passing.

*Residual limitations (explicit):* (1) MERGE still handles only two
ROOT components — merging a nested component or one carrying its own
occupants isn't exercised (doesn't arise from current browser moves;
left for PR 11 enumeration to surface). (2) Full canonicalisation of
which dart names a face is still Phase 2's job — PR 10 guarantees
exterior occupants are ⊥, not that two drawings of the same enclosure
pick identical darts. (3) No browser/DOM test harness still (same PR 4
cut) — the point-in-polygon logic and the engine bridge are tested
headlessly; the live pointer-drag needs a manual playtest.

**PR 10 manual playtest findings (Jared) — TWO bugs found, both
confirmed by direct engine trace, neither yet fixed.** Residual
limitation (1) above turned out to be directly reachable from
ordinary play, not a hypothetical: enclosing a dot and then
connecting the loop's owner to that same enclosed dot is one of the
most natural next moves, and it hits exactly that unexercised path.

- **Bug 1 — interior/exterior side assigned by dart numbering, not
  geometry.** `resolveMovePlacement` hardcodes "inside the drawn
  loop → side 1," but which physical σ-face is side 1 is determined
  by dart numbering, unrelated to which face the loop geometrically
  encloses. When they disagree, the enclosed dot gets nested into the
  wrong face and later same-region checks correctly (!) report the
  dots as being in different regions — this is why the same move
  worked from one dot and failed from another (asymmetric only
  because dart numbering happened to align for one and not the
  other). Root cause traced with a direct probe: with a hand-picked
  *correct* placement, the identical scenario works; the browser
  simply has no way today to derive that correct placement from
  screen coordinates.
- **Bug 2 — merge corrupts containment when absorbing a nested
  occupant.** Separate from Bug 1 and found by continuing the trace
  with a hand-verified-correct placement: connecting the loop's owner
  to its own enclosed occupant (a legal move, and a merge in the
  engine's classification) silently overwrites the owner's
  `outerFaceAnchor` to point at the *interior* face instead of
  leaving the untouched true exterior alone. `checkInvariantsV2`
  cannot see this — by design, no σ-only invariant can, since which
  face is "outer" isn't decidable from σ (P-O3) and the engine can
  only preserve a told fact, not verify one. This corrupted state
  then poisons a THIRD, later move (the bisecting split Jared
  predicted mathematically): `computeK` misreads the interior face as
  the plane's outer region and wrongly includes the far-away exterior
  dot as an occupant, producing `DIFFERENT_REGIONS`/
  `PLACEMENT_DOMAIN_MISMATCH` even though the two dots being
  connected are provably on the same face.

Key finding shaping both fixes' test strategy: **this bug class is
invisible to structural invariants.** Every existing invariant
(I-1…I-8) passed on the corrupted state. Acceptance for PR 10a/10b
below is therefore behavioral — play a scripted sequence, then check
that region-membership answers match the drawing — not structural.

**PR 10a — Merge must preserve containment (engine only).** ✅
**COMPLETE.** Objective: fix
`updateContainmentForMerge` so absorbing an already-nested occupant
(Bug 2) preserves the untouched component's real outer-face anchor
and parent relationship, instead of always re-pointing the survivor's
outer anchor at the newly-fused face (only correct for genuine
root-root merges).

Unified rule, replacing the assumed-root-root special case —
**corrected at design review** (the first draft framed this as a
paired "both/one/neither fused" table and asserted the "neither"
case impossible; that's wrong — the touched corner needn't be on
either component's OUTER face at all, it can be on one of a
component's own INTERIOR faces, e.g. connecting to a dot on an inner
face of an already-multi-face component, so "neither" is a real,
reachable case, not an assertable impossibility): evaluate each
component **independently**, per its own corner. For component A: is
A's outer face literally the face A's corner (`startFace`) resolved
to? If yes, A's outer anchor moves to the fused face (today's
root-root behaviour). If no — the touched corner was on one of A's
OWN interior faces — A's outer anchor is completely unchanged,
regardless of what happens to B. Apply the identical, independent
test to B against `endFace`. No paired case analysis needed; each
component's own anchor update depends only on its own face, never on
whether the OTHER component's face also happened to be its outer one.
This uniformly covers root-root (both touched faces are both outer →
both move, matching today), absorption of a nested occupant (the
occupant's own trivial face is always "outer" for a childless
singleton, so its side updates trivially; the OWNER's face is
untouched, so the owner's real anchor correctly stays put — the actual
bug fix), and the new case design review caught (a touched INTERIOR
face on either side leaves that side's outer anchor alone, correctly,
since it's an unrelated face).

Spec: §8.2 merge update generalised from "both roots" to the unified
rule above; new documented invariant (not machine-checked): a nested
occupant's parentAnchor never resolves to its own host's outer face.
No literature re-check needed (Čížek & Balko's analysis concerned
splits, not merges). Public API: `updateContainmentForMerge` gains
`oldFaces, startFace, endFace` params (already available in the
reducer, which already computes them for the split branch) — no Move
shape change, no rules.js change (legality was already correct; only
the state update was wrong). No new invariants; acceptance is the
behavioral oracle above, plus: Jared's exact 3-move sequence (loop →
absorb → bisect) validates end to end; root-root merges are
byte-identical to today (regression); the P-O2 walker gets extended to
generate real corners for cross-component moves so depth-2 walks
actually reach the absorption path (today's cornerless walker moves
never did — a gap in the walker, not just the engine, worth fixing at
the same time). Scope fence: no geometry, no browser files, no split
handling changes, does not attempt Bug 1.

**Implementation.** Files: `js/engine/containment.js`
(`updateContainmentForMerge` rewritten per the independent-per-side
rule; new params `oldFaces, startFace, endFace`), `js/engine/reducer.js`
(passes them through — already had all three in scope at the merge
call site, no new computation needed).

**A real, second design gap found DURING implementation** (not caught
at design review, only by running the actual exhaustive walker): the
P-O2 walker's cross-component moves were cornerless, and the
reducer's `impliedCorner` fallback (last-inserted dart) does not
reliably correspond to a region-legal face once occupants can be
asymmetrically nested after an enclosure. The walker fed such a move
straight to `applyMove` (which trusts its caller and does not
validate — by design), silently corrupting containment into a literal
self-referencing cycle (`parentAnchor[0] = 0`) and tripping
`FOREST_CYCLE`/`PARENT_UNSOUND`. Traced to ground with a standalone
probe before touching the real test file: confirmed the specific
failing move was genuinely illegal (the two touched faces were
different regions) and would have been rejected by `validateMove`
had anything asked it. Fixed the walker itself — it now tries every
real corner pair per cross-component candidate and keeps only the
ones `validateMove` accepts, exactly as the design's own "extend the
walker" note anticipated, just discovered as a hard failure rather
than found by inspection. Re-ran the probe against 1–3 dots up to
depth 3 with the fixed walker: clean. This was a **test-generator
bug, not an engine bug** — worth stating plainly since it's easy to
misfile as evidence the merge fix was wrong.

Three pre-existing test fixtures (`darts.test.js`,
`reducer.test.js` ×2) surfaced a latent gap of their own: they
manually pushed a 3rd dot onto `state.dots`/`state.rotations` without
seeding matching `outerFaceAnchor`/`parentAnchor` entries — harmless
under the old merge code (which never read the other side's anchor),
but a crash under the new one (which does). Fixed by seeding those
entries the same way an already-correct nearby fixture in the same
file already did — not a new pattern, just applying the existing
one everywhere the state shape requires it.

**Tests:** `containment.test.js` — the two existing direct
`updateContainmentForMerge` tests updated for the new signature
(constructing real `oldFaces`/`startFace`/`endFace` fixtures, hand-
verified against `traceFaces` output rather than assumed) plus one
new test isolating the absorption fix directly (host's outer anchor
must be byte-identical before/after, not merely "close"). `engine.test.js`
— the key end-to-end acceptance oracle: Jared's exact 3-move sequence
(enclosing self-loop → owner absorbs the enclosed dot → the enclosed
dot connects to the loop's own sprout, bisecting the enclosed region),
discovering each move's real corners via `Engine.validate` rather than
hardcoding indices, so the test doesn't silently depend on internal
dart-numbering staying fixed. All three moves now validate and apply;
dot 2 (always outside the loop) is confirmed to never become
reachable throughout. `regions.test.js` — P-O2 walker fixed as above.
204/204 tests passing (203 prior + 1 new acceptance test; the walker
fix and fixture seeding are corrections to existing tests, not new
counts).

**Residual, explicit:** Bug 1 (interior/exterior side chosen by dart
numbering rather than geometry) is untouched — that's PR 10b's job,
next. The "neither touched" branch (a coded `throw`, not a silent
wrong answer) remains unexercised by any test — attempted
construction of a legal move reaching it failed for every scenario
tried, consistent with the region-sharing legality argument in the
design (reaching a foreign component always requires touching at
least one side's own outer face), but this is not a proof, and the
throw stays in place specifically so a wrong assumption fails loudly
rather than corrupting state, exactly as designed.

**PR 10b — Geometric interior-side resolution (browser bridge).** ✅
**COMPLETE, scoped** (see PR 10c below for what this does NOT yet
fix). Objective: replace `resolveMovePlacement`'s hardcoded "inside →
side 1" with a real geometric determination of which σ-side is the
drawn loop's interior.

Records why three earlier same-session attempts failed, so they're
not retried: (a) ray-from-dot-toward-occupant — unsound for
non-convex loops; (b) speculative-apply-as-oracle — the engine has no
geometry, it just obeys whichever placement it's given, so both
choices "succeed" and the probe can't discriminate; (c) whole-loop
polygon per descendant face, reusing the SAME full path for both of a
move's edges — a self-loop is ONE stored curve but TWO engine edges,
so both faces' walks traced the same closed curve and point-in-polygon
couldn't tell them apart. A fourth attempt (this one shipped) also
needed one implementation-time correction: the first `newDarts`
computation conflated `moveIndex` (`state.moves.length`) with
`firstEdgeIndex` (`state.edges.length`, always 2×moveIndex) — caught
by a direct probe (a fixture with a pre-existing edge produced
obviously-wrong descendant faces), not by re-reasoning; fixed to use
`state.edges.length` directly.

**Implementation, two mechanisms for two cases** (confirmed necessary
by direct testing, not assumed): (1) **Different-dot split** (e.g.
connecting two distinct dots that already share a face): the drawn
path is an open arc, and the two descendant faces have genuinely
different boundary polygons once every edge on each one's walk is
correctly split into its own two arcs via the new `splitPathAtMidpoint`
(in pathGeometry.js, sharing `arcLengthSplit`'s arc-length walk — one
source of truth for where a sprout sits and how its edges are
geometrically shaped). Occupants are tested directly against the
reconstructed polygons. (2) **Self-loop**: confirmed directly that
polygon reconstruction degenerates here — with no other boundary
structure to differentiate them, both descendant faces trace the
SAME closed curve in opposite winding order, and point-in-polygon
gives an identical answer for either (verified: both registered the
same interior point as "contained"). So for a self-loop, occupants
are tested against the raw drawn path directly (unambiguous — it's
the actual physical curve), and which abstract side number is
"interior" is learned by matching one reconstructed descendant's
winding sign against the drawn path's own winding sign — the
descendant traced in the same direction the loop was physically drawn
is definitionally the bounded one. `exteriorSide` is only set when the
split touches the touched component's own current root/⊥ face
(Option 1's actual scope); left `null` otherwise (interior splits
one level of nesting deeper).

Spec: §7.2 placement now geometrically grounded; P-O3/R2 close fully
for self-loops (orientation isn't decidable from σ alone, but IS now
resolved for browser play via the pinned sign convention — the mirror
CW/CCW test is the one that would have caught Bug 1's asymmetry
directly, and does). Public API: `pathGeometry.js` gains
`splitPathAtMidpoint`; `cornerGeometry.js`'s `resolveMovePlacement`
gains a `getEdgePath` param, threaded through from `ui.js`'s existing
`BoardView.getEdgePath`. No engine changes.

**Tests:** `tests/pathGeometry.test.js` (+4 for `splitPathAtMidpoint`,
one hand-derivation error self-caught by a failing assertion and
corrected in the comment, not papered over — the split lands on
segment index 0, not 1, for the L-shaped fixture; house discipline
held). `tests/cornerGeometry.test.js` (+6): the A-vs-C asymmetry pair
crossed with both winding directions (4 cases, all asserting via
containment — i.e. "is the enclosed dot nested and the outside dot
still a root" — rather than exact side numbers, since which physical
face gets called side 1 is exactly the dart-numbering detail this fix
makes irrelevant); a non-convex L-shaped enclosure including a dot in
the removed notch; a loop drawn from a dot with a pre-existing edge.
214/214 tests passing (204 prior + 10 new).

**PR 10c — Corner resolution for dots with self-loop-created darts.**
✅ **COMPLETE.** While confirming PR 10b's fix with a full sequence
(draw the enclosing loop, then draw a REAL follow-up curve from the
enclosed dot back to the loop's owner), the follow-up move was
wrongly rejected with `DIFFERENT_REGIONS` — even though the enclosed
dot was correctly nested by PR 10b's fix.

**Root cause, confirmed by direct testing, not hand-reasoning:**
`resolveMoveCorners` (PR 9, otherwise untouched) picks the WRONG
corner at the loop owner for the follow-up curve. Built a clean repro
first: for a self-loop's two existing angles, the new curve's angle
unambiguously falls within the naive candidate's gap under any normal
reading, yet the topologically correct corner (verified against where
the enclosed occupant was actually nested) is the OTHER one — no
remapping of angle *values* can fix this, since the angle genuinely
belongs to the wrong gap's arithmetic. Separately confirmed (a genuine
triangle fixture — three real edges, two real faces, zero self-loops)
that angle-gap arithmetic IS correct for ordinary structures, so this
is a self-loop-specific blind spot, not a general PR 9 defect: a
self-loop's two "existing angle" values don't describe two independent
departure rays the way gap-membership assumes — they're the two cut
ends of one bent curve, and which side is which depends on the loop's
actual drawn shape, exactly the same class of problem PR 10b already
solved for placement.

**Fix:** `resolveMoveCorners`'s per-endpoint resolution now
geometrically verifies the naive angle-gap answer instead of trusting
it outright. For every corner candidate (not just self-loop-adjacent
ones — verification is cheap and runs uniformly whenever a choice is
even possible, degree ≥ 2, rather than special-casing "is this a
self-loop"), it reconstructs the candidate's real face polygon (same
`facePolygon`/`splitPathAtMidpoint` construction PR 10b built) and
tests the drawn curve's own next point against it. When exactly one
candidate contains the point, that decides it (confirmed unaffected
on the triangle fixture). When multiple candidates agree — the exact
self-loop degeneracy, where both "sides" reconstruct as the same
physical curve traced in opposite directions, so pointInPolygon's
even-odd test cannot tell them apart — a new `windingNumber` primitive
(regionGeometry.js) breaks the tie, compared against the *reference*
loop's own winding at that point, not a fixed sign convention. This
needed one implementation-time correction of its own: a first attempt
used "always pick positive winding," which passed for a clockwise-drawn
loop and was then found wrong for a counterclockwise one — caught by
testing the mirror case directly (the exact discipline PR 10b's own
review had just called out), not assumed correct after one success.

**Public API:** `js/regionGeometry.js` gains `windingNumber`. No
engine changes, no Move shape changes — this is purely a browser-layer
correction to how `resolveMoveCorners` picks among already-legal
corner candidates.

**Tests:** `tests/regionGeometry.test.js` (+3): opposite sign for the
same curve traced in both directions (the exact property the fix
relies on), zero for a genuinely external point, degenerate-input
safety. `tests/cornerGeometry.test.js` (+5): the mirror-pair follow-up
join (loop owner = dot 0 or dot 2, drawn CW or CCW — 4 cases, the
same matrix PR 10b's own asymmetry test uses, now extended one move
further to the actual follow-up join) all validate as legal; a
follow-up join to a self-loop's own sprout when the owner already had
a pre-existing edge (and is itself now fully exhausted, matching real
Sprouts rules) also validates. One pre-existing test fixture
(`isolatedDot3` in two PR 9-era tests) needed fixing: it faked
"extending the rotations array" via object-spread, producing a plain
object rather than a real Array — harmless for the old code (which
never iterated it structurally) but a hard crash once `traceFaces`
needed a genuine array; fixed by building a real array explicitly,
same discipline as PR 10a's fixture fixes. 222/222 tests passing (214
prior + 8 new).

**Residual, explicit:** verification is now geometry-dependent — a
missing stored path (e.g. an edge whose drawn curve wasn't captured)
falls back to the naive angle-gap answer rather than crashing, but in
that specific circumstance the self-loop blind spot this PR fixes
could theoretically reappear; not expected to arise in live browser
play, since `ui.js` always has every prior move's path available in
the same session. Cost is one extra `traceFaces`/polygon reconstruction
per corner resolution when degree ≥ 2 — trivial for a turn-based game
at Sprouts' scale, not benchmarked, not expected to matter.

## Historic open items carried

1. ~~**O-Q1 ruling**~~ — resolved (Jared): v1 Game Records dropped
   entirely, no migration path. See PR 8 / v0.9.4.
2. ~~**Version mapping**~~ — resolved (Jared, July 2026): see Phase 7
   above, folded into ROADMAP.md.
3. **Lives field removal** (dots as bare ids) — optional, revisit
   after PR 8 when I-6 has run for a while.
