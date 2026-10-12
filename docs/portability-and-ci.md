# Portability and CI

How to make software work, and stay working, on systems and setups its developer does not use: other operating systems, sandboxes, containers, network drives, slow or small machines, and the next versions of everything it depends on. Learned on Lure (an Obsidian plugin) across ~20 CI environments, 2026-10. The tools for most of it are in this repository and in electron-template.

## Assume nothing about where things are
- Data can be anywhere: outside the home folder, on another drive, on a network share
  (SMB, NFS), on a UNC path with no drive letter (`\\server\share\…`). Test at least one
  of each; a suite that only ever runs with data under `$HOME` hides the assumption.
- Keep the application's own state (settings, caches, Chromium's user-data-dir) local:
  databases there want file locks a network share may not give. Only user data goes
  on the share — in tests as in real use.
- A place list (drives, mounts, "home") must still contain the place the data is on:
  add a share's root when no listed drive holds it.

## Paths
- Accept `/` and `\` everywhere, mixed and doubled; canonicalise once, where a path
  enters (`normalize` to the platform's separator, no trailing separator), so display,
  comparison and storage never see two spellings of one file.
- Windows: a path from the root without a drive (`\Users\…`, `/tmp/…`) is relative to
  the current drive. `resolve()` adds the drive, so compare resolved with resolved, or
  containment checks silently fail.
- `file://host/share/x` is a UNC path on Windows. The WHATWG URL parser empties the host
  `localhost`, so `\\localhost\…` cannot survive a URL round trip; test with a real name.
- On Linux and macOS `\` is a legal file-name character; treating it as a separator
  means such names can be picked from a list but not typed. Say so in the changelog.

## Ask the system, do not infer it from the platform name
- Probe capabilities where they matter: can this drive make hard/symbolic links (most
  SMB shares and FAT/exFAT cannot: `ENOTSUP`/`EOPNOTSUPP`/`EPERM`), does it ignore
  case (Windows, macOS default, most shares — Linux on a share too), is there a trash
  (containers, tmpfs, headless sessions have none), does the process run as root
  (permissions do not bind root: `chmod 000` files stay readable in containers/VMs).
- Mounts: Linux `/proc/mounts`; FreeBSD has none — `mount -p` prints the same table.

## Fail in words
- Map error codes to sentences with the path: `ENOENT` not there, `EACCES`/`EPERM` no
  permission, `EROFS` read-only, `ENOSPC` full, `EBUSY` in use, `ENAMETOOLONG`,
  `EEXIST`, `ENOTSUP`/`EOPNOTSUPP` "this drive cannot do this". Inside a sandbox
  (Flatpak: `FLATPAK_ID` or `/.flatpak-info`; Snap: `SNAP`), add that the sandbox may
  hide the folder. Route *every* error display through the one function — a viewer
  that printed `err.message` was the gap that sandbox tests found.
- Libraries often lose the reason (Electron's `shell.trashItem`: only "Failed to move
  item to trash"); wrap and give it a code of your own.
- An operation that can hang (system trash, network): after ~10 s show a notice that
  stays until it settles, without deciding the outcome.

## Test environments worth having (and what each found)
- Distro containers (Debian, Ubuntu LTS, Fedora, Arch, openSUSE): run as root; slim
  images lack curl, fonts, fontconfig. **No font = text laid out with zero height**, so
  "does it scroll" tests fail; install a font and run `fc-cache`. Newer Debian/Ubuntu
  renamed libraries with a `t64` suffix — install one at a time with a fallback, or one
  rename takes the whole `apt-get install` line (and curl) down.
- Rolling/next releases as canaries: `debian:sid`, `fedora:rawhide`, `ubuntu:devel`,
  `opensuse/tumbleweed`, Alpine edge.
- Flatpak full and restricted (`--nofilesystem=host --nofilesystem=home`): private
  `/tmp`; restricted mode should *test the error message*, not fail every case.
- Snap, Nix, Wayland (headless weston), FreeBSD (vmactions; native modules compile with
  node-gyp; tooling that refuses unknown platforms can be told "linux" before import),
  Alpine (musl: vendor Electron binaries do not run even with gcompat; use the distro's
  own Electron).
- Wine (WineHQ staging; unpack the installer with 7z; Chromium needs
  `--no-sandbox --disable-gpu --disable-gpu-sandbox --in-process-gpu
  --disable-features=RendererCodeIntegrity,NetworkServiceSandbox`): run the *test driver*
  on Windows' Node under Wine too, or test and app disagree on every path. Windows Node
  under Wine gets EBADF writing to a pipe — redirect to a file. npm will not install
  another OS's optional binary even with `--force`; unpack it and point to it (esbuild:
  `ESBUILD_BINARY_PATH`). `wineserver -k` between runs.
- Limits: 1.5 GB + half a CPU (container `--memory/--cpus`), small screen, HiDPI, no
  GPU; x64 emulation (Windows on Arm, Rosetta — the latter flaky, keep as a probe).
- Windows guest VMs write CRLF: strip `\r` before matching result files.

## Write tests that measure the behaviour
- Measure the thing, not a proxy: whether text scrolls is `scrollTop = 1e6` then read,
  not `scrollHeight > clientHeight` (some systems report the box's own height).
- Transient UI (a 0.5 s flash, a notice that closes after 5 s) is recorded with a
  MutationObserver installed before the action, not looked for afterwards.
- Wait for conditions with a ceiling scaled by a slowness factor, never fixed pauses.
- Distinguish "this machine cannot" (skip, with the reason in the log) from "the code is
  wrong" (fail). Let suites declare which cases need what (e.g. an `outside` predicate
  the harness skips under a sandbox); keep skips visible as warnings.
- When a case fails only somewhere, add a diagnosis line that prints the measured state
  on failure and keep it; it turned three guesses into one-line fixes.
- Shell inside YAML: an apostrophe in a comment inside a single-quoted `node -e '…'`
  ends the quote. Check every probe actually ran before trusting its silence.

## CI organisation
- One workflow of named targets (`target` input) plus a `why` input: runs started by
  automation pass `why`, and a final job opens one issue per target on failure,
  comments on it on repeat failures, and closes it when the target passes again.
- A bot that commits after long tests must `pull --rebase` before pushing (main moves
  meanwhile); a failed push also skipped the issue that should have followed.
- Scheduled workflows run late (tens of minutes); do not read a missing run as broken.
- Public repositories have public Actions logs. Anything under NDA or early access is
  tested on the maintainer's machine (container, same scripts as CI); CI only records
  that something new exists, and a local session picks it up.
- Local runs: `act` covers Linux jobs only and needs a full runner image; a plain
  `podman run` of the same setup and suite scripts is lighter (Podman needs no daemon).
  Cap memory; one app instance at a time on small machines.

## Watch what changes under you
- Dependabot: runtime dependencies as one group with majors; dev tools' minor/patch as
  one group, majors alone; GitHub Actions as one group. Let tests run on every branch
  so its PRs arrive tested (no secrets needed for that).
- Before merging tool updates, run the *full* build (type check, lint, checks), not
  just the tests. Action major bumps reach release-only paths (attestation) untested
  until the next release — note it.
- A runtime-dependency update can be built automatically as a pre-release
  (`<next patch>-deps.<n>`) for opt-in channels; semver ranks it below the next real
  release.
- Environments are dependencies too: record Docker Hub digests, distribution package
  versions (Repology: 1 request/s, a User-Agent), Flathub's and Snapcraft's versions
  (`Snap-Device-Series: 16`), WineHQ's package index, GitHub runner-image releases; a
  change runs that environment's target. A source that cannot be read keeps its last
  value and starts nothing.
- Canaries for what is next: the next Electron (`electron@beta`; npm no longer runs
  install scripts unasked — run `electron/install.js`), TypeScript's nightly (a peer
  range that refuses it is itself the heads-up: warn, then `--legacy-peer-deps`; lint
  separately so the type check and suites still run), the next runner image, plugins'
  pre-releases. Never part of a release; reported like any target.
