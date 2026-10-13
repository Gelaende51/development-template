# development-template

The core layer of three templates, each a starting point *and* a package the projects
made from it depend on:

| Template | For | Builds on |
|---|---|---|
| **development-template** | any software project | — |
| electron-template | apps and plugins on Electron | development-template |
| obsidian-plugin-template | Obsidian plugins | electron-template |

Tooling comes from Lure (an Obsidian plugin) and is moved here layer by layer; the
design and the phases are in `obsidian-plugin-template/docs/superpowers/specs/2026-10-12-shared-toolkit-design.md`.

Status: 1.2.0 (phase 4 of 8). Packages by exact tag (`…/tar.gz/refs/tags/v1.2.0`; npm 12 needs `allow-remote=root` in `.npmrc`); workflows by `@v1`, which moves to each 1.x release. Licence: AGPL-3.0 (see `LICENSE`).

## In here so far

- `lib/harness.mjs` — the test harness: `createSuite({ reset, teardown, skip, outside })`,
  `skipCase(why)`, `expect`, `--first=N` bisection, failure screenshots. `outside` names
  the cases that need data outside the app's own folder, left out where a sandbox
  cannot see there (`EXPECT_SANDBOX`); `SHOTS=<dir>` saves a screenshot at a case's
  first failure (`globalThis.__harnessSession` is the CDP session). The `LURE_` names
  still work.
- `lib/fs-errors.mjs` — failed file operations in words: `errorText(err, { t, shortPath })`
  maps Node's codes (and `ENOTRASH`, `ENOTSUP`) to sentences with the path, adds a
  Flatpak/Snap sandbox hint, English built in; `withCode(err, code, path)` for libraries
  that lose the reason.
- `.github/workflows/target-issue.yml` — reusable: one issue per failing test target,
  commented on repeat failures, closed when the target passes again.
- `bin/environment-watch.mjs` (`environment-watch [--diff]`) — what each test environment
  is made of today (Docker Hub digests, Repology, Flathub, Snapcraft, WineHQ, npm dist-tags,
  GitHub runner images), from the project's `environments` config; `--diff` against the
  state file says which targets to run. Unreadable sources keep their last value.
- `docs/portability-and-ci.md` — the guide: data anywhere, paths, probing the system,
  errors in words, which test environments find what, CI organisation, watching changes.
- `.github/workflows/npm-next.yml` — reusable canary: the next build and type tools over the
  lockfile, type check and build, lint as a warning, then the suites.
- `schema/devkit.config.schema.json` — the per-project config every layer reads.
