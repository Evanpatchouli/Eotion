# Product screenshots

These images are deterministic captures of the real Eotion Web UI from `apps/web`, rendered with the existing Playwright Chromium `chrome` channel and the same mocked API fixture pattern used by `apps/web/tests/visual-regression.spec.ts`.

The fixture is public demo content created only for these screenshots. Its demo account uses the display name `Eotion` and the reserved example address `hello@eotion.example`, which is visible in the desktop captures. Workspace, page, blocks, and timestamps are synthetic. No production account or customer data is used.

To regenerate all four images from the repository root, run:

```sh
node apps/site/scripts/capture-product.mjs
```

The script starts the existing Web development server on `127.0.0.1:7173` only when one is not already available, then writes the desktop and mobile light/dark PNGs in this directory. When `ffmpeg` with its `libwebp` encoder is available, it also creates matching WebP files; the PNG captures remain available as the source images.
