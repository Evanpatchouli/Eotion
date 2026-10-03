module.exports = {
  appId: 'space.evanpatchouli.eotion',
  productName: 'Eotion',
  directories: {
    output: 'release',
    buildResources: 'resources',
  },
  files: ['out/**', 'resources/icon.png'],
  // Workspace TypeScript/nanoid are bundled by electron-vite; leave builder's
  // standard dependency collection enabled for any additional runtime modules.
  win: {
    icon: 'resources/icon.ico',
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
    artifactName: 'Eotion-${version}-win-${arch}.${ext}',
    forceCodeSigning: false,
  },
  nsis: {
    artifactName: 'Eotion-Setup-${version}.${ext}',
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Eotion',
  },
  portable: {
    artifactName: 'Eotion-${version}-portable.${ext}',
  },
  publish: null,
}
