# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> R2 closing a record cancels the pending initial body focus callback
- Location: ..\..\AppData\Local\Temp\eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d\autofocus-candidate\focus-regression\product-database.spec.ts:12360:5

# Error details

```
Error: page.evaluate: TypeError: Cannot read properties of null (reading 'commands')
    at get commands (http://127.0.0.1:7173/node_modules/.vite/deps/dist-B8qYCS5K.js?v=8eb5255f:6728:30)
    at Object.callback (http://127.0.0.1:7173/src/components/editor/EotionEditor.vue?t=1792491860773:228:68)
    at target.__r2FlushFocusFrames (eval at evaluate (:311:30), <anonymous>:24:44)
    at eval (eval at evaluate (:311:30), <anonymous>:1:14)
    at UtilityScript.evaluate (<anonymous>:313:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - complementary "工作区导航" [ref=e5]:
    - generic [ref=e6]:
      - strong [ref=e8]: Eotion
      - generic [ref=e9]:
        - generic "Database user" [ref=e10]
        - generic "database@example.com" [ref=e11]
      - button "收起侧边栏" [ref=e12] [cursor=pointer]
    - generic [ref=e15]:
      - generic [ref=e16]: 工作区
      - generic [ref=e18]:
        - generic [aria-hidden] [ref=e19]: D
        - generic [ref=e20]: Database workspace
        - button "切换工作区" [ref=e21] [cursor=pointer]
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]: 页面
        - button "新建根页面" [ref=e28] [cursor=pointer]
      - tree "页面树" [ref=e31]:
        - treeitem [level=1] [selected] [ref=e32]:
          - generic [ref=e35]:
            - button "展开Database references的子项" [ref=e37] [cursor=pointer]
            - button "Database references" [ref=e40] [cursor=pointer]
            - button "页面操作：Database references" [ref=e43] [cursor=pointer]
    - generic [ref=e46]:
      - button "设置" [ref=e48] [cursor=pointer]
      - button "退出登录" [ref=e52] [cursor=pointer]
  - main [ref=e55]:
    - generic [ref=e56]:
      - generic [ref=e57]: Database workspace / Database references
      - status [ref=e58]: 已同步
    - article [ref=e60]:
      - generic [ref=e61]:
        - paragraph [ref=e62]: Database workspace
        - heading "Database references" [level=1] [ref=e64]
        - region "Tiptap 编辑器" [ref=e65]:
          - button "选择图片附件" [ref=e66]
          - button "选择文件附件" [ref=e67]
          - textbox "页面正文编辑区域" [ref=e69]:
            - generic:
              - button "在数据库区块下方插入区块" [ref=e70] [cursor=pointer]
              - button "拖动区块" [ref=e72]
            - generic "数据库视图" [ref=e80]:
              - generic [ref=e81]:
                - strong [ref=e86]: Root projects
                - generic [ref=e87]:
                  - button "切换视图" [ref=e89] [cursor=pointer]:
                    - generic [ref=e90]: 表格视图
                  - button "数据库设置" [ref=e94] [cursor=pointer]
                - button "新建记录" [ref=e97] [cursor=pointer]
              - region "数据库记录" [ref=e101]:
                - table [ref=e102]:
                  - rowgroup [ref=e103]:
                    - row [ref=e104]:
                      - columnheader "名称 属性设置 名称" [ref=e105]:
                        - generic [ref=e106]:
                          - generic [ref=e107]: 名称
                          - button "属性设置 名称" [ref=e109] [cursor=pointer]
                      - columnheader "Notes 属性设置 Notes" [ref=e112]:
                        - generic [ref=e113]:
                          - generic [ref=e114]: Notes
                          - button "属性设置 Notes" [ref=e116] [cursor=pointer]
                      - columnheader "Points 属性设置 Points" [ref=e119]:
                        - generic [ref=e120]:
                          - generic [ref=e121]: Points
                          - button "属性设置 Points" [ref=e123] [cursor=pointer]
                      - columnheader "Done 属性设置 Done" [ref=e126]:
                        - generic [ref=e127]:
                          - generic [ref=e128]: Done
                          - button "属性设置 Done" [ref=e130] [cursor=pointer]
                      - columnheader "Status 属性设置 Status" [ref=e133]:
                        - generic [ref=e134]:
                          - generic [ref=e135]: Status
                          - button "属性设置 Status" [ref=e137] [cursor=pointer]
                      - columnheader "Due 属性设置 Due" [ref=e140]:
                        - generic [ref=e141]:
                          - generic [ref=e142]: Due
                          - button "属性设置 Due" [ref=e144] [cursor=pointer]
                  - rowgroup [ref=e147]:
                    - row [ref=e148]:
                      - cell [ref=e149]:
                        - generic [ref=e150]:
                          - button "编辑名称：Identity row" [ref=e151] [cursor=pointer]: Identity row
                          - button "打开记录：Identity row" [active] [ref=e152] [cursor=pointer]
                      - cell [ref=e155]:
                        - button [ref=e156] [cursor=pointer]
                      - cell [ref=e157]:
                        - button [ref=e158] [cursor=pointer]
                      - cell [ref=e159]:
                        - button [ref=e160] [cursor=pointer]
                      - cell [ref=e161]:
                        - button [ref=e162] [cursor=pointer]
                      - cell [ref=e163]:
                        - button "编辑Due：" [ref=e164] [cursor=pointer]
```