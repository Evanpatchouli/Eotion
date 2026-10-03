# Windows Desktop packaging

Windows distribution packages use the product version in the root `package.json`. The packaging runner checks workspace version consistency before building, then bundles the shared Web renderer and Electron shell and asks electron-builder to create the selected Windows x64 artifacts in `apps/desktop/release/`.

## Commands

Run from the repository root on Windows:

```powershell
pnpm desktop:installer
pnpm desktop:portable
pnpm desktop:zip
pnpm desktop:release
```

`desktop:installer` creates `Eotion-Setup-<version>.exe`, `desktop:portable` creates `Eotion-<version>-portable.exe`, and `desktop:zip` creates `Eotion-<version>-win-x64.zip`. `desktop:release` creates all three in one electron-builder run. Ordinary `pnpm dev:desktop` and `pnpm build:desktop` remain development/build commands and do not create distribution packages.

The NSIS installer uses a normal installation wizard (non-one-click), lets the user change the installation directory, installs Eotion, and provides an uninstall entry in Windows. It creates desktop and Start Menu shortcuts named `Eotion`. The portable `.exe` starts without an installation step and is suited to a no-install workflow. The ZIP contains the unpacked application directory; extract the whole directory and run `Eotion.exe` from it. The ZIP itself is not an installer. These targets do not configure update delivery.

The root `package.json` is the product version source. Run `pnpm version:check` to check it manually; the distribution runner performs that check automatically and fails before building if workspace versions disagree. Old-version `.exe` and `.zip` files in `apps/desktop/release/` are reported after a successful build and are kept in place. An artifact filename without a SemVer version causes the runner to fail. The release directory is git-ignored.

## API origin

Distribution builds set `EOTION_DESKTOP_API_ORIGIN` for the bundled main process using this precedence: process environment, the loaded production-mode env files, then `https://eotion.evanpatchouli.space`. Electron-vite loads `apps/desktop/.env`, `.env.local`, `.env.production`, and `.env.production.local` in that order, so later files override earlier files; an existing process variable overrides all files. To package against another HTTPS origin, set the process environment before running the command:

```powershell
$env:EOTION_DESKTOP_API_ORIGIN = 'https://app.example.com'
pnpm desktop:installer
```

Blank or whitespace-only values are treated as unconfigured and fall back to the official origin. A nonempty value must be an HTTPS origin without a path, credentials, query, or fragment; invalid values stop distribution before building. This distribution-only default does not change the development server or plain `pnpm build:desktop` behavior. The process environment continues to override the value compiled into the package at runtime, as documented in [Desktop production API connectivity](desktop-production.md).

## Packaged app smoke check

After creating a package, the production smoke check can launch the bundled executable without Vite or an API-origin override:

```powershell
node scripts/test-desktop-package.mjs apps/desktop/release/win-unpacked/Eotion.exe
```

It uses a temporary Electron profile and checks the packaged renderer, API reachability, SQLite persistence across restart, and packaged origin. The test does not install the NSIS installer; installer setup/uninstall and Windows SmartScreen behavior require a separate manual check.

For full Cookie Session and offline/reconnect acceptance, prepare the isolated HTTPS/Mongo fixture from [Desktop production API](desktop-production.md), then run:

```powershell
$env:EOTION_TEST_DESKTOP_EXECUTABLE = (Resolve-Path 'apps/desktop/release/win-unpacked/Eotion.exe').Path
$env:EOTION_DESKTOP_API_ORIGIN = ''
pnpm --filter @eotion/web test:desktop-production-real
Remove-Item Env:EOTION_TEST_DESKTOP_EXECUTABLE, Env:EOTION_DESKTOP_API_ORIGIN
```

The empty value applies only to the plain build used by the file-origin negative control, overriding a configured Desktop `.env`. The positive scenario launches the existing packaged application with the test HTTPS origin at runtime. Do not run development/plain builds concurrently with packaging: both write `out/`, which electron-builder reads to assemble the archive.

## Signing and installation

Packages are unsigned. No signing certificate, automatic update feed, or publish destination is configured; electron-builder publish is explicitly disabled. The Windows executable metadata and icon are still edited during packaging so Explorer can show the Eotion product name and icon. The NSIS installer creates a per-user installer with `oneClick: false` and `allowToChangeInstallationDirectory: true`, so users can choose the installation directory in the wizard.

Because these builds are unsigned, Windows SmartScreen may show an unfamiliar-app warning. For the installer path, test installation and uninstall on a Windows machine and handle a SmartScreen prompt only after independently confirming the artifact source. The portable and ZIP paths run without installer setup; SmartScreen can still show a warning. This runbook does not establish publisher identity or bypass Windows security controls.
