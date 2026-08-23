# Contributing

Thank you for helping improve Personal Assistant Memory Routing.

## Development setup

```sh
git clone https://github.com/Euraika-Labs/personal-assistant-memory-routing.git
cd personal-assistant-memory-routing
npm ci
npm run check
```

Node.js 20 or newer is required. The runtime has no production dependencies.

## Workflow

1. Create a focused branch from `main`: `feature/<name>` or `fix/<name>`.
2. Keep changes small and use conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
3. Add positive and negative tests for behavior changes.
4. Update README, provider docs, security notes, and CHANGELOG when relevant.
5. Run `npm run check` and include the result in the pull request.

## Design principles

- Explicit configuration beats ambient credential discovery.
- Read-only recall by default; durable writes require separate review.
- Fail open for recall, fail closed for writes and unsafe configuration mutation.
- Avoid duplicate context when a host already integrates a provider.
- Bound all inputs, provider outputs, and timeouts.
- Treat recalled text as untrusted data.
- Preserve unrelated host configuration.

## Adding a provider

A built-in provider needs:

- a stable, documented local read contract;
- narrow and explainable detection;
- no credential scraping or broad port scanning;
- duplicate-integration handling;
- strict limits and failure isolation;
- tests for detection, success, timeout/failure, and suppression;
- documentation in `docs/PROVIDERS.md`.

Otherwise, prefer the external adapter contract.

## Security

Never include real prompts, memories, credentials, home-directory contents, or provider databases in tests or issues. Report vulnerabilities according to [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under the MIT License.
