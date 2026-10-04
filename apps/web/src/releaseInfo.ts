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
    releasedAt: '2026-10-04',
    highlights: Object.freeze([
      'Quiet Studio 产品界面',
      'Workspace / Page Tree',
      'Local-first 文档编辑与同步',
      '图片与文件附件',
      '设置、主题与跨端基础',
      'Desktop / Mobile 原生宿主基础',
    ]),
  }),
])

export function releaseNotesFor(version: string): ReleaseNote | null {
  return RELEASE_NOTES.find((note) => note.version === version) ?? null
}
