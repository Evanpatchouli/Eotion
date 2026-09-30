declare const __EOTION_VERSION__: string

declare const __EOTION_BUILD_NUMBER__: number

declare const __EOTION_GIT_SHA__: string

export const EOTION_BUILD_INFO = Object.freeze({
  version: __EOTION_VERSION__,
  buildNumber: __EOTION_BUILD_NUMBER__,
  gitSha: __EOTION_GIT_SHA__,
})
