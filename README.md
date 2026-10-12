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

Status: scaffold (phase 1). Licence: AGPL-3.0 (see `LICENSE`).

## In here so far

- `lib/harness.mjs` — the test harness: `createSuite({ reset, teardown, skip, outside })`,
  `skipCase(why)`, `expect`, `--first=N` bisection, failure screenshots. `outside` names
  the cases that need data outside the app's own folder, left out where a sandbox
  cannot see there (`LURE_EXPECT_SANDBOX`, to be renamed).
