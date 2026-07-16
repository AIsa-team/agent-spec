# @aisa-one/agent-spec

AgentSpec v1 — runtime-agnostic agent definitions:
schema validation, project loading, platform-neutral remote Git skill resolution
(ref → commit pinned), and runtime adapters (hermes today; claude-code / openclaw planned).

## Install

```bash
npm i @aisa-one/agent-spec
```

## Usage

```ts
import { loadAgentProject, resolveSkills, getAdapter } from "@aisa-one/agent-spec";

const project = await loadAgentProject("./my-agent");
const skills = await resolveSkills(project.manifest.skills.remote);
const result = await getAdapter("hermes").build({ project, resolvedSkills: skills }, "./out");
```

Remote skills are declared explicitly and resolved at build time:

```yaml
skills:
  inline:
    - finance/portfolio-report
  remote:
    - type: git
      url: https://github.com/example/shared-skills.git
      path: packages/skills/twitter-post
      name: twitter-post
      ref: v1.2.0
```

`name` defaults to the final segment of `path`; `type` defaults to `git`; and
`ref` defaults to `main`. The resolved commit is recorded in `agent.lock.json`.

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
| `skills.remote` | public HTTPS Git skills: explicit `url` + repository `path`, optional output `name`, and `ref` (default `main`); pinned to a commit in `agent.lock.json` |
| `cron` | path to the cron jobs YAML (optional) |
| `update` | `channel: latest\|pinned`, `auto: true\|false` — auto-update policy |
| `targets.hermes.config` | hermes-only config overrides, deep-merged onto the base profile config |

## Build output (hermes target)

A profile bundle with `{{VARS}}` preserved (rendered at install time):
`profile/` (SOUL, config, cron), `skills/`, assets, `agent.lock.json`, `.env.example`.

## Remote Git safety boundary

- Public `https://` repositories only; credentials, query strings, SSH, `file://`,
  and local paths are rejected.
- The selected directory must directly contain `SKILL.md`.
- Symlinks, submodules/gitlinks, and non-blob entries are rejected.
- Remote files are copied as bytes; no remote script or Git hook is executed.
- Default limits: 1,000 files, 5 MiB per file, 20 MiB total, 60-second Git timeout.
- GitHub, GitLab, and self-hosted Git use the same Git CLI resolver.

Spec: see `aisa_cio_agent/docs/superpowers/specs/2026-07-14-agent-spec-design.md`.
