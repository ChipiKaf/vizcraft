---
name: formatting-linting-and-commits
description: "Repo hygiene standards: Prettier+ESLint compliance, conventional commits, and changesets-friendly workflow in a pnpm/turbo monorepo. Use before submitting changes to keep CI green."
license: Complete terms in LICENSE.txt
---

# Formatting, Linting, and Commits

## Docs are part of the feature

- For every user-facing change, update `README.md`, `packages/core/README.md`, and/or `packages/docs/docs/**`.
- Prefer comprehensive Docusaurus updates for anything beyond trivial tweaks.

## Format is not optional

- Keep output compatible with Prettier settings (single quotes, semicolons).
- Don’t hand-format large sections; run formatters instead.


## Follow ESLint guidance

- Keep TypeScript ESLint rules passing; don’t disable rules casually.
- If you must suppress, keep it narrow and explain intent.

## Conventional commits + release tooling

- Use conventional commit messages (commitlint enforced).
- Use changesets for versioned changes where appropriate.

## Monorepo discipline

- Prefer workspace scripts (`turbo run …`) where configured.
- Avoid per-package drift in tooling choices.
