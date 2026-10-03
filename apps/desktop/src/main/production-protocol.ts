import { realpath, readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Session } from 'electron'

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}
const SAFE_API_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

export function parseDesktopApiOrigin(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('EOTION_DESKTOP_API_ORIGIN must be an HTTPS origin')
  }

  if (
    url.protocol !== 'https:' ||
    (value !== url.origin && value !== `${url.origin}/`) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('EOTION_DESKTOP_API_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment')
  }

  return url
}

function isWithinRoot(root: string, filePath: string): boolean {
  const pathFromRoot = relative(root, filePath)
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
}

function response(status: number, body?: Uint8Array | null, headers?: Record<string, string>): Response {
  return new Response(body, { status, headers })
}

async function serveRendererFile(request: Request, rendererRoot: string, pathname: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return response(405, null, { Allow: 'GET, HEAD' })
  }

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return response(404)
  }
  if (decodedPath.includes('\0') || decodedPath.includes('\\')) return response(404)

  const assetPath = decodedPath === '/' ? '/index.html' : decodedPath
  const root = resolve(rendererRoot)
  const candidate = resolve(root, `.${assetPath}`)
  if (!isWithinRoot(root, candidate)) return response(404)

  try {
    const actualPath = await realpath(candidate)
    if (!isWithinRoot(await realpath(root), actualPath) || !(await stat(actualPath)).isFile()) {
      return response(404)
    }
    const contents = await readFile(actualPath)
    return response(200, request.method === 'HEAD' ? null : contents, {
      'Content-Type': MIME_TYPES[extname(actualPath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': String(contents.byteLength),
      'X-Content-Type-Options': 'nosniff',
    })
  } catch {
    return response(404)
  }
}

export async function registerProductionProtocol(
  session: Session,
  rendererRoot: string,
  apiOriginValue: string,
): Promise<URL> {
  const apiOrigin = parseDesktopApiOrigin(apiOriginValue)
  await session.protocol.handle('https', async (request) => {
    const url = new URL(request.url)
    // Guard every intercepted HTTPS request so a foreign-origin redirect cannot reach API transport.
    const initiatorOrigin = (request as Request & { initiatorOrigin?: string }).initiatorOrigin
    if (initiatorOrigin !== undefined && initiatorOrigin !== apiOrigin.origin) return response(403)

    if (url.origin === apiOrigin.origin) {
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const method = request.method.toUpperCase()
        if (initiatorOrigin === undefined && !SAFE_API_METHODS.has(method)) return response(403)

        const headers = new Headers(request.headers)
        if (!SAFE_API_METHODS.has(method)) {
          const requestOrigin = headers.get('origin')
          if (requestOrigin !== null && requestOrigin !== apiOrigin.origin) return response(403)
          // Main-process fetch omits Origin; preserve the API guard after checking the initiator.
          headers.set('origin', apiOrigin.origin)
        }

        return session.fetch(request, {
          bypassCustomProtocolHandlers: true,
          credentials: 'include',
          headers,
          redirect: 'error',
        })
      }
      return serveRendererFile(request, rendererRoot, url.pathname)
    }

    return session.fetch(request, { bypassCustomProtocolHandlers: true })
  })
  return apiOrigin
}
