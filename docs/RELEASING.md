# Releasing

PAMR uses immutable semantic-version tags, GitHub Releases, npm trusted publishing (OIDC), npm provenance, and GitHub artifact attestations. No long-lived npm token is stored in GitHub.

## Release contract

A release is published only when all of these are true:

1. `package.json` and `package-lock.json` contain the intended version.
2. `CHANGELOG.md` contains a matching `## [X.Y.Z] - YYYY-MM-DD` section.
3. The release commit is merged into protected `main` and required CI/CodeQL checks pass.
4. A signed or annotated `vX.Y.Z` tag points at that exact commit.
5. The protected `npm` environment approves the release job.

Ordinary pushes and pull requests never publish. The release workflow reruns the complete package checks before publication.

## Maintainer procedure

```sh
npm version 0.4.0 --no-git-tag-version
# Move the relevant CHANGELOG.md entries from Unreleased to 0.4.0.
npm run release:check -- v0.4.0
npm run check

git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release 0.4.0"
# Open and merge a pull request; wait for required checks.

git switch main
git pull --ff-only
git tag -a v0.4.0 -m "Release v0.4.0"
git push origin v0.4.0
```

The tag automatically triggers `.github/workflows/release.yml`, which:

- resolves and checks out the immutable tag commit;
- validates tag/version/changelog alignment;
- runs `npm ci` and `npm run check`;
- creates the npm tarball and `SHA256SUMS.txt`;
- creates a GitHub artifact attestation and a 90-day workflow artifact;
- creates a draft GitHub Release with the tarball and checksum;
- publishes to npm through OIDC with provenance;
- verifies the exact npm version and only then publishes the GitHub Release.

The workflow is idempotent: reruns skip npm publication when the exact version already exists and refresh the release assets.

## Recovery

If npm publication fails, the GitHub Release remains a draft. Fix the cause and rerun the same workflow for the existing tag. Never move or reuse a published version tag. Publish a new patch version for code changes.
