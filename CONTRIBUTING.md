# Contributing to Chronos project

Thanks for your interest in contributing to Chronos project! This guide sets out the standards and requirements for the community contributions.

## Getting Started

_Note:_ within the project, we follow the [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) patterns for all commit messages. This allows for maintaining well defined release notes. All commits must follow this pattern. Examples (see [this](https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13) for reference):

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

- Node.js = 24
- pnpm = 10.33.4

## Development

useful commands for developing project locally.

```bash
git clone git@github.com:intelligexhq/chronos.git
cd chronos/chronos_app
node -v # v24 runtime needed. use nvm if necesary
pnpm install # pnpm nuke && pnpm install
pnpm build # pnpm build --force
rm -rf ~/.chronos # chronos dev data stores. see https://intelligex.com/chronos/how-chronos-agent-builder-stores-data

# export enviroenment variables in order to enable to selected funcionality in Chronos. see docker/.env.example
# for example: export ENABLE_AGENTS=true && export ENABLE_MCP_SERVERS=true

pnpm dev
# chronos is accessible on localhost:3010 (Vite config)
# new dev browser tab will be automatically open in default browser
# signup with test email
```

build local container

```bash
cd chronos/chronos_app/docker
docker build -f Dockerfile.local -t chronos:local ..
docker run -d --name chronos -p 3001:3000 chronos:local
docker compose -f docker-compose.yml up  # or docker compose -f docker-compose.yml up -d
```

## Running Tests

All tests & linting must pass before submitting a pull request. This will be checked in PR pipeline and autorejected.

```bash
cd chronos_app
pnpm install # pnpm nuke && pnpm install --frozen-lockfile
pnpm build # pnpm build --force
pnpm test # pnpm test --force

# run the linter to check for code style issues. can autofix
pnpm lint
pnpm lint-fix

pnpm test:components
pnpm test:server
pnpm test:server -- --coverage # provides coverage scores for server package. +60% coverage required for pr pipeline.
# coverage report will be automatically posted to your pull request showing test coverage metrics.
```

## Submitting a Pull Request

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Ensure all tests pass locally
5. Ensure linting passes
6. Submit a pull request to `main`
