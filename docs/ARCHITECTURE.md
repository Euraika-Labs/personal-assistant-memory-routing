# Architecture

## Data flow

```text
Host event (Claude Code or Codex)
  -> versioned local command hook
  -> provider allowlist
  -> independent bounded reads
  -> sensitive-marker suppression
  -> provider-labelled XML escaping
  -> host additionalContext
```

Each provider fails independently. PAMR emits no context when every provider is unavailable or filtered.

## Trust boundaries

1. **Host configuration:** modified only by the explicit installer, with backup and ownership manifest.
2. **Hook event:** capped at 1 MiB; malformed JSON becomes an empty event except write-guard overflow fails closed.
3. **Provider execution:** built-ins use local files, `nmem`, or a validated loopback port. The custom adapter is explicit.
4. **Provider output:** capped per provider and globally, common sensitive markers suppressed, XML escaped, and labelled `trust="untrusted-data"`.
5. **Writes:** no provider write implementation exists. Optional candidates go to a local review queue only.

## Duplicate prevention

PAMR avoids loading Claude native memory into Claude Code and avoids claude-mem bridging when a native claude-mem plugin is detected for the current host. This prevents two lifecycle systems from injecting the same memory.

## Installation ownership

The CLI copies a versioned runtime, marks the skill directory, records exact hook groups in a manifest, and removes only exact owned entries. Concurrent configuration changes are detected with a content hash. Symlinked JSON configuration is rejected.

## Limits

- Sensitive-marker filtering is heuristic.
- Native integration detection is conservative, not a full TOML/plugin resolver.
- The shell write guard cannot intercept MCP calls or all command compositions.
- Hook context uses compact recall and does not implement multi-step observation expansion.
- Windows is not currently supported by the installer.
