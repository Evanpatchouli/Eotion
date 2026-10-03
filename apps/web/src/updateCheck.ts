export interface BuildInfoSnapshot {
  version: string
  buildNumber: number
}

export type UpdateCheckResult =
  | { kind: 'update-available'; version: string }
  | { kind: 'build-available'; version: string; buildNumber: number }
  | { kind: 'up-to-date' }
  | { kind: 'ahead' }
  | { kind: 'failed' }

interface ParsedVersion {
  parts: [number, number, number]
  prerelease: string | null
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(value.trim())
  if (!match) return null
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? null,
  }
}

/** 比较 SemVer，忽略 build metadata；无法解析时视为相同。 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0
  for (let index = 0; index < a.parts.length; index += 1) {
    if (a.parts[index]! !== b.parts[index]!) return a.parts[index]! - b.parts[index]!
  }
  if (a.prerelease === b.prerelease) return 0
  if (a.prerelease === null) return 1
  if (b.prerelease === null) return -1
  return a.prerelease.localeCompare(b.prerelease)
}

/** 只比较版本与构建号，不触发下载或安装。 */
export function checkForUpdate(local: BuildInfoSnapshot, remote: BuildInfoSnapshot): UpdateCheckResult {
  const comparison = compareVersions(remote.version, local.version)
  if (comparison > 0) return { kind: 'update-available', version: remote.version }
  if (comparison < 0) return { kind: 'ahead' }
  if (remote.buildNumber > local.buildNumber) return { kind: 'build-available', version: remote.version, buildNumber: remote.buildNumber }
  if (remote.buildNumber < local.buildNumber) return { kind: 'ahead' }
  return { kind: 'up-to-date' }
}

export function describeUpdateCheck(result: UpdateCheckResult): string {
  switch (result.kind) {
    case 'update-available': return `发现新版本 ${result.version}`
    case 'build-available': return `发现新构建 ${result.version} · Build ${result.buildNumber}`
    case 'up-to-date': return '已是最新版本'
    case 'ahead': return '当前版本已是较新版本'
    case 'failed': return '检查更新失败，请稍后重试'
  }
}
