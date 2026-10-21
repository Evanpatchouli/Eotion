# Four-old-visual subpixel Evidence Brief

Scope: read-only investigation; no browser launched; no project code/golden/PNG/system setting changed. Only TEMP diagnostic scripts/JSON/logs written. `inspect-glyphs.cjs` reads unchanged original expected/actual PNGs. R/B swap and comparator diff are RAM-only diagnostics; never use the transformed image as a golden.

## Direct evidence

Workspace Playwright core 1.63.0 own getComparator('image/png'), threshold default 0.2, maxDiffPixels default 0 (stricter than formal ratio allowance). Reproduces original raw comparator differences exactly:

| original image | original differences | after RAM-only R/B swap | residual B region |
| --- | ---: | ---: | --- |
| page-tablet-light |1251|0|none|
| page-mobile-light |1175|156|x199..389,y808..824, toolbar only|
| settings-desktop-light |2006|444|x28..223,y414..560, sidebar only|
| settings-profile-mobile-light |1132|0|none|

Residual region membership checked per red comparator pixel: 0 outside expected toolbar/sidebar regions. Desktop residual y clusters414..423 correspond removed MCP `即将推出`; y511..520 added `关于`; y545..560 added `软件说明`. Mobile residual falls moved/replaced later touch-toolbar controls. Known direct history: 5724b8a added indent/outdent; 2474fae added About;4ad82a7 delivered MCP. These B explanations were established in acceptance report and match residual locations; they cannot explain the original widespread colored glyph edges.

All four same-background/same-foreground glyph crops preserve the foreground/background color, support bitmap and bounds exactly. Tablet paragraph (247,268,410,16): bg250,249,246/fg31,31,30,2981 support pixels,0 support changes,bounds247,268..656,281. Mobile paragraph (100,248,250,16): same colors,1847 support pixels,0 changes,bounds100,248..349,261. Desktop nickname(537,217,32,18) and mobile nickname(30,180,32,18): bg255,255,255/fg36,36,36,329 support pixels,0 changes. Thus evidence demonstrates unchanged glyph positions/extent and base ink/paper color in these selected areas, not merely similar screenshots. Full-image diagnostic independently leaves no comparator-visible differences outside known B regions.

Nickname crop contains259 chromatic edge pixels,129 exactly reverse R/B. Mean L1 error181.494 before vs2.792 after R/B reversal. Original samples include expected78,36,36 -> actual36,36,78 (32px),255,224,156 ->156,224,255(28px). Both expected and actual therefore use subpixel color antialiasing; grayscale-vs-LCD is disproved. Specific issue is opposite subpixel channel order, with minor remaining intensity/color differences below unchanged comparator threshold, not font family/foreground color/layout changes. Never claim R/B reversal makes RGB buffers identical: only comparator mismatches become0 after excluding B content.

## Concrete environment evidence

`read-environment.ps1` calls only GET SystemParametersInfo API. All returned success: TYPE0x200A=2(ClearType),CONTRAST0x200C=1200,ORIENTATION0x2012=0(BGR). HKCU Desktop values match. HKCU and HKLM Avalon.Graphics/DISPLAY1 PixelStructure=2(BGR),GammaLevel=1800;HKCU ClearTypeLevel=100. These are actual current settings, not guessed generic GPU differences.

Windows11 build26200; current disk Chrome155.0.8059.85 (historical screenshot environment recorded155.0.8059.79; do not conflate). Browser executable SHA256 and msyh/msyhbd/segoeui/arial font file SHA256/size/mtime captured in environment-readonly.json. No fonts bundled by golden test; document.fonts.ready awaited. Golden commit1142a66 already uses Playwright1.63.0 and channel chrome; current visual config only adds timeline testMatch. base.css font-family/text-rendering unchanged;tokens.css and ProfileSettingsView unchanged since golden. settings.css additions target MCP/About controls; existing profile typography unchanged. No supported evidence of launch-default, font-family or CSS foreground regression.

## C classification boundary and minimal decision

C is now concrete RGB/BGR subpixel-order mismatch, supported by matched glyph pixels, full-image reversible diagnostic, and current effective BGR system settings. It is not necessary to invent an unrecorded Chrome/GPU change to explain observed differences. Historical exact Windows registry state or Chrome version remains unknown: cannot claim historical orientation=1 was directly recorded or Chrome155 source was proven byte-identical. This uncertainty no longer prevents classifying observed bitmap differences by the demonstrated channel-order factor.

Recommend four individually-reviewed original current screenshots become the new BGR environment baseline, two C-only and two B+C. First obtain fresh unmodified screenshots with formal config under current recorded environment and ensure repeated actual hashes stable; per-image compare/layout/content review and direct B history remain required. Do not regenerate the other existing baselines, raise ratios/thresholds, edit PNG pixels, set GPU/LCD launch flags or change global ClearType. Preserve old expected/actual/diff and this diagnostic evidence.

Minimal maintainable governance: a small read-only Windows visual preflight script plus one adjacent baseline-environment JSON; only invoke for visual run, not production app. Record/compare SPI TYPE/ORIENTATION/CONTRAST, primary-display Avalon PixelStructure/Gamma/ClearType, OS build, actual running browser.version/executable hash, Playwright version and chosen font file hashes. A mismatch should stop/flag environmental comparison for deliberate baseline review; it must never auto-mutate system settings or auto-update snapshots. Channel chrome remains OS-installed and can update: record actual launched browser version, do not rely on old .79 text. Avoid broad generic framework. If portability across OS/users is required later, adopt a dedicated pinned environment and create reviewed baselines there as a separate task.

## Primary sources

Microsoft API: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfow
Official Microsoft WinUser.h defines FE_FONTSMOOTHINGORIENTATIONBGR=0x0000, RGB=0x0001 at lines12014-12015:
https://raw.githubusercontent.com/microsoft/win32metadata/main/generation/WinSDK/RecompiledIdlHeaders/um/WinUser.h
Fixed Chromium commit4173dee249c410079ba874d335e1ac2c735c622c, ui/gfx/font_render_params_win.cc lines24..60 reads display PixelStructure first (1RGB/2BGR), then SPI orientation:
https://chromium.googlesource.com/chromium/src/+/4173dee249c410079ba874d335e1ac2c735c622c/ui/gfx/font_render_params_win.cc
Current fetched lkgr source blob968bb2b947bc717c6b0916d07db4e50566cc5423 shows same selection and passes Skia pixel geometry; source supports mechanism only, not a claim of exact Chrome155 binary source identity:
https://chromium.googlesource.com/chromium/src/+/lkgr/ui/gfx/font_render_params_win.cc
Precise version155.0.8059.79 source URL unavailable through web tool; not used as evidence.