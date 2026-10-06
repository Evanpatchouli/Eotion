import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const stamp = '2026-10-09T00:00:00.000Z'
const user: AuthUserDto = { id: 'table-user', email: 'table@example.com', createdAt: stamp, updatedAt: stamp }
const workspace: WorkspaceResponse = { id: 'table-workspace', name: 'Table space', ownerId: user.id, createdAt: stamp, updatedAt: stamp }
const pageRecord: PageResponse = { id: 'table-page', workspaceId: workspace.id, parentPageId: null, title: 'Table', orderKey: '0001', createdAt: stamp, updatedAt: stamp }
const key = (n: number) => String(n).padStart(30, '0')

type Server = { blocks: BlockResponse[]; offline: boolean; requests: { path: string; kind?: string }[] }

function cellNode(type: 'tableHeader' | 'tableCell', text: string) {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  }
}

/** Seed a table the way the editor persists one: a single block whose props hold the whole grid. */
function tableBlock(id: string, grid: string[][], order: number, parentBlockId: string | null = null): BlockResponse {
  const rows = grid.map((cells, index) => ({
    type: 'tableRow',
    content: cells.map((text) => cellNode(index === 0 ? 'tableHeader' : 'tableCell', text)),
  }))
  return {
    id, workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId, type: 'table', orderKey: key(order),
    props: { node: { type: 'table', content: rows } }, createdAt: stamp, updatedAt: stamp,
  }
}

function paragraph(id: string, text: string, order: number, parentBlockId: string | null = null): BlockResponse {
  return {
    id, workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId, type: 'paragraph', orderKey: key(order),
    props: { node: { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] } }, createdAt: stamp, updatedAt: stamp,
  }
}

function toggle(id: string, text: string, order: number, parentBlockId: string | null = null): BlockResponse {
  return {
    id, workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId, type: 'toggle', orderKey: key(order),
    props: { node: { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }, createdAt: stamp, updatedAt: stamp,
  }
}

function editor(page: Page) { return page.locator('.eotion-editor-content .tiptap') }
function pageUrl() { return `/#/app/${workspace.id}/page/${pageRecord.id}` }

function tableGrid(page: Page) {
  return editor(page).locator('table').first().evaluate((table) => Array.from(table.querySelectorAll('tr'))
    .map((row) => Array.from(row.children).map((cell) => (cell.textContent ?? '').trim())))
}

function savedTable(server: Server) {
  return server.blocks.find((block) => block.type === 'table')
}

/** Read the persisted grid straight from the block props, never from the DOM. */
function tableGridFromProps(server: Server): string[][] {
  const node = (savedTable(server)?.props as any)?.node
  return (node?.content ?? []).map((row: any) => (row.content ?? []).map((cell: any) => (cell.content ?? [])
    .map((cellParagraph: any) => (cellParagraph.content ?? []).map((inline: any) => inline.text ?? '').join('')).join('\n')))
}

/** Select the text of a range of table cells before a clipboard action. */
async function setCellSelection(page: Page, rowFrom: number, cellFrom: number, rowTo: number, cellTo: number) {
  await page.evaluate(({ rowFrom, cellFrom, rowTo, cellTo }) => {
    const table = document.querySelector('.eotion-editor-content .tiptap table')!
    const body = document.querySelector('.eotion-editor-content .tiptap') as HTMLElement
    body.focus()
    const rows = table.querySelectorAll('tr')
    const start = rows[rowFrom]!.children[cellFrom]!.querySelector('p')!.firstChild!
    const end = rows[rowTo]!.children[cellTo]!.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(start, 0)
    range.setEnd(end, (end as Text).length)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }, { rowFrom, cellFrom, rowTo, cellTo })
}

/** Which table cell currently contains the DOM caret. */
async function caretCell(page: Page) {
  return page.evaluate(() => {
    const selection = window.getSelection()
    const node = selection?.anchorNode ?? null
    const element = node instanceof Element ? node : node?.parentElement ?? null
    return { text: (element?.closest('th, td')?.textContent ?? '').trim() }
  })
}

async function installApi(page: Page, server: Server) {
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url()).pathname
    server.requests.push({ path: url, kind: url === '/api/sync/operations' ? request.postDataJSON()?.kind : undefined })
    if (server.offline) return route.abort('internetdisconnected')
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (url === '/api/auth/me') return json(user)
    if (url === '/api/workspaces') return json([workspace])
    if (url === `/api/sync/workspaces/${workspace.id}/snapshot`) return json({ pages: [pageRecord], blocks: server.blocks })
    if (url === '/api/sync/operations') {
      const operation = request.postDataJSON() as { id: string; kind: string; payload: any }
      const payload = operation.payload
      const existing = server.blocks.find((block) => block.id === payload.id)
      if (operation.kind === 'block.move' && existing) Object.assign(existing, { parentBlockId: payload.parentBlockId, orderKey: payload.orderKey })
      if (operation.kind === 'block.upsert') {
        const next = { ...payload, workspaceId: workspace.id, createdAt: existing?.createdAt ?? stamp, updatedAt: stamp }
        server.blocks = server.blocks.filter((block) => block.id !== payload.id).concat(next)
      }
      if (operation.kind === 'block.delete') server.blocks = server.blocks.filter((block) => block.id !== payload.id)
      return json({ id: operation.id, status: 'applied' })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  })
}

const grid3x3 = [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I']]

/** Anchor the contextual menu on a cell position so the grid can change between steps. */
async function openTableMenuAt(page: Page, row: number, cell: number) {
  await editor(page).locator('tr').nth(row).locator('th, td').nth(cell).click()
  const trigger = page.getByRole('button', { name: '表格操作' })
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.getByRole('button', { name: '在下方插入行' })).toBeVisible()
}

test('slash creates one editable table block with a header row and cell navigation', async ({ page }) => {
  const server: Server = { blocks: [], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await body.locator(':scope > p').first().click()
  await page.keyboard.press('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '表格', exact: true }).click()
  await expect(body.locator('table')).toBeVisible()
  await expect(body.locator('th')).toHaveCount(3)
  await expect(body.locator('td')).toHaveCount(6)

  await page.keyboard.type('A1')
  await page.keyboard.press('Tab')
  await page.keyboard.type('B1')
  await page.keyboard.press('Tab')
  await page.keyboard.type('C1')
  await page.keyboard.press('Tab')
  await page.keyboard.type('A2')
  expect(await caretCell(page)).toEqual({ text: 'A2' })
  // Shift+Tab walks back through the previous cells without leaving the table.
  await page.keyboard.press('Shift+Tab')
  expect(await caretCell(page)).toEqual({ text: 'C1' })
  await page.keyboard.press('Shift+Tab')
  expect(await caretCell(page)).toEqual({ text: 'B1' })
  await page.keyboard.press('End')
  await page.keyboard.type('+')
  await expect(body.locator('th').nth(1)).toHaveText('B1+')

  await expect.poll(() => server.blocks.some((block) => block.type === 'table'), { timeout: 5000 }).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  // The whole grid is one block and no cell ever became its own block.
  expect(server.blocks.filter((block) => block.type === 'table')).toHaveLength(1)
  expect(server.blocks.filter((block) => block.parentBlockId !== null)).toHaveLength(0)
  expect(tableGridFromProps(server)[0]).toEqual(['A1', 'B1+', 'C1'])
  expect(tableGridFromProps(server)[1]?.[0]).toBe('A2')

  await page.reload()
  await expect(body.locator('table')).toBeVisible()
  await expect(body.locator('th').first()).toHaveText('A1')
  await expect(body.locator('th').nth(1)).toHaveText('B1+')
  await expect(body.locator('td').first()).toHaveText('A2')
})

test('last cell Tab adds a row and the table keeps its identity across reload', async ({ page }) => {
  const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  await editor(page).locator('tr').nth(2).locator('td').nth(2).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Tab')
  await page.keyboard.type('J')
  await expect.poll(() => tableGridFromProps(server).length, { timeout: 5000 }).toBe(4)
  expect(tableGridFromProps(server)[3]).toEqual(['J', '', ''])
  expect(savedTable(server)?.id).toBe('table-a')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await page.reload()
  await expect(editor(page).locator('tbody tr')).toHaveCount(4)
  await expect(editor(page).getByText('J', { exact: true })).toBeVisible()
})

test('table menu adds and removes rows and columns and deletes the whole table', async ({ page }) => {
  const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())

  await openTableMenuAt(page, 1, 1)
  await page.getByRole('button', { name: '在下方插入行' }).click()
  await expect.poll(() => tableGridFromProps(server).length, { timeout: 5000 }).toBe(4)

  await openTableMenuAt(page, 1, 1)
  await page.getByRole('button', { name: '在右侧插入列' }).click()
  await expect.poll(() => tableGridFromProps(server).every((row) => row.length === 4), { timeout: 5000 }).toBe(true)

  await openTableMenuAt(page, 1, 1)
  await page.getByRole('button', { name: '删除当前列' }).click()
  await expect.poll(() => tableGridFromProps(server).every((row) => row.length === 3), { timeout: 5000 }).toBe(true)

  await openTableMenuAt(page, 1, 0)
  await page.getByRole('button', { name: '删除当前行' }).click()
  await expect.poll(() => tableGridFromProps(server).length, { timeout: 5000 }).toBe(3)
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  expect(savedTable(server)?.id).toBe('table-a')

  // A cursor outside the table hides the contextual menu.
  await editor(page).locator(':scope > p').last().click()
  await expect(page.getByRole('button', { name: '表格操作' })).toHaveCount(0)

  await openTableMenuAt(page, 0, 0)
  await page.getByRole('button', { name: '删除表格' }).click()
  await expect(editor(page).locator('table')).toHaveCount(0)
  await expect.poll(() => server.blocks.some((block) => block.type === 'table'), { timeout: 5000 }).toBe(false)
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await page.reload()
  await expect(editor(page).locator('table')).toHaveCount(0)
})

test('removing the only block of the page replaces the table with a paragraph', async ({ page }) => {
  const server: Server = { blocks: [tableBlock('table-only', grid3x3, 100)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  await openTableMenuAt(page, 0, 0)
  await page.getByRole('button', { name: '删除表格' }).click()
  await expect(editor(page).locator('table')).toHaveCount(0)
  await expect(editor(page).locator(':scope > p')).toHaveCount(1)
  await expect.poll(() => server.blocks.map((block) => block.type), { timeout: 5000 }).toEqual(['paragraph'])
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await page.reload()
  await expect(editor(page).locator('table')).toHaveCount(0)
  await expect(editor(page).locator(':scope > p')).toHaveCount(1)
})

test('copy and paste inside cells and plain/TSV paste never produce an unsaveable document', async ({ page }) => {
  const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', 'Tail', 200)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await expect(body.locator('table')).toBeVisible()

  // Copy one cell's text and paste it into another cell: structure is preserved.
  await setCellSelection(page, 0, 0, 0, 0)
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('A')
  await page.keyboard.press('Control+C')
  await setCellSelection(page, 1, 1, 1, 1)
  await page.keyboard.press('Control+V')
  await expect(body.getByText('E', { exact: true })).toHaveCount(0)
  expect(await tableGrid(page)).toEqual([['A', 'B', 'C'], ['D', 'A', 'F'], ['G', 'H', 'I']])
  await expect.poll(() => tableGridFromProps(server)[1]?.[1], { timeout: 5000 }).toBe('A')

  // Copying a range that spans several cells keeps the grid valid and saveable.
  await setCellSelection(page, 0, 0, 0, 1)
  const copied = await page.evaluate(() => window.getSelection()?.toString() ?? '')
  expect(copied).toContain('A')
  expect(copied).toContain('B')
  await page.keyboard.press('Control+C')
  await expect(body.locator('tbody tr')).toHaveCount(3)
  await expect(body.locator('th')).toHaveCount(3)
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()

  // Pasted tab/newline text stays plain text; it must not fabricate block nodes.
  await body.locator(':scope > p').last().click()
  await page.evaluate(() => {
    const target = document.querySelector('.eotion-editor-content .tiptap')!
    const transfer = new DataTransfer()
    transfer.setData('text/plain', 'X\tY\nZ\tW')
    target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
  })
  await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'tail')?.props ?? {}).includes('X'), { timeout: 5000 }).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  expect(server.blocks.every((block) => ['table', 'paragraph'].includes(block.type))).toBe(true)
  expect(server.blocks.every((block) => block.parentBlockId === null)).toBe(true)
  // The same grid is still intact after all clipboard work.
  await page.reload()
  expect(await tableGrid(page)).toEqual([['A', 'B', 'C'], ['D', 'A', 'F'], ['G', 'H', 'I']])
})

test('a table block drags and reorders without losing its grid or identity', async ({ page }) => {
  const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('before', 'Before', 50), paragraph('after', 'After', 200)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  const handle = body.locator('[data-eotion-drag-handle="table-a"]')
  await expect(handle).toBeAttached()
  await handle.dragTo(body.getByText('Before', { exact: true }), { targetPosition: { x: 10, y: 4 } })
  await expect.poll(() => {
    const roots = server.blocks.filter((block) => !block.parentBlockId).sort((a, b) => a.orderKey.localeCompare(b.orderKey))
    return roots.map((block) => block.id)
  }).toEqual(['table-a', 'before', 'after'])
  expect(savedTable(server)?.id).toBe('table-a')
  await page.reload()
  expect(await tableGrid(page)).toEqual(grid3x3)
})

test('a table nests under a toggle and cell Tab never indents the table block', async ({ page }) => {
  const server: Server = { blocks: [toggle('toggle-a', 'Parent', 100), tableBlock('table-a', grid3x3, 200), paragraph('tail', '', 300)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await body.locator('[data-eotion-drag-handle="table-a"]').dragTo(body.locator('.eotion-toggle'), { targetPosition: { x: 30, y: 16 } })
  await expect.poll(() => savedTable(server)?.parentBlockId).toBe('toggle-a')
  await expect(body.locator('.eotion-toggle table')).toHaveCount(1)
  await page.reload()
  await expect(editor(page).locator('.eotion-toggle table')).toHaveCount(1)

  const headers = editor(page).locator('.eotion-toggle th')
  await expect(headers).toHaveCount(3)
  await headers.first().click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Tab')
  // Tab navigates cells; it must not parent the table to a previous sibling.
  await page.keyboard.press('End')
  await page.keyboard.type('moved')
  await expect(editor(page).locator('.eotion-toggle th').nth(1)).toHaveText('Bmoved')
  expect(savedTable(server)?.parentBlockId).toBe('toggle-a')
})

test('a table created in a toggle summary can be deleted without emptying the toggle', async ({ page }) => {
  const server: Server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  // Creating a table on the summary line makes the table the toggle's only child.
  await body.locator('.eotion-toggle p').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.press('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '表格', exact: true }).click()
  await expect(body.locator('.eotion-toggle table')).toHaveCount(1)
  await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'toggle-a')?.props ?? {}).includes('"table"'), { timeout: 5000 }).toBe(true)

  await openTableMenuAt(page, 0, 0)
  await page.getByRole('button', { name: '删除表格' }).click()
  await expect(body.locator('table')).toHaveCount(0)
  // The toggle keeps exactly one paragraph summary and stays saveable.
  await expect(body.locator('.eotion-toggle p')).toHaveCount(1)
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await expect.poll(() => {
    const node = (server.blocks.find((block) => block.id === 'toggle-a')?.props as any)?.node
    return node?.content?.map((child: any) => child.type)
  }, { timeout: 5000 }).toEqual(['paragraph'])
  await page.reload()
  await expect(editor(page).locator('.eotion-toggle p')).toHaveCount(1)
  await expect(editor(page).locator('table')).toHaveCount(0)
})

test('cell inline marks and hard breaks persist through save and reload', async ({ page }) => {
  const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await body.getByText('E', { exact: true }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' note')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('line two')
  await setCellSelection(page, 1, 1, 1, 1)
  await page.keyboard.press('Control+B')
  await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.type === 'table')?.props ?? {}), { timeout: 5000 }).toContain('bold')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  expect(JSON.stringify(server.blocks.find((block) => block.type === 'table')?.props)).toContain('hardBreak')
  await page.reload()
  const cell = editor(page).locator('tr').nth(1).locator('td').nth(1)
  await expect(cell.locator('strong').first()).toContainText('note')
  await expect(cell).toContainText('line two')
  await expect(cell.locator('br')).toHaveCount(1)
})

test('an oversized pasted table is refused instead of making the page unsaveable', async ({ page }) => {
  const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', 'Tail', 200)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  const pasteTable = (cells: number) => page.evaluate((count) => {
    const target = document.querySelector('.eotion-editor-content .tiptap')!
    const transfer = new DataTransfer()
    transfer.setData('text/html', `<table><tbody><tr>${Array.from({ length: count }, (_, index) => `<td>c${index}</td>`).join('')}</tr></tbody></table>`)
    transfer.setData('text/plain', 'grid')
    target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
  }, cells)

  // The trailing paragraph is the paste target; a normal grid is still accepted.
  await body.locator(':scope > p').last().click()
  await pasteTable(3)
  await expect(body.locator('table')).toHaveCount(2)
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()

  // A grid over the shared cell budget is refused and reported, not saved.
  await body.locator(':scope > p').last().click()
  await pasteTable(201)
  await expect(page.getByRole('alert').filter({ hasText: '表格超出可保存的规模' })).toBeVisible()
  await expect(body.locator('table')).toHaveCount(2)
  await expect.poll(() => server.blocks.filter((block) => block.type === 'table').length).toBe(2)

  // The page stays editable and saveable after the refused paste.
  await body.getByText('Tail', { exact: true }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ok')
  await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'tail')?.props ?? {}), { timeout: 5000 }).toContain('Tail ok')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  expect(tableGridFromProps(server)[0]).toEqual(['A', 'B', 'C'])
})
test('table slash is hidden in quote, list item and cell contexts', async ({ page }) => {
  const server: Server = { blocks: [], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  const menu = page.locator('.p2-slash-menu')
  const option = (name: string) => menu.getByRole('option', { name, exact: true })

  await body.locator(':scope > p').first().click()
  await page.keyboard.press('/')
  await expect(option('表格')).toBeVisible()
  await option('引用').click()
  await body.locator('blockquote p').first().click()
  await page.keyboard.press('/')
  await expect(menu).toBeVisible()
  await expect(option('表格')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await body.locator(':scope > p').last().click()
  await page.keyboard.press('/')
  await option('项目列表').click()
  await body.locator('ul li p').first().click()
  await page.keyboard.press('/')
  await expect(menu).toBeVisible()
  await expect(option('表格')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Inside a table cell the slash menu only offers commands the cell accepts.
  await body.locator(':scope > p').last().click()
  await page.keyboard.press('/')
  await option('表格').click()
  await expect(body.locator('table')).toBeVisible()
  await body.locator('th').first().click()
  await page.keyboard.press('/')
  await expect(menu).toBeVisible()
  await expect(option('表格')).toHaveCount(0)
  await expect(option('一级标题')).toHaveCount(0)
})

test.describe('390px table layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a wide table scrolls inside its wrapper and keeps the page and cells usable', async ({ page }) => {
    const wide = [['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'], ['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['h', 'i', 'j', 'k', 'l', 'm', 'n']]
    const server: Server = { blocks: [tableBlock('table-wide', wide, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
    await installApi(page, server)
    await page.goto(pageUrl())
    const body = editor(page)
    await expect(body.locator('table')).toBeVisible()
    const metrics = await body.locator('.tableWrapper').evaluate((wrapper) => ({
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      wrapperScrolls: wrapper.scrollWidth > wrapper.clientWidth,
      clientWidth: wrapper.clientWidth,
    }))
    expect(metrics.pageOverflow).toBe(false)
    expect(metrics.wrapperScrolls).toBe(true)
    expect(metrics.clientWidth).toBeLessThanOrEqual(390)
    // Columns stay readable instead of being squeezed.
    const cellWidth = await body.locator('th').first().evaluate((cell) => cell.getBoundingClientRect().width)
    expect(cellWidth).toBeGreaterThanOrEqual(100)
    await body.locator('th').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('!')
    await expect(body.locator('th').first()).toHaveText('C1!')
    await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' })).toBeVisible()
    await expect.poll(() => tableGridFromProps(server)[0]?.[0], { timeout: 5000 }).toBe('C1!')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test('a 20x10 table stays editable and saves a single block', async ({ page }) => {
  const big = Array.from({ length: 20 }, (_, row) => Array.from({ length: 10 }, (_, column) => `${row}-${column}`))
  big[0] = Array.from({ length: 10 }, (_, column) => `H${column}`)
  const server: Server = { blocks: [tableBlock('table-big', big, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await expect(body.locator('table')).toBeVisible()
  await body.locator('tr').nth(9).locator('td').nth(9).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' end')
  await expect.poll(() => tableGridFromProps(server)[9]?.[9], { timeout: 10000 }).toBe('9-9 end')
  expect(server.blocks.filter((block) => block.type === 'table')).toHaveLength(1)
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await page.reload()
  await expect(editor(page).locator('tbody tr')).toHaveCount(20)
})

test('offline table edits survive reload and push before the snapshot pull', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'eotion-table-'))
  const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  let context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
  try {
    let page = context.pages()[0] ?? await context.newPage()
    await installApi(page, server)
    await page.goto(pageUrl())
    await expect(editor(page).getByText('E', { exact: true })).toBeVisible()
    server.offline = true
    await editor(page).locator('tr').nth(1).locator('td').nth(1).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' offline')
    await openTableMenuAt(page, 1, 1)
    await page.getByRole('button', { name: '在下方插入行' }).click()
    const pending = () => page.evaluate(async () => {
      const { useProductSyncStore } = await import('/src/stores/productSync.ts')
      return (await (await useProductSyncStore().store()).getPendingOperations()).length
    })
    await expect.poll(pending).toBeGreaterThan(0)
    await page.reload()
    await expect(editor(page).getByText('E offline', { exact: true })).toBeVisible()
    await expect(editor(page).locator('tbody tr')).toHaveCount(4)

    await context.close()
    context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
    page = context.pages()[0] ?? await context.newPage()
    await installApi(page, server)
    await page.goto(pageUrl())
    await expect(editor(page).getByText('E offline', { exact: true })).toBeVisible()
    const reconnectAt = server.requests.length
    server.offline = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => tableGridFromProps(server)[1]?.[1], { timeout: 10000 }).toBe('E offline')
    expect(tableGridFromProps(server).length).toBe(4)
    expect(savedTable(server)?.id).toBe('table-a')
    await expect.poll(pending).toBe(0)
    const after = server.requests.slice(reconnectAt)
    expect(after.findIndex((request) => request.kind === 'block.upsert')).toBeGreaterThanOrEqual(0)
    expect(after.findIndex((request) => request.path.endsWith('/snapshot'))).toBeGreaterThan(after.findIndex((request) => request.kind === 'block.upsert'))
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true })
  }
})
