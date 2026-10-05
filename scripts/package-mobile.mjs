import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { getEotionBuildInfo } from './build-info.mjs';
import { verifyMobileBundle } from './verify-mobile-bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [platform, format] = process.argv.slice(2);
if (!['android:apk', 'android:aab', 'harmony:hap', 'harmony:app'].includes(`${platform}:${format}`)) {
  throw new Error('Usage: node scripts/package-mobile.mjs android apk|aab / harmony hap|app');
}
if (process.platform !== 'win32') throw new Error('This native build runner currently supports Windows with Android Studio / DevEco Studio.');
const host = join(root, 'apps/mobile-hosts', platform);
const info = getEotionBuildInfo();
const release = join(root, 'release', info.version);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(info.version) || info.buildNumber > 2100000000) {
  throw new Error('Native packages require an x.y.z or x.y.z-prerelease version and buildNumber <= 2100000000.');
}
const webUrl = process.env.EOTION_WEB_URL?.trim() || 'https://eotion.evanpatchouli.space';
const url = new URL(webUrl);
if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
  throw new Error('EOTION_WEB_URL must be an HTTP(S) URL without credentials.');
}
const env = { ...process.env, EOTION_WEB_URL: webUrl, NODE_ENV: 'production' };
const toolchain = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-File', join(root, 'scripts/mobile-toolchain.ps1'), '-Platform', platform], { encoding: 'utf8' }));
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
};
const writeJson = (path, value) => write(path, JSON.stringify(value, null, 2) + '\n');
const copy = (source, target) => { mkdirSync(dirname(target), { recursive: true }); copyFileSync(source, target); };
const run = (exe, args, cwd = host) => execFileSync(exe, args, { cwd, env, stdio: 'inherit' });
const pnpmEntry = process.env.npm_execpath;
if (!pnpmEntry || !existsSync(pnpmEntry)) throw new Error('Run this script through its root pnpm mobile:* command.');

// Explicit process URL wins; local apps/mobile/.env cannot silently change a native package.
console.info(`[mobile] ${platform}/${format}: Eotion ${info.version} build ${info.buildNumber}, Web ${webUrl}`);
if (pnpmEntry.toLowerCase().endsWith('.exe')) run(pnpmEntry, ['build:mobile'], root);
else run(process.execPath, [pnpmEntry, 'build:mobile'], root);
const bundle = join(root, 'apps/mobile/dist/main.lynx.bundle');
if (!existsSync(bundle) || readFileSync(bundle).length === 0) throw new Error('Mobile Lynx bundle is missing or empty.');
await verifyMobileBundle(bundle, webUrl);
const metadata = { ...info, applicationId: 'space.evanpatchouli.eotion', webUrl, bundleSha256: createHash('sha256').update(readFileSync(bundle)).digest('hex') };
const icon = join(root, 'apps/mobile/resources/icon.png');
env.JAVA_HOME = toolchain.javaHome;

let artifact;
let signed = false;
let bundledMetadata;
if (platform === 'android') {
  env.ANDROID_HOME = toolchain.sdk;
  env.ANDROID_SDK_ROOT = toolchain.sdk;
  // Windows JDK NIO uses AF_UNIX sockets for Gradle IPC; some system Temp directories reject connect().
  // Use the JDK's documented socket directory property for launcher and daemon, without system changes.
  const socketDirectory = join(homedir(), '.gradle/eotion-sockets');
  mkdirSync(socketDirectory, { recursive: true });
  env.JAVA_TOOL_OPTIONS = `${env.JAVA_TOOL_OPTIONS || ''} "-Djdk.net.unixdomain.tmpdir=${socketDirectory}"`;
  const generated = join(host, 'app/build/generated/eotion');
  copy(bundle, join(generated, 'assets/main.lynx.bundle'));
  writeJson(join(generated, 'assets/eotion-build.json'), metadata);
  bundledMetadata = join(generated, 'assets/eotion-build.json');
  copy(icon, join(generated, 'res/mipmap-nodpi/app_icon.png'));
  const wrapper = join(host, 'gradlew.bat');
  // Invoke .bat through PowerShell with separate arguments, preserving paths with spaces.
  run('pwsh', ['-NoProfile', '-File', join(root, 'scripts/mobile-gradle.ps1'), '-Wrapper', wrapper,
    '-Task', format === 'apk' ? 'assembleDebug' : 'bundleRelease', '-AllowCleartext', String(url.protocol === 'http:')]);
  artifact = format === 'apk'
    ? join(host, 'app/build/outputs/apk/debug/app-debug.apk')
    : join(host, 'app/build/outputs/bundle/release/app-release.aab');
  signed = format === 'apk';
} else {
  env.NODE_HOME = dirname(toolchain.node);
  env.DEVECO_SDK_HOME = dirname(toolchain.sdk);
  env.HARMONY_SDK_HOME = toolchain.sdk;
  // Windows environment keys are case insensitive; remove duplicates before passing a plain JS object.
  const originalPath = process.env.PATH || process.env.Path || '';
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.Path = [dirname(toolchain.node), join(toolchain.studio, 'tools/ohpm/bin'), originalPath].join(delimiter);
  write(join(host, 'local.properties'), `sdk.dir=${toolchain.sdk.replaceAll('\\', '/') }\n`);
  copy(bundle, join(host, 'entry/src/main/resources/rawfile/main.lynx.bundle'));
  writeJson(join(host, 'entry/src/main/resources/rawfile/eotion-build.json'), metadata);
  bundledMetadata = join(host, 'entry/src/main/resources/rawfile/eotion-build.json');
  copy(icon, join(host, 'AppScope/resources/base/media/app_icon.png'));
  writeJson(join(host, 'AppScope/app.json5'), { app: {
    bundleName: metadata.applicationId, vendor: 'evanpatchouli', versionCode: info.buildNumber,
    versionName: info.version, icon: '$media:app_icon', label: '$string:app_name',
  } });
  const entryPackage = JSON.parse(readFileSync(join(host, 'entry/oh-package.template.json'), 'utf8'));
  writeJson(join(host, 'entry/oh-package.json5'), { ...entryPackage, version: info.version });
  const profilePath = join(host, 'build-profile.json5');
  const profile = JSON.parse(readFileSync(join(host, 'build-profile.template.json'), 'utf8'));
  // IDE signing can be exported to this ignored JSON file; secrets never enter tracked templates.
  const signingPath = process.env.EOTION_HARMONY_SIGNING_CONFIG || join(host, 'signing.local.json');
  if (process.env.EOTION_HARMONY_SIGNING_CONFIG && !existsSync(signingPath)) {
    throw new Error('EOTION_HARMONY_SIGNING_CONFIG points to a missing file. Configure a valid local debug signing JSON.');
  }
  // DevEco's automatic signing writes build-profile.json5. Preserve it before regenerating SDK settings.
  if (!existsSync(signingPath) && !process.env.EOTION_HARMONY_SIGNING_CONFIG && existsSync(profilePath)) {
    const require = createRequire(import.meta.url);
    const json5 = require(join(toolchain.studio, 'tools/hvigor/hvigor-ohos-plugin/node_modules/json5'));
    const previous = json5.parse(readFileSync(profilePath, 'utf8'));
    const selected = previous.app?.products?.find(product => product.name === 'default')?.signingConfig;
    const signing = previous.app?.signingConfigs?.find(config => config.name === selected);
    if (signing) writeJson(signingPath, signing);
  }
  if (existsSync(signingPath)) {
    const signing = JSON.parse(readFileSync(signingPath, 'utf8'));
    for (const key of ['storeFile', 'profile', 'certpath']) {
      if (!signing.material?.[key] || !existsSync(signing.material[key])) {
        throw new Error(`HarmonyOS signing material missing: ${key}. Configure DevEco automatic debug signing.`);
      }
    }
    profile.app.signingConfigs = [signing];
    profile.app.products[0].signingConfig = signing.name;
    signed = true;
  }
  profile.app.products[0].targetSdkVersion = toolchain.sdkVersion;
  writeJson(profilePath, profile);
  run(toolchain.node, [toolchain.ohpm, 'install', '--all']);
  run(toolchain.node, [toolchain.hvigor, '--mode', format === 'app' ? 'project' : 'module', '-p', 'product=default',
    ...(format === 'hap' ? ['-p', 'module=entry@default'] : []), '-p', 'buildMode=debug',
    format === 'app' ? 'assembleApp' : 'assembleHap', '--no-daemon']);
  const output = format === 'hap' ? join(host, 'entry/build/default/outputs/default') : join(host, 'build/outputs/default');
  const candidates = readdirSync(output).filter(name => name.endsWith(`.${format}`) && (signed ? !name.includes('unsigned') : name.includes('unsigned')));
  if (candidates.length !== 1) throw new Error(`Expected one ${signed ? 'signed' : 'unsigned'} .${format} in ${output}; found ${candidates.length}.`);
  artifact = join(output, candidates[0]);
}
if (!existsSync(artifact) || readFileSync(artifact).length === 0) throw new Error(`Native artifact missing or empty: ${artifact}`);
if (format !== 'app') run('pwsh', ['-NoProfile', '-File', join(root, 'scripts/verify-mobile-package.ps1'),
  '-Artifact', artifact, '-Bundle', bundle, '-Icon', icon, '-Metadata', bundledMetadata]);
mkdirSync(release, { recursive: true });
// Unsigned Harmony artifacts carry their status in the name; do not mislabel them as installable.
const target = join(release, `Eotion-${info.version}-${platform}${platform === 'harmony' && !signed ? '-unsigned' : ''}.${format}`);
copyFileSync(artifact, target);
writeJson(target + '.json', { ...metadata, platform, format, signed, artifactSha256: createHash('sha256').update(readFileSync(target)).digest('hex') });
console.info(`[mobile] Release directory: ${release}`);
console.info(`[mobile] ${target} (${signed ? 'test signed' : 'unsigned'}; device installation not verified)`);
