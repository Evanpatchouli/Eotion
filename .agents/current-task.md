# Current Task — P5.8.4 Touch Editing Experience

## Scope

仅收敛 Mobile / coarse pointer 底部编辑工具栏和 Mobile Page 标题密度，不修改命令、编辑器业务、附件生命周期、同步或 Desktop fixed toolbar。

## Work Units

- S0 investigate：定位现有工具栏、标题布局、viewport/safe-area 与视觉回归入口。
- S2 decide：沿用原七项顺序与命令；图标和短标签表达、格式 selected 状态、Mobile 纵向标题。
- S1 execute：局部调整模板/CSS，补充移动端视觉与交互契约测试、同步设计文档。
- S0 verify / Review：运行 Web typecheck、build 和相关 Playwright；检查截图、diff 与编码，独立复核并提交。

## Invariants

- `useDocumentEditor`、EditorDocument、blockCodec、BlockIdentity、PagePersistence、LocalStore / Sync、API、Slash、attachment lifecycle 不变。
- Touch Toolbar 不依赖 Desktop fixed toolbar preference；`visualViewport` 和 safe-area 保持原有计算。

## Validation

- Web typecheck、build 通过；`product-editor.spec.ts` 与 `product-attachments.spec.ts` 35/35 通过，覆盖 IME、附件、Desktop fixed toolbar、390px Mobile Light / Dark、短视口、safe-area、键盘 inset 和长标题。
- 截图输出到工作区外的 Codex visualizations 目录并已人工查看；`git diff --check` 与 UTF-8 无 BOM 检查通过。
- 独立 reviewer 发现并复核了键盘保持开启后的末段光标遮挡风险；按 inset 补足滚动空间后，20 次换行和末行可见性定向回归通过；无剩余 blocker。
