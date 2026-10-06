import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const stamp = '2026-10-11T00:00:00.000Z'
const user: AuthUserDto = { id: 'rules-user', email: 'rules@example.com', createdAt: stamp, updatedAt: stamp }
const workspace: WorkspaceResponse = { id: 'rules-ws', name: 'Rules space', ownerId: user.id, createdAt: stamp, updatedAt: stamp }
const pageRecord: PageResponse = {
  id: 'rules-page', workspaceId: workspace.id, parentPageId: null, title: 'Rules',
  orderKey: '0000000000000001', createdAt: stamp, updatedAt: stamp,
}

async function installApi(page: Page, blocks: BlockResponse[]) {
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/auth/me') return json(route, user)
    if (path === '/api/workspaces') return json(route, [workspace])
    if (path === '/api/sync/workspaces/' + workspace.id + '/snapshot') return json(route, { pages: [pageRecord], blocks })
    if (path === '/api/sync/operations') {
      const operation = request.postDataJSON() as { id: string; kind: string; payload: any }
      const payload = operation.payload
      if (operation.kind === 'block.upsert') {
        const record = { ...payload, workspaceId: workspace.id, parentBlockId: payload.parentBlockId ?? null, createdAt: stamp, updatedAt: stamp } as BlockResponse
        const index = blocks.findIndex((block) => block.id === record.id)
        if (index < 0) blocks.push(record)
        else blocks[index] = record
      } else if (operation.kind === 'block.move') {
        const block = blocks.find((item) => item.id === payload.id)
        if (block) Object.assign(block, { parentBlockId: payload.parentBlockId ?? null, orderKey: payload.orderKey })
      } else if (operation.kind === 'block.delete') {
        const index = blocks.findIndex((block) => block.id === payload.id)
        if (index >= 0) blocks.splice(index, 1)
      }
      return json(route, { id: operation.id, status: 'applied' })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  })
}

const body = (page: Page) => page.locator('.eotion-editor-content .tiptap')
const saved = () => body

async function pasteHtml(page: Page, html: string) {
  await page.evaluate((value) => {
    const target = document.querySelector('.eotion-editor-content .tiptap')!
    const transfer = new DataTransfer()
    transfer.setData('text/html', value)
    transfer.setData('text/plain', 'pasted')
    target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
  }, html)
}

/** Types a tail marker and requires it to reach the server, proving the page still saves. */
async function expectStillSaveable(page: Page, blocks: BlockResponse[], marker: string) {
  const editor = body(page)
  await editor.locator(':scope > p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(marker)
  await expect.poll(() => JSON.stringify(blocks), { timeout: 5000 }).toContain(marker)
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
}

test('pasted list and quote content is repaired to the block registry instead of making the page unsaveable', async ({ page }) => {
  const blocks: BlockResponse[] = []
  await installApi(page, blocks)
  await page.goto('/#/app/rules-ws/page/rules-page')
  const editor = body(page)
  await expect(editor).toBeVisible()
  await editor.locator(':scope > p').first().click()

  // A list item holding a heading is common in pasted HTML. The editor schema only
  // accepts the registry's listItem children, so the heading is lifted out instead
  // of producing a node the codec and the server would refuse forever.
  await pasteHtml(page, '<ul><li><p>item a</p><h2>lifted heading</h2></li></ul>')
  await expect(editor.locator('li h2')).toHaveCount(0)
  await expect(editor.locator('h2')).toHaveText('lifted heading')
  await expect(editor.locator('ul li p')).toHaveText('item a')
  await expectStillSaveable(page, blocks, 'TAIL-A')

  // Markdown input rules must not build the same invalid nesting.
  await editor.locator(':scope > p').last().click()
  await page.keyboard.press('Home')
  await page.keyboard.type('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '项目列表', exact: true }).click()
  await page.keyboard.type('typed item')
  await page.keyboard.press('Enter')
  await page.keyboard.type('# ')
  await page.keyboard.type('not a heading')
  await expect(editor.locator('li h1, li h2, li h3')).toHaveCount(0)
  await expectStillSaveable(page, blocks, 'TAIL-B')

  // A quote may only contain the block types the registry declares.
  await pasteHtml(page, '<blockquote><p>quoted</p><table><tbody><tr><td>cell</td></tr></tbody></table></blockquote>')
  await expect(editor.locator('blockquote table')).toHaveCount(0)
  await expectStillSaveable(page, blocks, 'TAIL-C')

  // Every saved block is a document the codec can reload: reloading the page keeps
  // all of the above content instead of failing closed.
  await page.reload()
  await expect(editor.locator('h2')).toHaveText('lifted heading')
  await expect(editor.getByText('TAIL-A', { exact: false })).toBeVisible()
  await expect(editor.getByText('TAIL-C', { exact: false })).toBeVisible()
})

test('pasted attributes stay inside the block registry instead of making the page unsaveable', async ({ page }) => {
  const blocks: BlockResponse[] = []
  await installApi(page, blocks)
  await page.goto('/#/app/rules-ws/page/rules-page')
  const editor = body(page)
  await expect(editor).toBeVisible()
  await editor.locator(':scope > p').first().click()

  // Ordered lists carry no style variant and never a non-integer start: the codec
  // and MCP read accept only a null type and a safe positive integer.
  await pasteHtml(page, '<ol type="A"><li>alpha</li></ol>')
  await expect(editor.locator('ol')).toHaveCount(1)
  await expectStillSaveable(page, blocks, 'TAIL-D')
  // Separate the two lists so the second paste cannot merge into the first one.
  await editor.locator(':scope > p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await pasteHtml(page, '<ol start="abc"><li>beta</li></ol>')
  await expect(editor.locator('ol')).toHaveCount(2)
  await expectStillSaveable(page, blocks, 'TAIL-E')
  const ordered = blocks.filter((block) => block.type === 'numbered-list')
  expect(ordered).toHaveLength(2)
  for (const block of ordered) {
    const attrs = ((block.props as any).node.attrs ?? {}) as Record<string, unknown>
    expect(attrs.type === undefined || attrs.type === null).toBe(true)
    expect(Number.isSafeInteger(attrs.start)).toBe(true)
    expect(attrs.start as number).toBeGreaterThan(0)
  }

  // A merged pasted table keeps valid spans: an odd HTML span is normalized to 1
  // instead of persisting a value the grid validator would reject.
  await pasteHtml(page, '<table><tbody><tr><td colspan="2">merged</td><td colspan="abc">odd</td></tr></tbody></table>')
  await expect(editor.locator('table')).toHaveCount(1)
  await expectStillSaveable(page, blocks, 'TAIL-F')
  const pastedTable = blocks.find((block) => block.type === 'table')!
  const cells = ((pastedTable.props as any).node.content[0].content ?? []) as any[]
  expect(cells.map((cell) => cell.attrs.colspan)).toEqual([2, 1])
  expect(cells.map((cell) => cell.attrs.rowspan)).toEqual([1, 1])
  expect(cells.every((cell) => cell.attrs.colwidth === null || cell.attrs.colwidth === undefined)).toBe(true)

  // Pasted HTML cannot inject a server block id.
  await pasteHtml(page, '<p blockid="injected-identity">identity</p>')
  await expect.poll(() => blocks.some((block) => block.id === 'injected-identity'), { timeout: 5000 }).toBe(false)
  await expectStillSaveable(page, blocks, 'TAIL-G')

  await page.reload()
  await expect(editor.locator('ol')).toHaveCount(2)
  await expect(editor.locator('table')).toHaveCount(1)
  await expect(editor.getByText('TAIL-G', { exact: false })).toBeVisible()
  expect(blocks.some((block) => block.id === 'injected-identity')).toBe(false)
})
