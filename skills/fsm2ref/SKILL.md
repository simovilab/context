---
name: fsm2ref
description: "Use this skill whenever the user provides an XState state machine (JSON or JS) together with a previous process reference spec (.md), and wants the machine refactored to match Databús naming conventions and the reference spec updated to match the new machine. This skill applies to any process defined in the Databús system."
---

# Process Spec: XState Machine Refactoring & Reference Sync

## Purpose

Given an XState state machine definition and a previous process reference spec, produce two synchronized outputs:

1. **Updated XState machine** (`.json`) — renamed to match naming conventions, actions and events fully qualified
2. **Updated reference spec** (`.md`) — rewritten to match the new machine topology exactly

## Inputs

The user provides:

1. **XState machine code** — JSON or JS, any XState version (v4 or v5). May be pasted inline or uploaded as a file.
2. **Previous reference spec** — a markdown document describing the process (states, events, actions, context). May be uploaded or available in the project skill files.

## Workflow

### Step 1: Naming Conventions

| Layer | Case | Pattern | Example |
|---|---|---|---|
| Services (actors) | `snake_case` | `<service>` | `realtime_engine` |
| Processes (machines) | `kebab-case` | `<process>` | `end-run` |
| States | `snake_case` | `<state>` | `waiting` |
| Events | `SCREAMING_SNAKE_CASE` | `<service>.<EVENT>` | `backend.END_RUN_REQUESTED` |
| Messages (AMQP) | `camelCase` | `<messageName>` | `runSubmissionRequest` |
| Actions | `snake_case` | `<service>.<action>` | `realtime_engine.write_trace_data` |

The `databus.` prefix on all names is **optional** and should be **omitted** unless the user explicitly requests it — it adds clutter without information in most contexts.

### Step 2: Analyze the current machine

Read the XState code and identify:

- **Machine id** — if not already, rename to kebab-case process name (e.g., `end_run_with_actions` → `end-run`)
- **States** — keep as snake_case (usually already compliant)
- **Events** — rename to `<service>.<EVENT>` pattern in SCREAMING_SNAKE_CASE
- **Actions** — rename to `<service>.<action>` pattern in snake_case
- **Context** — preserve the shape, add `error` field if error paths exist but context doesn't track errors
- **New states/events** — if the machine has states or events the old spec doesn't, these are intentional additions; document them

Note which states are new vs. carried over from the previous spec. The machine code is the source of truth for topology; the old spec is the source of truth for prose descriptions of what each state/action does.

### Step 3: Analyze the previous spec

Read the reference spec and extract:

- State descriptions (what each state is responsible for)
- Event meanings
- Action descriptions (what each action does, which service owns it)
- Context field
- Notes and architectural constraints

This content will be carried forward into the updated spec, adjusted for any topology changes.

### Step 4: Naming constraints

Apply these rules:

- **Machine `id`** — use plain kebab-case (e.g., `register-run`)
- **State keys** — snake_case, one or two words (e.g., `waiting`, `confirming`)
- **Event type strings** — `<service>.<EVENT>` in SCREAMING_SNAKE_CASE (e.g., `backend.RUN_SUBMISSION_REQUESTED`)
- **Action reference strings** — `<service>.<action>` in snake_case (e.g., `realtime_engine.write_run_metadata`)

### Step 5: Produce the updated machine JSON

Write a plain `.json` file using the XState machine object format:

```json
{
  "id": "<process-name>",
  "initial": "<initial-state>",
  "context": {},
  "states": {
    "<state>": {
      "entry": ["<service>.<action>"],
      "on": {
        "<service>.<EVENT>": {
          "target": "<next-state>",
          "actions": ["<service>.<action>"]
        }
      }
    }
  }
}
```

**Rules for the machine JSON:**

- **Include action references** on `entry`, `exit`, and transition `actions` arrays — these are part of the topology
- **Do NOT include action function implementations** — the JSON is a reference spec; implementations live in the service codebases
- **Do NOT include invoked actors or guard implementations** — these are implementation concerns
- Action names are fully qualified: `<service>.<action_name>` in snake_case
- Event types are fully qualified: `<service>.<EVENT_NAME>` in SCREAMING_SNAKE_CASE
- State keys are plain snake_case

### Step 6: Produce the updated reference spec

Write a markdown `.md` file with these sections in order:

```markdown
# <number>. `<process-name>`

**Process**: `<process-name>`
**Purpose**: <one-line description>

**Actors**: <comma-separated list of services involved>

**States & transitions**: <ASCII diagram showing all states and events>

**Events**: <table: Event | Emitter | Meaning>

**Context**: <comma-separated list of context fields with types>

**Actions reference**: <table: Action | Service | Description>

**Responsibilities per state**: <table: State | Owner | What happens here>

**Notes**: <bullet list of architectural notes>

**Key changes from previous spec**: <numbered list of deltas>
```

**Rules for the spec:**

- The **States & transitions** ASCII block must be an exact 1:1 match with the machine JSON — every state, every event, every target
- The **Events table** must list every event type that appears in the machine JSON, no more, no less
- The **Actions reference** table must list every unique action string from the machine with its owning service and a prose description. Carry descriptions from the old spec where the action existed; write new descriptions for new actions
- The **Responsibilities per state** table describes what each state is responsible for at a high level
- The **Key changes** section explicitly lists what changed from the previous spec so reviewers can see the delta at a glance
- Add a note that the `databus.` namespace prefix is omitted for readability and can be prepended per the README naming conventions

### Step 7: Deliver

1. Save the updated `.json` to the appropriate path in `json/` (use kebab-case filename, e.g., `json/register-run.json`)
2. Save the updated `.md` to the appropriate path in `docs/` (match the existing filename convention)
3. Give a concise summary of the key changes (don't repeat the full spec — the user can read the file)

## Checklist (verify before delivering)

- [ ] Machine `id` is kebab-case
- [ ] State keys are snake_case
- [ ] Event types follow `<service>.<EVENT>` SCREAMING_SNAKE_CASE
- [ ] Action references follow `<service>.<action>` snake_case
- [ ] No `databus.` prefix anywhere (unless user explicitly requested it)
- [ ] No action function implementations in the JSON
- [ ] Every state in the JSON appears in the spec's States & transitions block
- [ ] Every event in the JSON appears in the spec's Events table
- [ ] Every action reference in the JSON appears in the spec's Actions reference table
- [ ] Key changes from previous spec are listed
