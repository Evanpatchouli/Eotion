const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const test = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  module._compile(compiled, filename)
}

const { parseDesktopApiOrigin, registerProductionProtocol } = require('./production-protocol.ts')

function mockSession(fetch = async () => new Response('remote')) {
  let handler
  const requests = []
  const options = []
  return {
    session: {
      protocol: {
        handle: async (scheme, callback) => {
          assert.equal(scheme, 'https')
          handler = callback
        },
      },
      fetch: async (request, init) => {
        requests.push(request)
        options.push(init)
        return fetch(request, init)
      },
    },
    requests,
    options,
    request: (request) => handler(request),
  }
}

function setInitiatorOrigin(request, initiatorOrigin) {
  Object.defineProperty(request, 'initiatorOrigin', { value: initiatorOrigin })
  return request
}

test('production API origin accepts only a strict HTTPS origin', () => {
  assert.equal(parseDesktopApiOrigin('https://app.example.com').origin, 'https://app.example.com')
  assert.equal(parseDesktopApiOrigin('https://app.example.com/').origin, 'https://app.example.com')
  for (const value of [
    'http://app.example.com',
    'https://user@app.example.com',
    'https://app.example.com/path',
    'https://app.example.com/?',
    'https://app.example.com/#',
    'not a URL',
  ]) {
    assert.throws(() => parseDesktopApiOrigin(value), /EOTION_DESKTOP_API_ORIGIN/)
  }
})

test('same-origin renderer serves index and assets with MIME types, and rejects misses or unsupported methods', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eotion-protocol-'))
  const rendererRoot = join(directory, 'renderer')
  mkdirSync(join(rendererRoot, 'assets'), { recursive: true })
  writeFileSync(join(rendererRoot, 'index.html'), '<main>desktop</main>')
  writeFileSync(join(rendererRoot, 'assets', 'app.js'), 'console.log("desktop")')
  try {
    const mock = mockSession()
    await registerProductionProtocol(mock.session, rendererRoot, 'https://app.example.com')

    const index = await mock.request(new Request('https://app.example.com/'))
    assert.equal(index.status, 200)
    assert.equal(index.headers.get('content-type'), 'text/html; charset=utf-8')
    assert.equal(await index.text(), '<main>desktop</main>')

    const asset = await mock.request(new Request('https://app.example.com/assets/app.js'))
    assert.equal(asset.status, 200)
    assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8')
    assert.equal(await asset.text(), 'console.log("desktop")')

    const missing = await mock.request(new Request('https://app.example.com/missing'))
    assert.equal(missing.status, 404)
    const unsupported = await mock.request(new Request('https://app.example.com/assets/app.js', { method: 'POST' }))
    assert.equal(unsupported.status, 405)
    assert.equal(unsupported.headers.get('allow'), 'GET, HEAD')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('renderer rejects encoded traversal and backslash paths', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eotion-protocol-path-'))
  const rendererRoot = join(directory, 'renderer')
  mkdirSync(rendererRoot)
  writeFileSync(join(directory, 'secret.txt'), 'secret')
  try {
    const mock = mockSession()
    await registerProductionProtocol(mock.session, rendererRoot, 'https://app.example.com')
    for (const path of ['/%2e%2e%2fsecret.txt', '/%5c..%5csecret.txt']) {
      const result = await mock.request(new Request(`https://app.example.com${path}`))
      assert.equal(result.status, 404)
      assert.notEqual(await result.text(), 'secret')
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('API requests forward the original request with session credentials and reject redirects', async () => {
  const mock = mockSession(async () => new Response('api'))
  await registerProductionProtocol(mock.session, 'unused', 'https://app.example.com')
  const request = setInitiatorOrigin(new Request('https://app.example.com/api/pages?limit=1', {
    method: 'POST',
    headers: { Origin: 'https://app.example.com', 'X-Request-Id': 'req-1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'A' }),
  }), 'https://app.example.com')

  const result = await mock.request(request)
  assert.equal(await result.text(), 'api')
  assert.equal(mock.requests[0], request)
  assert.equal(mock.options[0].bypassCustomProtocolHandlers, true)
  assert.equal(mock.options[0].credentials, 'include')
  assert.equal(mock.options[0].redirect, 'error')
  assert.equal(mock.options[0].headers.get('origin'), 'https://app.example.com')
  assert.equal(request.headers.get('x-request-id'), 'req-1')
  assert.equal(await request.clone().text(), JSON.stringify({ title: 'A' }))
})

test('API rejects foreign, null, or missing unsafe initiators without forwarding', async () => {
  const mock = mockSession()
  await registerProductionProtocol(mock.session, 'unused', 'https://app.example.com')
  const foreignPost = setInitiatorOrigin(new Request('https://app.example.com/api/pages', { method: 'POST', body: '{}' }), 'https://evil.example')
  const nullGet = setInitiatorOrigin(new Request('https://app.example.com/api/pages'), 'null')
  const missingDelete = new Request('https://app.example.com/api/pages/1', { method: 'DELETE' })

  for (const request of [foreignPost, nullGet, missingDelete]) {
    assert.equal((await mock.request(request)).status, 403)
  }
  assert.equal(mock.requests.length, 0)
})

test('API rejects an unsafe request with a conflicting Origin header', async () => {
  const mock = mockSession()
  await registerProductionProtocol(mock.session, 'unused', 'https://app.example.com')
  const request = setInitiatorOrigin(new Request('https://app.example.com/api/pages', {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
    body: '{}',
  }), 'https://app.example.com')

  assert.equal((await mock.request(request)).status, 403)
  assert.equal(mock.requests.length, 0)
})

test('other HTTPS origins pass through without changing request credentials or serving renderer files', async () => {
  const mock = mockSession(async () => new Response('remote'))
  await registerProductionProtocol(mock.session, 'unused', 'https://app.example.com')
  const request = setInitiatorOrigin(new Request('https://cdn.example.net/assets/image.png', { credentials: 'omit' }), 'https://app.example.com')
  const result = await mock.request(request)

  assert.equal(await result.text(), 'remote')
  assert.equal(mock.requests[0], request)
  assert.deepEqual(mock.options[0], { bypassCustomProtocolHandlers: true })
})

test('other origins reject foreign initiators before a redirect can reach API transport', async () => {
  const mock = mockSession()
  await registerProductionProtocol(mock.session, 'unused', 'https://app.example.com')
  const request = setInitiatorOrigin(new Request('https://cdn.example.net/api-redirect'), 'https://evil.example')

  assert.equal((await mock.request(request)).status, 403)
  assert.equal(mock.requests.length, 0)
})
