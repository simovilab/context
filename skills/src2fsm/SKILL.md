---
name: src2fsm
description: "Use this skill whenever the user wants to compare the current Databús codebase against a state machine JSON (the FSMs in context/behavior/databus/system/json/) and surface drift between them. Complementary to /fsm2ref. Handles the realistic case where the FSM may be stale AND the code may be incomplete simultaneously, with per-item triage and persistent acknowledgement of intentional drift. Reports drift in chat and as a durable markdown file. Never mutates code; only proposes FSM patches and records drift after explicit user confirmation."
---

# Process Spec: Source ↔ FSM Drift Analysis

## Purpose

Given an XState state machine definition (the project's source of truth for *intent*) and the current code (the source of truth for *reality*), surface the drift between them and triage each divergence into one of three verdicts:

1. **FSM stale** — the FSM should be updated to reflect the code.
2. **Code incomplete** — the code should grow a TODO; FSM stays as-is.
3. **Intentional drift / out of scope** — record the divergence so it stops surfacing on subsequent runs.

This skill is the inverse of `/fsm2ref`. `/fsm2ref` treats the FSM as ground truth and produces a reference doc. `/src2fsm` treats neither side as authoritative and asks per-item which side wins.

## Inputs

The user provides:

1. **An FSM identifier** — the kebab-case process name matching a JSON file in the FSM directory (e.g., `register-run`). May also be `--all` to iterate over every FSM.
2. **The current working tree** — the skill reads code directly. Branch-scoped to `git diff main...HEAD` by default.
3. *(Optional)* **A sidecar map file** at `<fsm-dir>/meta/<fsm-id>.map.json` — manual symbol mappings for cases grep can't reach.
4. *(Optional, auto-managed)* **A drift acknowledgement file** at `<fsm-dir>/meta/<fsm-id>.drift.json` — items previously triaged as intentional drift.

## First-run configuration

On first invocation in a project, prompt for the FSM directory path, suggesting a default of:

```
~/Desktop/SIMOVI/git.no_sync/context/behavior/databus/system/json/
```

Persist the chosen path to `<fsm-dir>/meta/.src2fsm.config.json`:

```json
{
  "fsm_dir": "<absolute-path>",
  "reports_dir": "<sibling-of-fsm-dir>/reports",
  "main_branch": "main"
}
```

Subsequent runs read this file silently and do not re-prompt unless it is missing or malformed.

## Workflow

### Step 1: Resolve scope

1. Load `meta/.src2fsm.config.json` (prompt and create on first run).
2. Resolve which FSM(s) to process:
   - Single FSM: load `<fsm-dir>/<fsm-id>.json`.
   - `--all`: load every `*.json` in `<fsm-dir>` (excluding `meta/`).
3. Compute the candidate code surface:
   - Default: `git diff --name-only main...HEAD` (branch-scoped).
   - `--full`: full working tree (use sparingly; slower and noisier).
4. Filter out non-code files: `*.md`, `*.lock`, `*.toml`, `*.json` (except FSM/map/drift), `*.sql`, `*.yml`, `fixtures/`, `migrations/`, `static/`, `staticfiles/`, `__pycache__/`, `.venv/`, `node_modules/`, dotfiles.

### Step 2: Build the symbol index

For each FSM in scope:

1. Extract every **event** from `states.*.on` keys and from `actions[].type` references.
2. Extract every **entry/exit/transition action** from `entry`, `exit`, and transition `actions` arrays.
3. Strip the `<service>.` namespace prefix to produce the bare symbol (since code typically omits it — see Step 4 for the namespace check).
4. Build a reverse index `bare_symbol → fsm_id` (a symbol may map to multiple FSMs; keep them all).

### Step 3: Locate code references

1. For each bare symbol, run `git grep -n` against the candidate file set.
2. For each hit, record `{file, line, symbol, fsm_id, role: "emitted" | "called" | "mentioned" | "defined"}`.
   - `defined` if the line is a function definition (`def <symbol>(`, `function <symbol>(`, `<symbol> :=`, etc.) — this is the strongest possible binding.
   - `emitted` if the line matches `publish_event(...)` or equivalent → maps to an FSM event.
   - `called` if the line is a function invocation matching an action name (e.g. `<symbol>(...)`, `<symbol>.delay(...)`).
   - `mentioned` otherwise (string literals, comments, tests).
3. Augment with `meta/<fsm-id>.map.json` entries — these explicitly bind FSM symbols to code locations that grep can't find (e.g. an FSM action `validate_payload` implemented as `validate_run_request_data`).
4. Classify event-emitting call sites as either **action-published** or **orchestrator-published**:
   - **Action-published**: emitted from inside a function whose name matches an FSM action (or its sidecar mapping). These events are the action's outcome and represent real FSM transitions.
   - **Orchestrator-published**: emitted from a handler/dispatcher function (e.g. `process_*`, `handle_*`, view functions, API entry points) that is *not* itself an FSM action. These events are usually summary signals the handler emits after waiting for an action to complete — they often duplicate the last action-published event and represent noise rather than real state transitions.
   The classification is a heuristic; record it on the hit and use it during diff computation (Step 4) and triage (Step 6).

### Step 3.5: Pre-triage validation — every FSM action must bind to a real function

**This step runs before the diff computation and is the single most important guard against invented FSM symbols leaking through triage.**

For each FSM action symbol (entry, exit, or transition):

1. Check whether the bare action name has a `defined` hit anywhere in the candidate file set, or a sidecar `map.json` entry pointing to a real function.
2. Tag the action as one of:
   - **bound** — there is a real function with this name (or mapped name) in the codebase.
   - **aspirational** — no function with this name exists; the FSM author chose a label that describes intent but has no code anchor (e.g. `dispatch_register_run_task`, `request_operator_confirmation`, `check_vehicle_availability`).
   - **stub-bound** — a function exists but its body is `pass` / `return True` / commented-out logic / `# TODO` only.
3. Aspirational actions are pre-tagged with the **default verdict `fsm-stale-rename-or-delete`**, not `code-incomplete`. The triage prompt for these items must lead with: *"This FSM action name does not appear as a function in the codebase. Either rename the FSM action to match a real function, or delete it if no function exists or is planned."*
4. The user can still override this default and re-tag as `code-incomplete` (meaning: keep the FSM name and add a TODO to write the function), but the default stops the skill from inventing replacement names like `dispatch_register_run_task` mid-triage.

**Never invent a replacement function name during triage.** When proposing a rename, the new name must already appear as a `defined` hit in the code, or the user must supply it explicitly. If neither, the only remaining options are "delete the action" or "user names a function to create."

### Step 4: Compute the diff

For each FSM, compare the FSM definition to the code evidence:

| Diff category | Detection |
|---|---|
| **Missing state** | A state declared in FSM has zero code references for any of its entry/exit actions or any of its transitions' triggering events. |
| **Aspirational action (invented FSM name)** | An FSM action has no `defined` hit and no sidecar mapping. Pre-tagged in Step 3.5. Default verdict: `fsm-stale-rename-or-delete`, *not* `code-incomplete`. |
| **Missing action body** | An action name binds to a real function (`defined` hit or sidecar map) but the function is never `called` from a relevant code path. Surface for confirmation — usually means the FSM action is dead or the call site moved. |
| **Stub action** | The action's function body is `pass`, `return True`, `# TODO`, or trivially short relative to its FSM-implied responsibility. Default verdict: `code-incomplete`. |
| **Undeclared event** | `publish_event("X", ...)` exists in code but `X` is not in any FSM's transition keys. **Distinguish action-published vs orchestrator-published** (see Step 3, item 4) — orchestrator-published events that immediately follow an action-published outcome are usually noise, not real transitions; default verdict for those is `code-noise-not-fsm-event`, not `fsm-stale-add-event`. |
| **Orchestrator-published summary event** | An event published from a handler function (`process_*`, etc.) that duplicates the outcome of an action-published event already emitted moments earlier. Default verdict: code-noise; do *not* propose adding to FSM unless the user confirms the summary event has independent semantics. |
| **Renamed event** | An event is published from the call site that handles a particular state's responsibility, but its name doesn't match the FSM's expected event for that transition. Heuristic: same call-site context, similar but distinct symbol. |
| **Namespace mismatch** | FSM event is `<service>.EVENT` but code publishes bare `EVENT`. Flag once per publisher seam, not once per event. |
| **Conceptual mismatch** | Active vs. passive state — e.g. an action like `request_operator_confirmation` declared in FSM but the code path is operator-initiated via API. Detection is heuristic; the skill should flag any FSM action whose name suggests an outbound call (`request_*`, `send_*`, `notify_*`) that has no outbound code (`publish_event`, HTTP client, message broker call) at its expected site. |
| **Out-of-scope code** | Code in the candidate set publishes events or calls actions that belong to a *different* FSM. Surface as informational, not as drift. |

### Step 5: Filter against acknowledged drift

Load `<fsm-dir>/meta/<fsm-id>.drift.json` if present. Each entry has shape:

```json
{
  "item_key": "<fsm-id>::<category>::<symbol-or-state>",
  "verdict": "fsm-stale" | "code-incomplete" | "intentional",
  "note": "<short rationale>",
  "acknowledged_at": "<ISO-8601 timestamp>",
  "acknowledged_commit": "<git SHA at time of ack>"
}
```

Silently filter out diff items whose `item_key` is already in the file with verdict `intentional`. For `fsm-stale` and `code-incomplete` entries, only filter if the FSM and code state at the acknowledged commit still match the current state for that item — otherwise re-surface (the situation has changed).

### Step 6: Triage with the user

Present the remaining diff items, grouped by category. For each item, propose a verdict and ask for confirmation:

- **FSM stale** → show the proposed JSON patch (a unified diff against `<fsm-id>.json`).
- **Code incomplete** → show a *description* of the suggested change: file path, location, suggested TODO comment text. Do NOT apply.
- **Intentional drift** → show the entry that will be appended to `<fsm-id>.drift.json`.

The user may accept, modify, reject, or change the verdict per item. Nothing is written until the user confirms the full set.

**Mandatory presentation rules (to prevent invented-name and orchestrator-noise drift):**

1. **Every aspirational action** (from Step 3.5) must be presented with the exact label *"This FSM action name does not appear as a function in the codebase."* The verdict prompt must offer **delete**, **rename to a real function** (only if the user supplies the name or it appears as a `defined` hit), or — explicitly — **keep as code-incomplete TODO** as a third choice. The skill must not propose a fabricated replacement name.

2. **Every orchestrator-published event** (from Step 3, item 4) must be flagged with *"This event is published by a handler function `<name>`, not by an FSM action. It may be summary noise rather than a real transition."* Do not list it as an `Undeclared event → FSM stale add` candidate by default.

3. **Bulk-accept guard.** When the user requests bulk acceptance ("accept all", "F.", etc.), the skill must list each item's *one-line summary* a final time before applying — including the action's bound/aspirational/stub-bound tag and, for events, the action-published/orchestrator-published tag. This forces a last-look at the things most often skimmed.

### Step 7: `--all` aggregation

When operating across multiple FSMs:

1. Compute per-FSM diffs as above.
2. Group findings by **shared file** before triage. Issues affecting `messages/publisher.py`, `operations/models.py`, `api/views.py`, etc., are deduplicated and listed once with the set of FSMs they affect.
3. Present shared-issue triage first, then per-FSM sections.
4. Drift acknowledgements still write to per-FSM drift files — a shared issue acknowledged once writes one entry per affected FSM.

### Step 8: Apply approved changes

After user confirmation, write only:

1. Patches to FSM JSON files (`<fsm-dir>/<fsm-id>.json`).
2. New entries appended to `<fsm-dir>/meta/<fsm-id>.drift.json`.
3. The markdown report (see Step 9).

**Never** modify code files. Code-incomplete items are described in the report only.

### Step 9: Deliver

Produce two outputs with identical content:

1. **Chat summary** — concise, grouped by verdict, with file paths and line numbers using the `path:line` convention.
2. **Markdown report** at `<reports-dir>/<fsm-id>-drift-<YYYY-MM-DD>.md` (or `all-drift-<YYYY-MM-DD>.md` for `--all`). Sections:

```markdown
# <fsm-id> drift report — <date>

**Branch**: <current-branch>
**Compared against**: main @ <SHA>
**FSM file**: <path>

## Summary

- N items: M FSM-stale, K code-incomplete, J intentional, I out-of-scope

## FSM updates applied

<list of JSON patches written>

## Code TODOs (not applied — user to place)

<list of suggested code changes with file:line and TODO text>

## Acknowledged drift (recorded)

<list of entries written to drift.json>

## Out-of-scope code references

<events/actions found in scope-candidate code that belong to other FSMs>
```

## Naming conventions (mirrors /fsm2ref)

| Layer | Case | Pattern | Example |
|---|---|---|---|
| Services (actors) | `snake_case` | `<service>` | `realtime_engine` |
| Processes (machines) | `kebab-case` | `<process>` | `register-run` |
| States | `snake_case` | `<state>` | `waiting` |
| Events | `SCREAMING_SNAKE_CASE` | `<service>.<EVENT>` | `backend.RUN_SUBMISSION_REQUESTED` |
| Actions | `snake_case` | `<service>.<action>` | `realtime_engine.write_run_metadata` |

When proposing FSM patches, preserve fully-qualified names. When matching against code, strip the `<service>.` prefix for symbol search but flag the prefix omission as a separate diff item if consistently missing.

## Sidecar file shapes

### `meta/<fsm-id>.map.json`

```json
{
  "actions": {
    "backend.validate_payload": [
      "backend/feed/utils.py::validate_run_request_data"
    ]
  },
  "events": {
    "backend.RUN_SUBMISSION_REQUESTED": [
      "backend/feed/realtime/runs.py:8"
    ]
  }
}
```

### `meta/<fsm-id>.drift.json`

```json
{
  "fsm_id": "register-run",
  "entries": [
    {
      "item_key": "register-run::missing-action::request_operator_confirmation",
      "verdict": "intentional",
      "note": "Operator-initiated via API POST; backend does not push.",
      "acknowledged_at": "2026-04-28T19:00:00Z",
      "acknowledged_commit": "1132297"
    }
  ]
}
```

## Deliberate non-goals

- **Not a code generator.** The skill describes code changes; the user places them.
- **Not a one-way sync.** The user picks direction per item.
- **Not silent.** Always confirms before mutating any artifact.
- **Not full-tree by default.** Branch-scoped via `git diff main...HEAD`.
- **Not a replacement for `/fsm2ref`.** The two are paired: `/src2fsm` keeps the FSM honest about reality; `/fsm2ref` keeps the reference doc honest about the FSM.

## Checklist (verify before delivering)

- [ ] FSM directory resolved (from config or first-run prompt)
- [ ] Candidate file set is branch-scoped unless `--full`
- [ ] All FSM events and actions searched in code
- [ ] Sidecar `map.json` consulted if present
- [ ] **Every FSM action tagged bound / aspirational / stub-bound (Step 3.5)**
- [ ] **No fabricated function names appear in any proposed FSM patch — every `type:` value either appears as a `defined` hit in code, was supplied by the user, or is being deleted**
- [ ] **Every event publisher classified as action-published or orchestrator-published; orchestrator-only summary events flagged as code-noise by default**
- [ ] Acknowledged-drift entries filtered out
- [ ] Each remaining item has a proposed verdict
- [ ] User confirmed every applied change (including the bulk-accept last-look summary if applicable)
- [ ] No code files were modified
- [ ] FSM patches written only to `<fsm-id>.json`
- [ ] Drift acknowledgements written to `<fsm-id>.drift.json`
- [ ] Markdown report written to `<reports-dir>/`
- [ ] Chat summary mirrors the report
