import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const rootManifestPath = resolve(rootDir, "package.json");

function fail(message) {
  console.error(`[version] ${message}`);
  process.exitCode = 1;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function getWorkspaceManifestPaths() {
  const manifests = [];

  for (const group of ["apps", "packages"]) {
    const groupDir = resolve(rootDir, group);
    const entries = await readdir(groupDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const relativePath = `${group}/${entry.name}/package.json`;
      try {
        await readFile(resolve(rootDir, relativePath), "utf8");
        manifests.push(relativePath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }

  return manifests.sort();
}

function parseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version);
  if (!match) {
    throw new Error(`Expected a SemVer version (x.y.z or x.y.z-prerelease), received "${version}".`);
  }
  return match.slice(1, 4).map(Number);
}

function assertBuildNumber(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`eotion.buildNumber must be a positive integer, received "${value}".`);
  }
}

function bumpVersion(version, release) {
  const [major, minor, patch] = parseVersion(version);
  if (release === "major") return `${major + 1}.0.0`;
  if (release === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

async function syncWorkspaceVersions(version, manifestPaths) {
  const changed = [];
  for (const relativePath of manifestPaths) {
    const path = resolve(rootDir, relativePath);
    const manifest = await readJson(path);
    if (manifest.version === version) continue;
    manifest.version = version;
    await writeJson(path, manifest);
    changed.push(relativePath);
  }
  return changed;
}

async function check(rootManifest, manifestPaths) {
  parseVersion(rootManifest.version);
  assertBuildNumber(rootManifest.eotion?.buildNumber);

  const mismatches = [];
  for (const relativePath of manifestPaths) {
    const manifest = await readJson(resolve(rootDir, relativePath));
    if (manifest.version !== rootManifest.version) {
      mismatches.push(`${relativePath}: ${manifest.version} != ${rootManifest.version}`);
    }
  }

  if (mismatches.length > 0) {
    fail(`workspace versions are out of sync:\n${mismatches.join("\n")}`);
    return;
  }

  console.log(
    `[version] Eotion ${rootManifest.version} (build ${rootManifest.eotion.buildNumber}) is consistent across ${manifestPaths.length} workspace packages.`,
  );
}

async function main() {
  const command = process.argv[2] ?? "check";
  const rootManifest = await readJson(rootManifestPath);
  const manifestPaths = await getWorkspaceManifestPaths();

  parseVersion(rootManifest.version);
  assertBuildNumber(rootManifest.eotion?.buildNumber);

  if (command === "check") {
    await check(rootManifest, manifestPaths);
    return;
  }

  if (command === "sync") {
    const changed = await syncWorkspaceVersions(rootManifest.version, manifestPaths);
    console.log(
      changed.length === 0
        ? `[version] workspace already matches ${rootManifest.version}.`
        : `[version] synced ${rootManifest.version}: ${changed.join(", ")}`,
    );
    return;
  }

  if (command === "build") {
    rootManifest.eotion.buildNumber += 1;
    await writeJson(rootManifestPath, rootManifest);
    console.log(
      `[version] Eotion ${rootManifest.version} build -> ${rootManifest.eotion.buildNumber}`,
    );
    return;
  }

  let nextVersion;
  if (command === "set") {
    nextVersion = process.argv[3];
    if (!nextVersion) {
      throw new Error("Usage: pnpm version:set -- <x.y.z[-prerelease]>");
    }
    parseVersion(nextVersion);
  } else if (["patch", "minor", "major"].includes(command)) {
    nextVersion = bumpVersion(rootManifest.version, command);
  } else {
    throw new Error(
      "Unknown command. Use check, sync, build, patch, minor, major, or set <x.y.z>.",
    );
  }

  if (nextVersion === rootManifest.version) {
    console.log(`[version] version is already ${nextVersion}; no changes made.`);
    return;
  }

  const previousVersion = rootManifest.version;
  rootManifest.version = nextVersion;
  rootManifest.eotion.buildNumber += 1;
  await writeJson(rootManifestPath, rootManifest);
  const changed = await syncWorkspaceVersions(nextVersion, manifestPaths);

  console.log(
    `[version] Eotion ${previousVersion} -> ${nextVersion}; build ${rootManifest.eotion.buildNumber}.`,
  );
  console.log(
    changed.length === 0
      ? "[version] workspace package versions already matched."
      : `[version] synced: ${changed.join(", ")}`,
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
