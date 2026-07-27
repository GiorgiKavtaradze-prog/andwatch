Roadmap structure `/roadmap` writes to — the reference shapes read while writing the roadmap and the completion report. All rules and guidance live in `SKILL.md`.

## What keeps it readable (the format rules)

- **Two parts:** a slim **At a glance** table for a quick scan, then **the plan** as clean feature sections grouped by phase. Build order is just the section order — there is no separate "build order" list to keep in sync.
- **Clean headings.** A heading is `### <N>. <Feature name>` plus a short status word and short tags **only when they carry real information** (`needs a decision`, a per-feature approach override, `full` weight). Never a pipe-delimited metadata row like `Title | P0 | inherit | …`.
- **Each fact appears once.** Intent, the definition of done, tasks, and pointers live in the section; the At-a-glance table is the quick index. Status is shown in the table and beside the heading, and nowhere else.
- **Only what is set.** No `n/a`, no `inherit`, no empty fields. A pointer line (`ADR <n> · code in <path>`) appears under a feature **only once those exist** (`/develop` fills it).
- **Each feature is short:** a one- or two-line **intent**, a single **Done when:** line (the acceptance-criteria seeds `/architect` will grow into the ADR contract), then the **tasks as checkboxes**. The next step is always the first unticked box. A coarse (not-yet-designed) feature has one box: run `/architect` (when it `needs a decision`), or `/develop` directly, or `/audit` for the standards & tooling feature.

## Single-file roadmap

```markdown
# Roadmap — <Product name>

<One or two plain sentences: what the product is and who it serves.>

**Build approach:** <Tracer Bullet | Skateboard | Facade | Journey> — <one-line principle>.
**Weight profile:** <e.g. mostly lean and medium; billing is full (payments)>.  <!-- omit line if all default -->

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | in-progress |
| 2 | Coding standards & tooling | Foundation | planned |
| 3 | Data model | Foundation | planned |
| 4 | Design system & UI foundation | Foundation | planned |
| 5 | Core standup loop | Slice 1 | planned |
| 6 | Daily reminders | Slice 2 | planned |
| … | … | … | … |

## Foundations

### 1. Stack & architecture · in-progress
Decide the stack and scaffold a runnable project so every later slice builds on real structure.
**Done when:** the stack is recorded in an ADR and the empty scaffold boots locally and passes build.
- [x] Decide the stack (ADR): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [ ] Smoke-check it runs: `/test`
ADR 0001 · code in `./`

### 2. Coding standards & tooling
Capture conventions, then install lint, format, and pre-commit enforcement from the real scaffolded project.
**Done when:** root `AGENTS.md` reflects the real stack, and lint/format/pre-commit run clean.
- [ ] Capture conventions + tooling choices: `/audit`
- [ ] Install the tooling: `/develop tooling`
- [ ] Check it runs clean: `/test`

### 3. Data model · needs a decision
Core entities every feature builds on: users, teams, memberships, standup entries, template.
**Done when:** entities and relationships support later slices (reminders, templates, history) without a breaking migration.
- [ ] Design it (ADR): `/architect data model`

### 4. Design system & UI foundation · needs a decision
Visual language, layout primitives, and base components so the flows feel cohesive and accessible.
**Done when:** `design.md` covers type/color/spacing/components, and base components handle focus and keyboard.
- [ ] Design it (ADR): `/architect design system & UI foundation`

## Slice 1 — Core standup loop

### 5. Core standup loop · needs a decision
Sign in, create a team, submit today's update on the default template, read the team feed. Nothing else yet. This slice is the walking skeleton.
**Done when:** a user can sign in, create a team, submit one standup a day, and see the team's updates for today.
- [ ] Design it (ADR): `/architect core standup loop`

## Slice 2 — Daily reminders

### 6. Daily reminders · needs a decision
Nudge members who have not submitted before a team cutoff, so daily standup becomes a habit.
**Done when:** unsubmitted members get a timezone-aware reminder before cutoff, and submitters are not nagged.
- [ ] Design it (ADR): `/architect daily reminders`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Email invites** — invite teammates by email · needs a decision
- **Billing & plans** — free and paid tiers · needs a decision · full weight
- **Chat integrations** — post standups to team chat · needs a decision
- **Product analytics** — measure signups and habit · needs a decision

## Legend
- **Next step** = the first unticked box in a feature.
- **needs a decision** = run `/architect` first (it writes the ADR and fills that feature's build tasks); otherwise the feature goes straight to `/develop` (or `/audit` for standards & tooling).
- **Status** (in the At-a-glance table and beside the heading): `planned` → `in-progress` → `done`. Plus `existing` (built before this workflow) and `dropped` (de-scoped, kept for history). `planned` may be left off a heading; the table always carries it.
- **Approach tag** beside a heading (e.g. `· Facade`) = a per-feature override of the project default; no tag = inherits the default.
- **Weight tag** `· full` = design review + `/harden` required; `lean`/`medium` are the norm and get no tag.
- **Pointer line** (`ADR <n> · code in <path>`) sits directly under a feature, added by `/develop` once the ADR and code exist.
```

## Brownfield enrollment

Already-built features are enrolled **for context**, above the planned ones, with status `existing` (complete, no task list) or `in-progress` (partial, finish via `/develop`), each with a code pointer. They also appear in the At-a-glance table.

```markdown
### A. Auth · existing
Pre-workflow auth: sign in, sessions, reset. code in `src/auth/`

### B. Product catalog · in-progress
Partial catalog; finish the remaining pieces via /develop. code in `src/catalog/`
```

`existing` is not `done` — it predates the workflow, so `/develop` and `/sync` leave it alone.

## Large product — epic-split

When one file outgrows a comfortable scan (roughly a dozen-plus features across clearly distinct areas), split by epic: a `docs/roadmap/index.md` (the At-a-glance table across all epics + a one-line status rollup per epic) plus one file per epic (`docs/roadmap/<epic>.md`) holding that epic's feature sections. Promote **on demand**; don't pre-split a small product. In a monorepo, each workspace gets its own `docs/roadmap/<workspace>/` the same way.

## Completion report block

```
## /roadmap complete

**Product**: <one line>
**Behavior**: <plan | replan | add (inferred from the situation, not a typed subcommand)>
**Build approach**: <name (one-line principle)> · **Per-feature overrides**: <feature → approach, … (or "none, all inherit")>
**Weight profile**: <e.g. billing full (payments), everything else lean/medium (or "all default")>
**Roadmap file**: <docs/roadmap/roadmap.md> (<created new | updated in place | new epic file for <area>>)
**Scope (this pass)**: <N> new features to build, <M> already on the roadmap, <K> deferred
**Build order**: <feature 1> → <feature 2> → …
**First step**: <the first unticked box, usually `/architect <first feature>`, or `/audit` first if a brownfield repo has no root AGENTS.md>
```
