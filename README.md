# @aisa-one/agent-spec

AgentSpec v1 — runtime-agnostic agent definitions for AIsa agents:
schema validation, project loading, AIsa skill resolution (ref → SHA pinned),
and runtime adapters (hermes today; claude-code / openclaw planned).

## Install

```bash
npm i @aisa-one/agent-spec
```

## Usage

```ts
import { loadAgentProject, resolveSkills, getAdapter } from "@aisa-one/agent-spec";

const project = await loadAgentProject("./my-agent");
const skills = await resolveSkills(project.manifest.skills.aisa);
const result = await getAdapter("hermes").build({ project, resolvedSkills: skills }, "./out");
```

## Agent source project layout

```
my-agent/                      # one agent definition (its own git repo)
├── agent.yaml                 # manifest — see field table below
├── soul/                      # persona prompt, markdown ({{VARS}} allowed)
│   └── SOUL.md
├── skills/                    # inline skills (SKILL.md + scripts)
│   └── finance/portfolio-report/…
├── cron/
│   └── jobs.yaml              # runtime-agnostic scheduled tasks
└── assets/                    # extra code/data copied into the build as-is
```

## agent.yaml fields

| Field | Meaning |
|---|---|
| `spec` | always `agentspec/v1` |
| `id` | globally unique slug; also the E2B sandbox `AGENT_SPEC_ID` |
| `name` | human-readable display name |
| `version` | artifact release version (semver) |
| `description` | one-line description |
| `language` | display language (default `en`) |
| `models` | `default` / optional `fast` model + `provider` (default `aisa`); env can override at install time via `MODEL_DEFAULT` / `MODEL_PROVIDER` |
| `env` | `required` / `optional` env var declarations (`name`, `description`, optional `degrade`); never contains secrets |
| `skills.inline` | skills shipped inside this repo under `skills/` |
| `skills.aisa` | references into AIsa skill repos: `repo` (default `AIsa-team/agent-skills`) + `skill` + `ref` (default `main`), pinned to a commit SHA at build time in `agent.lock.json` |
| `cron` | path to the cron jobs YAML (optional) |
| `update` | `channel: latest\|pinned`, `auto: true\|false` — auto-update policy |
| `targets.hermes.config` | hermes-only config overrides, deep-merged onto the base profile config |

## Build output (hermes target)

A profile bundle with `{{VARS}}` preserved (rendered at install time):
`profile/` (SOUL, config, cron), `skills/`, assets, `agent.lock.json`, `.env.example`.

Spec: see `aisa_cio_agent/docs/superpowers/specs/2026-07-14-agent-spec-design.md`.
