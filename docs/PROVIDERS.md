# Memory providers

PAMR is a recall router, not a memory database. Each provider is read independently and failures do not block the host.

## Selection and order

Default order: `nowledge`, `claude-mem`, `claude-native`, `markdown`, `external-command`.

Set `PAMR_MEMORY_PROVIDERS` to an explicit comma-separated allowlist. Unknown names are ignored.

## Nowledge Mem

Detection requires a local `nmem` executable. Prompt recall uses `nmem fs recall`; session start requests Working Memory. The Nowledge Mem desktop application remains the local backend.

## claude-mem

Detection checks claude-mem's local settings/runtime paths, validates the worker port, and probes only loopback. PAMR never starts, stops, upgrades, or reconfigures claude-mem.

PAMR avoids duplicate injection when it sees:

- Claude Code's `thedotmack/claude-mem` marketplace/cache; or
- an enabled `claude-mem@...` plugin section in `~/.codex/config.toml`.

This is conservative. Use `PAMR_FORCE_CLAUDE_MEM_RECALL=1` only when diagnostics prove the host integration is not injecting context.

Search returns claude-mem's compact result index, not full observations. This follows claude-mem's progressive-disclosure design and keeps hook context bounded.

## Claude Code native memory

The matching index is `~/.claude/projects/<project-key>/memory/MEMORY.md`. Claude Code already loads it; PAMR therefore exposes it to Codex only unless `PAMR_FORCE_CLAUDE_NATIVE_RECALL=1` is set. The file is never modified.

## Markdown

Only explicitly configured files or immediate directory children named `MEMORY.md`, `MEMORIES.md`, or `CONTEXT.md` are read. Symlinks and files over 512 KiB are rejected. Configure narrow, project-specific paths.

## External command

Use this for Mem0, Letta, Zep, OpenMemory, a vector store, or an internal service. The adapter is opt-in and invoked without a shell. See [ADAPTERS.md](ADAPTERS.md).

## MCP memory servers

PAMR can report host configuration in future versions, but it does not invoke arbitrary MCP tools from lifecycle command hooks. If a memory system is already exposed as MCP, let Claude Code or Codex call it natively under the host's approval policy. Avoid also bridging the same store through an external adapter unless you intentionally want duplicate recall.

## What is not auto-detected

PAMR does not scan ports, inspect browser sessions, import API keys, parse unknown SQLite schemas, or connect to cloud accounts. Auto-detection is limited to stable local signals with a documented read contract.
