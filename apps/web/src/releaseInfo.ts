/**
 * 当前发行版本的静态元数据。版本号只作为 key 使用，展示值始终取自 `EOTION_BUILD_INFO.version`。
 * 只记录仓库当前已经实际实现的能力，不写未来规划。
 */
export interface ReleaseNote {
  readonly version: string
  readonly releasedAt: string
  readonly highlights: readonly string[]
}

export const RELEASE_NOTES: readonly ReleaseNote[] = Object.freeze([
  Object.freeze({
    version: '0.0.1-beta',
    releasedAt: '2026-10-11',
    highlights: Object.freeze([
      'Quiet Studio 产品界面与 Local-first 文档编辑',
      'Workspace / Page Tree、图片与文件附件',
      '高级文档区块：Callout、嵌套内容与 Table',
      'Database：多表格视图、筛选、排序与列配置',
      'Database 高级属性：Relation、Rollup 与 Formula',
      '原生 MCP：搜索、阅读、创建与更新文档',
      'Windows Desktop 与 Android / HarmonyOS 移动宿主基础',
    ]),
  }),
])

export function releaseNotesFor(version: string): ReleaseNote | null {
  return RELEASE_NOTES.find((note) => note.version === version) ?? null
}
