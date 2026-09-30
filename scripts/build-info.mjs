import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const rootManifest = JSON.parse(
  readFileSync(resolve(rootDir, "package.json"), "utf8"),
);

function getGitSha() {
  const configured = process.env.GIT_SHA?.trim();
  if (configured && configured !== "unknown") return configured.slice(0, 12);

  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return configured || "unknown";
  }
}

export function getEotionBuildInfo() {
  const buildNumber = rootManifest.eotion?.buildNumber;
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1) {
    throw new Error("package.json eotion.buildNumber must be a positive integer.");
  }

  return Object.freeze({
    version: rootManifest.version,
    buildNumber,
    gitSha: getGitSha(),
  });
}
