# External memory adapter protocol

Use an adapter when a memory system does not have a built-in PAMR provider.

## Invocation

Set an existing absolute executable path:

```sh
export PAMR_MEMORY_COMMAND=/absolute/path/to/pamr-memory-adapter
```

PAMR invokes it directly, never through a shell:

```text
pamr-memory-adapter recall --host claude|codex
pamr-memory-adapter session-start --host claude|codex
```

A JSON object is supplied on stdin:

```json
{
  "action": "recall",
  "query": "current user prompt",
  "host": "codex",
  "cwd": "/absolute/project/path"
}
```

Return plain text or compact JSON on stdout. Exit non-zero or write no stdout to fail open. Keep output below 3,500 characters; PAMR truncates larger output.

## Minimal Node.js adapter

```js
#!/usr/bin/env node
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const request = JSON.parse(Buffer.concat(chunks));

// Call your reviewed SDK or local API here. Never echo credentials.
const results = await memoryClient.search({
  query: request.query,
  namespace: request.cwd,
  limit: 5,
});

process.stdout.write(JSON.stringify(results));
```

## Provider guidance

- **Mem0 / OpenMemory:** scope by user and project; return search results only.
- **Letta:** query archival memory read APIs; do not mutate agent state from a recall hook.
- **Zep:** scope by user/session/project and return compact facts or episodes.
- **Vector databases:** apply namespace filters before semantic search.
- **Internal services:** use loopback or TLS, short timeouts, and least-privilege read credentials.

## Security requirements

1. Pin and review the adapter executable.
2. Read credentials from the adapter's own secure configuration, never from PAMR output.
3. Use read-only endpoints.
4. Enforce project/user scoping server-side.
5. Apply short timeouts and bounded output.
6. Do not log the prompt, recalled records, or secrets by default.
7. Treat provider content as untrusted even after retrieval.

PAMR does not certify third-party adapters. Their network, privacy, retention, and authorization behavior remains the operator's responsibility.
