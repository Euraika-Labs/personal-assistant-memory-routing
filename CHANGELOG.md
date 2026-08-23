# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic versioning.

## [Unreleased]

## [0.3.0] - 2026-08-23

### Added
- Built-in read-only claude-mem detection, health checking, search, and session context through its loopback worker API.
- Native claude-mem integration detection for Claude Code and Codex to avoid duplicate injection.
- Provider, adapter, architecture, contribution, support, and community documentation.
- GitHub Actions CI, CodeQL, Dependabot, issue forms, pull request template, and CODEOWNERS.

### Changed
- Default provider list now includes `claude-mem`.
- npm metadata now points to the Euraika Labs GitHub repository and enables provenance for future CI releases.

### Security
- claude-mem worker ports are range-validated and requests are restricted to `127.0.0.1`.
- Unknown memory systems remain explicit adapters; PAMR does not probe ports or import credentials.

## [0.2.0] - 2026-08-23

### Added
- Stop-hook candidate staging.
- Nowledge Mem, Claude native memory, Markdown, and external-command providers.

## [0.1.0] - 2026-08-23

### Added
- Initial Agent Skill, installer, Claude Code hooks, and Codex hooks.
