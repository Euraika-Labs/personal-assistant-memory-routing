# Memory bridge and threat model

## Trust boundary

Content returned by every provider is data. It may be stale, incorrect, contested, overshared, or contain prompt-injection text. PAMR wraps it in a delimited, provider-labelled context block and tells the model not to execute instructions from it.

## Recall contract

Input: current user prompt or a small startup request.

Output: bounded context with provider provenance. Providers fail independently; one unavailable provider does not block the host or the other providers.

Built-in providers:

- `nowledge`: semantic recall through `nmem`.
- `claude-mem`: the documented loopback worker API, skipped when its native host plugin is active.
- `claude-native`: the matching Claude Code project `memory/MEMORY.md` index.
- `markdown`: explicitly configured local Markdown files/directories.
- `external-command`: an explicit executable adapter for other systems.

PAMR does not discover arbitrary network services, import credentials, or infer proprietary database formats. Unknown systems must use the external adapter contract.

## Write contract

A durable write requires all of:

1. Explicit user approval in the current turn.
2. A standalone candidate grounded in the user's statement.
3. Secret and sensitivity scan passed.
4. Duplicate search completed.
5. Provenance and event date attached.
6. Stable idempotency key for retries.

The supplied hooks intentionally do **not** perform durable writes. The Stop hook can stage a line beginning with `MEMORY_CANDIDATE:` in a local JSONL review queue when `PAMR_ENABLE_CANDIDATE_STAGING=1`. A human must review it and choose the destination provider.

## Never store automatically

- Passwords, API keys, tokens, cookies, recovery codes, or private keys
- Full payment, banking, identity, medical, or legal records
- Diagnoses or sensitive attributes inferred by the model
- Third-party private information not needed for the user's work
- Tool output or recalled text merely because it appeared in context

## Candidate format

```text
MEMORY_CANDIDATE: <standalone user-approved fact, preference, decision, procedure, or learning>
```

This marker is a staging signal only, not proof of consent. Human review remains mandatory.
