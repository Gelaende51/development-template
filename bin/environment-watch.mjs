#!/usr/bin/env node
/**
 * What each test environment is made of today, so a change to one — a new
 * container image, a distribution's new package, a new Wine, a new runner
 * image — runs the tests on that environment. From Lure
 * (scripts/test-environments.mjs); the environments are the project's, listed
 * under "environments" in devkit.config.json:
 *
 *   "environments": {
 *     "image debian:12":  { "source": "docker",   "repo": "library/debian", "tag": "12", "targets": ["distros"] },
 *     "Arch's obsidian":  { "source": "repology", "project": "obsidian", "repo": "arch", "targets": ["system-electron"] },
 *     "Flathub's app":    { "source": "flathub",  "app": "md.obsidian.Obsidian", "targets": ["flatpak"] },
 *     "Snap's app":       { "source": "snap",     "name": "obsidian", "targets": ["snap"] },
 *     "WineHQ staging":   { "source": "winehq",   "package": "winehq-staging", "dist": "noble", "targets": ["wine"] },
 *     "electron@beta":    { "source": "npm",      "package": "electron", "tag": "beta", "targets": ["electron-next"] },
 *     "runner ubuntu24":  { "source": "runner",   "image": "ubuntu24", "targets": ["main"] }
 *   }
 *
 *   environment-watch                # print what is there now
 *   environment-watch --diff         # compare with the state file
 *   --config devkit.config.json  --state .github/environment-versions.json
 *
 * --diff prints { changed, changes, targets, mainTests, now }: `targets` are
 * the targets to run; a target named "main" sets `mainTests` instead (the
 * main test workflow's runner moved). Nothing is installed: each fact comes
 * from where it is published (Docker Hub, Repology — one request a second,
 * Flathub, Snapcraft, WineHQ, npm, GitHub's runner-images releases). A source
 * that cannot be read keeps its last value and starts nothing, so a flaky
 * API does not start a run of its own.
 */
import { readFileSync } from "node:fs";

const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i > 0 ? process.argv[i + 1] : fallback;
};
const config = JSON.parse(readFileSync(arg("--config", "devkit.config.json"), "utf8"));
const statePath = arg("--state", ".github/environment-versions.json");
const UA = `environment-watch (github.com/${config.repository ?? "unknown"})`;
const gh = { accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) gh.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function get(url, headers = {}, as = "json") {
	const res = await fetch(url, { headers: { "user-agent": UA, ...headers } });
	if (!res.ok) throw new Error(`${res.status}`);
	return as === "json" ? res.json() : res.text();
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const newest = (versions) => versions.sort((a, b) => a.localeCompare(b, "en", { numeric: true })).at(-1) ?? null;

let repologyAt = 0;
let releases = null;
const READERS = {
	async docker({ repo, tag }) {
		const [ns, name] = repo.split("/");
		return (await get(`https://hub.docker.com/v2/namespaces/${ns}/repositories/${name}/tags/${tag}`)).digest;
	},
	async repology({ project, repo }) {
		const wait = repologyAt + 1100 - Date.now();
		if (wait > 0) await sleep(wait);
		repologyAt = Date.now();
		const rows = await get(`https://repology.org/api/v1/project/${project}`);
		return newest(rows.filter((r) => r.repo === repo).map((r) => r.version));
	},
	async flathub({ app }) {
		return (await get(`https://flathub.org/api/v2/appstream/${app}`)).releases?.[0]?.version;
	},
	async snap({ name, channel = "stable", architecture = "amd64" }) {
		const info = await get(`https://api.snapcraft.io/v2/snaps/info/${name}`, { "Snap-Device-Series": "16" });
		return info["channel-map"].find((c) => c.channel.name === channel && c.channel.architecture === architecture)?.version;
	},
	async winehq({ package: pkg = "winehq-staging", dist = "noble" }) {
		const index = await get(`https://dl.winehq.org/wine-builds/ubuntu/dists/${dist}/main/binary-amd64/Packages`, {}, "text");
		return index.match(new RegExp(`^Package: ${pkg}\\n(?:.+\\n)*?Version: (.+)$`, "m"))?.[1];
	},
	async npm({ package: pkg, tag = "latest" }) {
		return (await get(`https://registry.npmjs.org/${pkg}`))["dist-tags"]?.[tag];
	},
	async runner({ image }) {
		releases ??= await get("https://api.github.com/repos/actions/runner-images/releases?per_page=60", gh);
		return newest(releases.map((r) => r.tag_name).filter((t) => t.startsWith(`${image}/`)));
	},
};

const sources = config.environments ?? {};
const now = {};
for (const [name, spec] of Object.entries(sources)) {
	try {
		const read = READERS[spec.source];
		if (!read) throw new Error(`no source "${spec.source}"`);
		now[name] = (await read(spec)) ?? "unreadable (empty)";
	} catch (err) {
		now[name] = `unreadable (${err.message})`;
	}
}

if (!process.argv.includes("--diff")) {
	console.log(JSON.stringify(now, null, "\t"));
	process.exit(0);
}

let before = {};
try {
	before = JSON.parse(readFileSync(statePath, "utf8"));
} catch {
	// First run: everything is recorded, nothing is run for it.
}
const changes = [], targets = new Set();
let mainTests = false;
for (const [name, value] of Object.entries(now)) {
	const was = before[name];
	// Keep what was known when a source could not be read this time.
	if (String(value).startsWith("unreadable")) { if (was !== undefined) now[name] = was; continue; }
	if (was === undefined || was === value || String(was).startsWith("unreadable")) continue;
	changes.push(`${name}: ${was} → ${value}`);
	for (const t of sources[name].targets ?? []) t === "main" ? (mainTests = true) : targets.add(t);
}
console.log(JSON.stringify({ changed: changes.length > 0, changes, targets: [...targets], mainTests, now }));
