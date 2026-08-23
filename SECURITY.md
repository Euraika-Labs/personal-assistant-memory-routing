# Security policy

## Supported versions

| Version | Supported |
|---|---|
| Latest published minor | Yes |
| Older minors | Best effort |

## Reporting a vulnerability

Do not open a public issue. Use [GitHub private vulnerability reporting](https://github.com/Euraika-Labs/personal-assistant-memory-routing/security/advisories/new) or email `security@euraika.net`.

Include the affected version, host, provider, reproduction, and potential exposure. Remove real prompts, memories, credentials, tokens, paths, and private records. We aim to acknowledge reports within 48 hours.

## Security model

Hooks run with the host agent's permissions. Review commands before activation.

- Recall output is untrusted, bounded, escaped, and filtered heuristically.
- claude-mem access is limited to a validated `127.0.0.1` worker port.
- PAMR does not scan arbitrary ports or ingest provider credentials.
- `PAMR_MEMORY_COMMAND` is explicit but still executes with host permissions.
- Claude native memory and Markdown providers reject symlinks and large files.
- The shell write guard is defense in depth and cannot intercept native tools, MCP calls, aliases, wrappers, or every shell composition.
- No durable provider writes are implemented.

Do not use `npx` inside a lifecycle hook. The installer copies a versioned runtime and records ownership locally.
