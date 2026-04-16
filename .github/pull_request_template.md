## Summary

<!-- One or two sentences on what this PR changes and why. -->

Fixes #<!-- issue number, if any -->

## Type of change

<!-- Check one. Must align with your conventional commit prefix. -->
- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `docs` — documentation only
- [ ] `style` — formatting / no logic change
- [ ] `test` — adding or fixing tests
- [ ] `ops` — infra, Docker, CI
- [ ] `chore` — tooling / misc

## Area
<!-- Helps reviewers route this. -->
- [ ] UI (`packages/ui`)
- [ ] Server (`packages/server`)
- [ ] Components / nodes (`packages/components`)
- [ ] API docs (`packages/api-documentation`)
- [ ] Docker / deployment
- [ ] Docs

## How was this tested?

<!-- Describe manual steps, new unit tests, or affected test suites. -->
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] Added/updated unit tests where applicable
- [ ] Tested locally against SQLite / Postgres / MariaDB (circle any)

## Screenshots / recordings
<!-- For UI changes, include before/after. Delete if N/A. -->

## Breaking changes

- [ ] This PR introduces a breaking change

<!-- If yes, describe the migration path for self-hosted users. -->

## Checklist

- [ ] My commit messages follow [conventional commits](https://www.conventionalcommits.org/)
- [ ] I added JSDoc to any newly created code blocks
- [ ] I updated docs / README where behaviour changed
- [ ] I did not commit secrets, `.env` files, or credentials
