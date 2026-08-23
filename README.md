# Personal Assistant Memory Routing

[![CI](https://github.com/Euraika-Labs/personal-assistant-memory-routing/actions/workflows/ci.yml/badge.svg)](https://github.com/Euraika-Labs/personal-assistant-memory-routing/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40euraika-labs%2Fpersonal-assistant-memory-routing)](https://www.npmjs.com/package/@euraika-labs/personal-assistant-memory-routing)
[![Node.js](https://img.shields.io/node/v/%40euraika-labs%2Fpersonal-assistant-memory-routing)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A portable Agent Skill and review-first installer that gives Claude Code and Codex concise response routing plus bounded, privacy-aware recall from multiple memory systems.

> **Release status:** npm and GitHub releases are produced from protected semantic-version tags after the full release checks pass.

## Why

Coding agents accumulate context in different places: Nowledge Mem, claude-mem, Claude Code's native `MEMORY.md`, project Markdown, or an MCP-backed service. PAMR provides one narrow recall layer without silently importing credentials, writing durable memory, or letting recalled text become instructions.

## Features

- Shared Agent Skill for Claude Code and Codex.
- Optional `SessionStart`, `UserPromptSubmit`, `PreToolUse`, and `Stop` hooks.
- Built-in read-only providers for Nowledge Mem, claude-mem, Claude native memory, and explicit Markdown paths.
- Adapter protocol for Mem0, Letta, Zep, OpenMemory, vector databases, and internal services.
- Duplicate-injection avoidance when claude-mem or Claude native memory is already loaded by the host.
- Bounded, provider-labelled, XML-escaped context marked as untrusted data.
- Fail-open recall and review-only candidate staging; no automatic durable writes.
- Idempotent install/uninstall with backups and ownership manifests.

## Quick start

```sh
npm install --global @euraika-labs/personal-assistant-memory-routing
pamr doctor
pamr install --host both --scope user --dry-run
pamr install --host both --scope user --hooks --yes
pamr status --host both --scope user
```

Installing the npm package alone has no lifecycle side effects. Host configuration changes only after an explicit `pamr install`; hook activation additionally requires `--hooks --yes`.

## Provider matrix

| Provider | Auto-detected | Read path | Duplicate handling | Writes |
|---|---:|---|---|---:|
| Nowledge Mem | Yes, via `nmem` | Semantic CLI recall | Combined with other providers | Never |
| claude-mem | Yes, local settings/worker | Loopback worker API | Skipped if native claude-mem integration is active for that host | Never |
| Claude native memory | Yes, matching `MEMORY.md` | Bounded file read | Skipped in Claude Code; available to Codex | Never |
| Markdown | Explicit paths only | `MEMORY.md`, `MEMORIES.md`, `CONTEXT.md` | Provider-labelled | Never |
| Mem0 / Letta / Zep / OpenMemory / custom | Explicit adapter | Executable protocol | Adapter-owned | Never by PAMR |
| Host MCP memory server | Host-managed | Native MCP tools | PAMR does not duplicate MCP calls | Host policy |

### claude-mem

PAMR detects `~/.claude-mem/settings.json`, validates the configured worker port, and talks only to `127.0.0.1`. It uses:

- `GET /api/search` for prompt recall;
- `GET /api/context/inject` for session-start context;
- `GET /api/health` for diagnostics.

If claude-mem's native Claude Code or Codex plugin is detected, PAMR does **not** inject the same context again. Override only for troubleshooting:

```sh
PAMR_FORCE_CLAUDE_MEM_RECALL=1 pamr doctor
```

The worker port is resolved from `PAMR_CLAUDE_MEM_PORT`, `CLAUDE_MEM_WORKER_PORT`, claude-mem settings, then its documented per-user fallback. Override project matching with `PAMR_CLAUDE_MEM_PROJECT`.

### Other systems

PAMR deliberately does not probe random ports, databases, cloud accounts, or credentials. Systems without a stable local read API use the [external adapter contract](docs/ADAPTERS.md). MCP memory servers stay host-managed because lifecycle command hooks cannot safely invoke arbitrary MCP tools.

## Hook behavior

| Event | Behavior |
|---|---|
| `SessionStart` | Loads bounded startup context from enabled providers. |
| `UserPromptSubmit` | Recalls prompt-relevant context from enabled providers. |
| `PreToolUse` | Blocks directly recognizable `nmem` shell writes unless explicitly allowed. |
| `Stop` | Optionally stages explicit `MEMORY_CANDIDATE:` lines in a local review queue. |

Candidate staging is disabled by default. Enable it with `PAMR_ENABLE_CANDIDATE_STAGING=1`; candidates go to `~/.local/share/personal-assistant-memory-routing/candidates.jsonl` and are never auto-committed to a provider.

## Configuration

```sh
PAMR_MEMORY_PROVIDERS=nowledge,claude-mem,claude-native,markdown,external-command
PAMR_MEMORY_PATHS="$HOME/my-memory/MEMORY.md:$PWD/context"
PAMR_MEMORY_COMMAND=/absolute/path/to/adapter
```

| Variable | Purpose |
|---|---|
| `PAMR_MEMORY_PROVIDERS` | Comma-separated provider allowlist. |
| `PAMR_NMEM_BIN` | Absolute `nmem` executable override. |
| `PAMR_CLAUDE_MEM_PORT` | Validated claude-mem loopback worker port. |
| `PAMR_CLAUDE_MEM_PROJECT` | Explicit claude-mem project name. |
| `PAMR_FORCE_CLAUDE_MEM_RECALL=1` | Bypass native-integration duplicate protection. |
| `PAMR_MEMORY_PATHS` | OS-delimited Markdown files/directories. |
| `PAMR_MEMORY_COMMAND` | Absolute custom adapter executable. |
| `PAMR_FORCE_CLAUDE_NATIVE_RECALL=1` | Inject Claude native memory into Claude too. |
| `PAMR_DISABLE_RECALL=1` | Disable all recall without removing hooks. |
| `PAMR_ALLOW_SENSITIVE_RECALL=1` | Allow common sensitive markers; off by default. |
| `PAMR_ENABLE_CANDIDATE_STAGING=1` | Enable local review queue. |
| `NMEM_ALLOW_MEMORY_WRITE=1` | Bypass the narrow shell write guard. |

## Installation scopes

| Host | User skill | User hook config |
|---|---|---|
| Claude Code | `~/.claude/skills/personal-assistant-memory-routing` | `~/.claude/settings.json` |
| Codex | `~/.codex/skills/personal-assistant-memory-routing` | `~/.codex/hooks.json` |

Project scope uses `.claude/` or `.codex/` under `--project`:

```sh
npx @euraika-labs/personal-assistant-memory-routing install \
  --host claude --scope project --project "$PWD" --hooks --yes
```

## Safety model

- Recall is read-only, bounded, fail-open, provider-labelled, and treated as untrusted data.
- Common secrets and sensitive markers are filtered, but no classifier is perfect.
- No `postinstall` script modifies the machine.
- The shell write guard is defense in depth, not a replacement for native permissions.
- Custom adapters are explicit executables and run with the agent's permissions.
- Existing configuration is backed up and unrelated settings are preserved.

Read [Security](SECURITY.md), [Architecture](docs/ARCHITECTURE.md), and [Provider details](docs/PROVIDERS.md) before enabling hooks.

## Development

```sh
git clone https://github.com/Euraika-Labs/personal-assistant-memory-routing.git
cd personal-assistant-memory-routing
npm ci
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for workflow and review expectations.

## Uninstall

```sh
pamr uninstall --host both --scope user --dry-run
pamr uninstall --host both --scope user --yes
```

Only exact owned hooks and marked skill files are removed. Backups remain beside modified host configuration.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Providers and duplicate handling](docs/PROVIDERS.md)
- [External adapter protocol](docs/ADAPTERS.md)
- [Memory policy](skill/personal-assistant-memory-routing/references/MEMORY_POLICY.md)
- [Install and rollback](skill/personal-assistant-memory-routing/references/INSTALL.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Release process](docs/RELEASING.md)

## License

MIT © 2026 [Euraika Labs](https://www.euraika.net)
