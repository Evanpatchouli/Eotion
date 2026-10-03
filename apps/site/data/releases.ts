import rootManifest from '../../../package.json'
import { RELEASE_NOTES, releaseNotesFor } from '../../web/src/releaseInfo'

/** Public build-time values injected by apps/site/.vitepress/config.ts. */
declare const __EOTION_SITE_ENV__: Readonly<Record<string, string | undefined>>

const env = __EOTION_SITE_ENV__

function optionalUrl(name: string, value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} must be an absolute HTTP(S) URL without credentials`)
  }
  return url.href
}

function optionalOrigin(name: string, value: string | undefined): string | null {
  const url = optionalUrl(name, value)
  if (!url) return null
  const parsed = new URL(url)
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an origin without path, query, or fragment`)
  }
  return parsed.origin
}

export const siteOrigin = optionalOrigin('EOTION_SITE_ORIGIN', env.EOTION_SITE_ORIGIN)
export const appOrigin = optionalOrigin('EOTION_APP_ORIGIN', env.EOTION_APP_ORIGIN) ?? 'https://eotion.evanpatchouli.space'
export const githubUrl = 'https://github.com/Evanpatchouli/Eotion'

const currentNotes = releaseNotesFor(rootManifest.version)

export const releaseNotes = RELEASE_NOTES

export const release = Object.freeze({
  version: rootManifest.version,
  buildNumber: rootManifest.eotion.buildNumber,
  releasedAt: currentNotes?.releasedAt ?? null,
  highlights: currentNotes?.highlights ?? [],
  windows: Object.freeze({
    installer: optionalUrl('EOTION_DOWNLOAD_WINDOWS_INSTALLER_URL', env.EOTION_DOWNLOAD_WINDOWS_INSTALLER_URL),
    portable: optionalUrl('EOTION_DOWNLOAD_WINDOWS_PORTABLE_URL', env.EOTION_DOWNLOAD_WINDOWS_PORTABLE_URL),
    zip: optionalUrl('EOTION_DOWNLOAD_WINDOWS_ZIP_URL', env.EOTION_DOWNLOAD_WINDOWS_ZIP_URL),
  }),
  android: Object.freeze({
    apk: optionalUrl('EOTION_DOWNLOAD_ANDROID_APK_URL', env.EOTION_DOWNLOAD_ANDROID_APK_URL),
  }),
  harmony: Object.freeze({
    hap: optionalUrl('EOTION_DOWNLOAD_HARMONY_HAP_URL', env.EOTION_DOWNLOAD_HARMONY_HAP_URL),
  }),
  web: Object.freeze({ url: appOrigin }),
})
