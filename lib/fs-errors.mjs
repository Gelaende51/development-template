/**
 * A failed file operation in words: what went wrong and with which path,
 * instead of Node's `ENOENT: no such file or directory, rename '…' -> '…'`.
 * From Lure (src/fsErrors.ts), where every error display goes through one
 * such function — a viewer that printed `err.message` was the gap sandbox
 * tests found.
 *
 *   import { errorText } from "development-template/fs-errors";
 *   new Notice(errorText(err));                       // English
 *   errorText(err, { t: (key, vars) => myT(key, vars) }); // your translations
 */

/** The reasons, by the code Node gives a failed file operation. */
export const REASONS = {
	ENOENT: "errorNotFound",
	EACCES: "errorNoPermission",
	EPERM: "errorNoPermission",
	EROFS: "errorReadOnly",
	ENOSPC: "errorDiskFull",
	EBUSY: "errorInUse",
	ENAMETOOLONG: "errorNameTooLong",
	EEXIST: "errorExists",
	// Codes of our own, for libraries that lose the reason: Electron's
	// shell.trashItem says only "Failed to move item to trash".
	ENOTRASH: "errorNoTrash",
	// A drive that cannot do it at all: links on most network shares and
	// FAT/exFAT drives.
	ENOTSUP: "errorNotSupported",
	EOPNOTSUPP: "errorNotSupported",
};

/** English sentences for the keys above; `{path}` and `{sandbox}` are filled in. */
export const ENGLISH = {
	errorNotFound: "{path} is not there, or this program cannot see it.",
	errorNoPermission: "No permission to change {path}.",
	errorReadOnly: "{path} is on a drive that cannot be written to.",
	errorDiskFull: "The drive {path} is on is full.",
	errorInUse: "{path} is in use by another program.",
	errorNameTooLong: "The name is too long for this drive.",
	errorExists: "{path} already exists.",
	errorNoTrash: "There is no trash to move {path} to here, so nothing was deleted.",
	errorNotSupported: "The drive {path} is on cannot do this (links are not possible on many network shares and USB drives).",
	errorSandbox: "This program runs in a {sandbox} sandbox, which only reaches the folders it was given.",
};

/** The codes a sandbox gives for a folder it was not let into. */
export const SANDBOXED = new Set(["ENOENT", "EACCES", "EPERM", "EROFS"]);

const english = (key, vars = {}) => ENGLISH[key].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

/**
 * The sandbox the process runs in, if any: a Flatpak sees only the folders it
 * was given, and a strict Snap the same. A file there can be missing to the
 * program while it is plainly on disk.
 */
export function sandbox({ env = globalThis.process?.env ?? {}, exists = defaultExists } = {}) {
	if (env.FLATPAK_ID || exists("/.flatpak-info")) return "Flatpak";
	if (env.SNAP) return "Snap";
	return null;
}

function defaultExists(path) {
	try {
		return globalThis.process?.getBuiltinModule?.("fs")?.existsSync(path) ?? false;
	} catch {
		return false;
	}
}

/**
 * The error in words. Anything without a known code keeps its own message.
 * `t(key, vars)` translates (English by default), `shortPath` shortens the
 * path for display, `box` overrides the sandbox detection.
 */
export function errorText(err, { t = english, shortPath = (p) => p, box = sandbox() } = {}) {
	const key = err?.code ? REASONS[err.code] : undefined;
	if (!key) return err?.message ?? String(err);
	const where = err.dest ?? err.path;
	let text = t(key, { path: where ? shortPath(where) : "" });
	if (box && SANDBOXED.has(err.code)) text += ` ${t("errorSandbox", { sandbox: box })}`;
	return text;
}

/** A library's reasonless failure, given a code of our own and the path. */
export function withCode(err, code, path) {
	return Object.assign(err instanceof Error ? err : new Error(String(err)), { code, path });
}
