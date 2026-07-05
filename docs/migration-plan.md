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

Suggested version mapping: PR 1–6 = v0.9.2 (landed as six reviewable
sub-steps, version bumped once at PR 6); PR 7 = v0.9.3; PR 8 = v0.9.4.
Mapping is Jared's call; the sequence is not.

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

**PR 3 — tracer + oracle (Stage B).** Objective: faces/components/
derived-view from (edges, σ); discharge P-O1 and P-O3. Files:
`js/engine/faces.js` (new), union-find extracted from `regions.js`,
`tests/engine/faces.test.js` (new; includes the splice-formula
oracle property tests). Tests: orbit tracing determinism (§10.3),
per-component Euler, oracle agreement for normal/merge/split/loop
insertions. Invariants after: P-O1/P-O3 recorded as discharged in the
spec (§2.4 convention filled in); no production caller yet.

**PR 4 — Move v2 + resolution (Stage C begins).** Objective: Moves
carry real corners + placement; the browser resolves them. Files:
`move.js`, `js/cornerResolution.js` (new), `ui.js` (commitMove +
self-loop shortcut), `reducer.js` (insert at carried corner when
present), tests for resolution geometry and corner insertion.
Tests: resolution unit tests (pure, Node); degree-2 disambiguation;
placement point-in-region cases. Invariants after: drawn games
produce σ matching drawn geometry; legacy default remains for
cornerless moves (replay of v1 records).

**PR 5 — containment + invariants v2.** Objective: anchors on state,
reconcile-always in the reducer, `checkInvariants` implementing
I-1…I-7 (new codes, old checker untouched); discharge P-O2 and P-O4.
Files: `regions.js` (seeding + new checker alongside old),
`reducer.js`, `tests/engine/regions.test.js` additions, small-n
bisimulation test. Tests: I-1…I-7 after every reducer step; merge
re-anchoring; split transcription of π; exhaustive 1–3-dot
bisimulation (P-O2). Invariants after: both topologies coexist; the
old checker still guards the legacy arrays; all green.

**PR 6 — cutover (Stage D; version → v0.9.2).** Objective: queries
re-target the derived view; stored arrays, counters,
`DOT_BOUNDARY_COUNT_WRONG`, and the old checker deleted; F1's
null-for-sprouts bug ceases to exist. Files: `regions.js` (bodies),
`gameRecord.js`/`ui.js` (seeding shape), `regions.test.js` (fixtures
rebuilt from scripted moves — the one PR with heavy test churn,
accepted because the *contracts* under test are unchanged). Tests:
all five queries against multi-region positions produced by real
moves; `getRegionForDot(sprout)` now real. Invariants after: spec
§4's MUST-NOT-store list is satisfied; grep confirms no orphaned
references to removed fields.

**PR 7 — region-aware legality (v0.9.3).** Objective: `validateMove`
gains `DIFFERENT_REGIONS` + π-domain exactness (I-8); UI message map
entry. Files: `rules.js`, `ui.js`, `rules.test.js`. Tests: same-region
acceptance, cross-region rejection, π-domain violations. Invariants
after: the engine enforces what only geometry enforced before.

**PR 8 — Game Record formatVersion 2 (v0.9.4; gated on O-Q1).**
Objective: serialize corners + placement per spec §7.5; apply the
O-Q1 ruling to v1 imports; retire `regionId` from Move; discharge
P-O5 (round-trip under replay). Files: `gameRecord.js`, `move.js`,
`gameRecordUI.js` (message for rejected-version case if O-Q1 says
reject), tests. Invariants after: v2 round-trips exactly; v1
behaviour matches the ruling; `regionId` gone via stale-reference
sweep.

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
  PR 7 (legality)   PR 8 (record v2) ◄── GATE: O-Q1 ruling
                    needs 4 + 6; independent of 7 (7-first is
                    a product choice); discharges P-O5
```

Critical path: 1→2→3→4→5→6 (PRs 7 and 8 fork after 6). Only
external gate: the O-Q1 ruling, needed before PR 8 — five PRs of
schedule slack. Only useful parallelization: PR 3 alongside PR 2
once the σ representation is written down; with one implementer,
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

**R2 — Handedness/orientation mismatch (conceptual).** A consistent
but mirror-imaged σ convention would pass many tests while breaking
oracle agreement. *Mitigate:* P-O3 is discharged in PR 3, before any
production caller exists; the convention is recorded in the spec
once, and the oracle tests pin it forever after.

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

## Open items carried

1. **O-Q1 ruling** (default-corner vs. reject for v1 imports) —
   tech lead, needed before PR 8.
2. **Version mapping** of PRs to v0.9.2/…/v0.9.4 — Jared's call.
3. **Lives field removal** (dots as bare ids) — optional, revisit
   after PR 8 when I-6 has run for a while.
