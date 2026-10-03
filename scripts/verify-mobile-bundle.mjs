import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Reuse the actual encoder installed by Vue Lynx; no extra runtime or package dependency.
export async function verifyMobileBundle(bundlePath, expectedUrl) {
  const vueRequire = createRequire(realpathSync(join(root, 'apps/mobile/node_modules/vue-lynx/package.json')));
  const encoderRequire = createRequire(vueRequire.resolve('@lynx-js/template-webpack-plugin/package.json'));
  const { decode_wasm } = encoderRequire('@lynx-js/tasm');
  const decoded = await decode_wasm(readFileSync(bundlePath));
  const source = JSON.stringify(decoded);
  if (!source.includes(expectedUrl) || !source.includes('webview') || !source.includes('eotionRuntime=mobile-webview')) {
    throw new Error('Lynx bundle verification failed: expected Web URL, WebView, or runtime marker missing.');
  }
  console.info(`[mobile] decoded local Lynx bundle: engine ${decoded['engine-version']}, expected Web URL present`);
}
