import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = 7141
const clientId = 'eotion-real-sync-test'
const clientSecret = 'synthetic-test'
const objects = new Map()
const contentTypes = new Map()
let failNextDelete = false

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function authenticated(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  return token === `test-token:${clientId}`
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`)

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { ok: true })
  }
  if (request.method === 'GET' && url.pathname === '/__test/objects') {
    return sendJson(response, 200, { count: objects.size, objectKeys: [...objects.keys()] })
  }
  if (request.method === 'POST' && url.pathname === '/__test/fail-next-delete') {
    failNextDelete = true
    return sendJson(response, 200, { armed: true })
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/token') {
    const bytes = await readBody(request)
    let body
    try { body = JSON.parse(bytes.toString('utf8')) } catch { return sendJson(response, 400, { message: 'Invalid token request' }) }
    const requestedClient = request.headers['x-client-id']
    const expected = createHmac('sha256', clientSecret).update(clientId).digest('base64url')
    const actual = typeof body.sign === 'string' ? Buffer.from(body.sign) : Buffer.alloc(0)
    const expectedBytes = Buffer.from(expected)
    if (requestedClient !== clientId || actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) {
      return sendJson(response, 401, { message: 'Invalid client signature' })
    }
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    return sendJson(response, 200, {
      tokenType: 'Bearer',
      accessToken: `test-token:${clientId}`,
      expiresAt: expiresAt.toISOString(),
      expiresIn: 3600,
      clientId,
    })
  }

  if (url.pathname.startsWith('/objects/')) {
    if (request.method !== 'GET') return sendJson(response, 405, { message: 'Method not allowed' })
    const key = decodeURIComponent(url.pathname.slice('/objects/'.length))
    const bytes = objects.get(key)
    if (!bytes) return sendJson(response, 404, { message: 'Object not found' })
    response.writeHead(200, { 'content-type': contentTypes.get(key) ?? 'application/octet-stream', 'content-length': bytes.length, 'cache-control': 'no-store' })
    return response.end(bytes)
  }

  if (!authenticated(request)) return sendJson(response, 401, { message: 'Unauthorized' })

  if (request.method === 'POST' && url.pathname === '/api/oss/upload-stream') {
    const key = request.headers['x-object-key']
    if (typeof key !== 'string' || !key || key.split('/').some((part) => part === '.' || part === '..')) {
      await readBody(request)
      return sendJson(response, 400, { message: 'Invalid object key' })
    }
    const bytes = await readBody(request)
    const objectKey = key.startsWith(`${clientId}/`) ? key : `${clientId}/${key}`
    objects.set(objectKey, bytes)
    contentTypes.set(objectKey, typeof request.headers['content-type'] === 'string' ? request.headers['content-type'] : 'application/octet-stream')
    return sendJson(response, 200, { objectKey, url: `http://${host}:${port}/objects/${encodeURIComponent(objectKey)}`, bucket: 'eotion-real-sync-test' })
  }

  if (request.method === 'DELETE' && url.pathname === '/api/oss/object') {
    const bytes = await readBody(request)
    let body
    try { body = JSON.parse(bytes.toString('utf8')) } catch { return sendJson(response, 400, { message: 'Invalid delete request' }) }
    if (typeof body.objectKey !== 'string' || !body.objectKey) return sendJson(response, 400, { message: 'Invalid object key' })
    if (failNextDelete) {
      failNextDelete = false
      return sendJson(response, 503, { message: 'Synthetic object delete failure' })
    }
    objects.delete(body.objectKey)
    contentTypes.delete(body.objectKey)
    return sendJson(response, 200, { objectKey: body.objectKey, deleted: true, clientId })
  }

  return sendJson(response, 404, { message: 'Unknown route' })
})

server.listen(port, host)
server.on('error', (error) => {
  process.stderr.write(`fake OSS server failed: ${error.message}\n`)
  process.exitCode = 1
})
