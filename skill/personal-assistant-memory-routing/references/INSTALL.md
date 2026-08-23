# Review, install, test, and rollback

The npm package has no installation lifecycle scripts and changes no host configuration during `npm install`.

## Requirements

- Node.js 20+
- Claude Code or Codex with the configured lifecycle hooks
- Optionally Nowledge Mem Desktop plus `nmem`, claude-mem, Claude native project memory, configured Markdown paths, or an external adapter

## Inspect and test

```sh
pamr doctor
pamr install --host both --scope user --dry-run
```

`pamr doctor` reports detected memory providers for the current directory.

## Install only the Agent Skill

```sh
pamr install --host both --scope user
```

This does not modify hook configuration.

## Add reviewed hooks

```sh
pamr install --host both --scope user --hooks --yes
pamr status --host both --scope user
```

This installs SessionStart, UserPromptSubmit, PreToolUse, and Stop hooks. The Stop hook is inert unless candidate staging is explicitly enabled.

For project scope, add `--scope project --project /ABSOLUTE/PROJECT/PATH`.

## Provider and runtime controls

- `PAMR_MEMORY_PROVIDERS=nowledge,claude-mem,claude-native,markdown,external-command`: select providers.
- `PAMR_NMEM_BIN=/absolute/path/to/nmem`: pin the nmem executable.
- `PAMR_CLAUDE_MEM_PORT=37777`: override the validated claude-mem loopback port.
- `PAMR_CLAUDE_MEM_PROJECT=name`: override claude-mem project matching.
- `PAMR_FORCE_CLAUDE_MEM_RECALL=1`: bypass duplicate-integration protection for diagnostics.
- `PAMR_MEMORY_PATHS=/path/a:/path/b`: read bounded MEMORY.md, MEMORIES.md, or CONTEXT.md files.
- `PAMR_MEMORY_COMMAND=/absolute/path/to/adapter`: invoke an explicit adapter directly without a shell.
- `PAMR_FORCE_CLAUDE_NATIVE_RECALL=1`: inject Claude native memory into Claude too; normally avoided because Claude loads it natively.
- `PAMR_DISABLE_RECALL=1`: disable recall without removing hooks.
- `PAMR_ALLOW_SENSITIVE_RECALL=1`: allow results containing common sensitive-data markers. Leave unset by default.
- `NMEM_ALLOW_MEMORY_WRITE=1`: bypass the defense-in-depth nmem shell-write guard for a reviewed process.
- `PAMR_ENABLE_CANDIDATE_STAGING=1`: stage explicit MEMORY_CANDIDATE lines locally for review.

## Uninstall

```sh
pamr uninstall --host both --scope user --dry-run
pamr uninstall --host both --scope user --yes
```

Uninstall removes only exact hook groups recorded in the ownership manifest. Edited owned hooks cause a conflict instead of broad deletion. Unrelated host settings are preserved. Configuration backups remain beside the original file.

## Live verification checklist

- Recall failure does not block a prompt.
- Returned context is bounded, escaped, provider-labelled, and marked as untrusted data.
- Common sensitive recall results are suppressed by default.
- Claude native project memory resolves from the event working directory.
- Codex can receive matching Claude project memory without modifying it.
- The Stop hook stages only explicit markers when enabled and performs no durable write.
- Native/MCP memory permissions remain separately configured.
- No private prompt or recalled content is written to logs.
