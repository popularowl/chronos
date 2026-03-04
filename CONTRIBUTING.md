# Contributing to Chronos project

Thank you for your interest in contributing to Chronos application! This document outlines the standards and requirements for the community contributions.

## Getting Started

*Note:* within the project, we follow the [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) patterns for all commit messages. This allows for maintaining well defined release notes. All commits must follow this pattern. Examples (see [this](https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13) for reference):

```txt
feat: commits that add, adjust or remove a new feature to the APIs or UI
fix: commits that fix an API routes or UI bugs
style: commits that address code style e.g. formatting
test: commits that add missing tests or correct existing ones
docs: commits that exclusively affect documentation
ops: commits that affect operational aspects like infrastructure, container images, scripts
chore: commits that represent modifying .gitignore, etc.
```

### Prerequisites and Setup

- Node.js ^24
- pnpm >=10

## Running Tests

All tests must pass before submitting a pull request. This will be checked in PR pipeline. See test examples

```bash
cd chronos_app
pnpm install # pnpm nuke && pnpm install --frozen-lockfile
pnpm build # pnpm build --force
pnpm test # pnpm test --force

pnpm test:components
pnpm test:server
pnpm test:server -- --coverage # provides coverage scores for server package
```

## Code Quality

Run the linter to check for code style issues:

```bash
pnpm lint
pnpm lint-fix
```

## Pull Request Requirements

Before your pull request can be merged, the following CI checks must pass:

1. **Lint** - All code must pass ESLint checks
2. **Component Tests** - All component package tests must pass
3. **Server Tests** - All server package tests must pass

A coverage report will be automatically posted to your pull request showing test coverage metrics.

### Coverage Thresholds

We aim to maintain good test coverage:

- Good: >=50%
- Acceptable: >=30%
- Needs improvement: <20%

## Submitting a Pull Request

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Ensure all tests pass locally
5. Ensure linting passes
6. Submit a pull request to `main`
