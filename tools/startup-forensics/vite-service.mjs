import { createRequire } from 'node:module';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const stream = createWriteStream(path.join(process.env.FORENSICS_ROOT, 'vite-events.jsonl'), { flags: 'a' });
const emit = (kind, data) => stream.write(JSON.stringify({ time: new Date().toISOString(), kind, ...data }) + '\n');
const server = await createServer({
  configFile: path.resolve('vite.config.ts'),
  plugins: [{
    name: 'startup-forensics-observation', enforce: 'pre',
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        const start = performance.now();
        emit('request', { url: req.url, method: req.method });
        res.once('finish', () => emit('finish', { url: req.url, status: res.statusCode, durationMs: performance.now() - start }));
        res.once('close', () => { if (!res.writableFinished) emit('aborted', { url: req.url, durationMs: performance.now() - start }); });
        next();
      });
    },
    transform(code, id) { if (id.includes('webRuntimePreferences') || /\/src\/(main|theme|router|App)[./]/.test(id.replaceAll('\\', '/'))) emit('transform', { id, bytes: Buffer.byteLength(code) }); return null; },
  }],
});
await server.listen();
const listeningAddress = server.httpServer?.address();
if (!listeningAddress || typeof listeningAddress === 'string' || listeningAddress.port !== Number(process.env.VITE_PORT)) {
  await server.close();
  throw new Error(`Diagnostic Vite did not acquire requested port ${process.env.VITE_PORT}`);
}
emit('listening', { pid: process.pid, addresses: server.resolvedUrls });
console.log('FORENSICS_VITE_READY', process.pid);
process.on('message', async (message) => {
  if (message === 'stop') { await server.close(); stream.end(() => process.exit(0)); }
});
