# Current Task — P5 Production Electron API Connectivity

Baseline: abce6046. Scope complete: bundled renderer API connectivity; Auth/Sync/schema/editor/UI unchanged.

## Work Units
1. S0 investigate (scout): Cookie/Origin/SDK/build/tests Evidence Pack complete.
2. S2 decide (main): direct file HTTPS login works at fetch level (201) but me=401; choose same-origin HTTPS bundled protocol over IPC/local server.
3. S1 execute (fast_worker): production protocol, main build/runtime config and security unit tests complete.
4. S1 execute / S0 verify: standalone real API built Electron acceptance + docs + regressions complete.
5. Review: independent reviewer found initiator boundary; fixed global HTTPS initiator check + canonical trusted-write Origin; final targeted review has no remaining P1/P2.

## Final Evidence
- `test:desktop-production-real` builds API and `electron-vite build`, launches `out/main/index.js`, ELECTRON_RENDERER_URL absent; final code 1/1 passed (18.6s).
- Isolated disposable Mongo replica set, production Nest API and HTTPS localhost fixture. No API mocks, no Vite server. Network renderer asset requests=0.
- UI login, secure HttpOnly/Lax cookie, me200, Workspace/Page creation, editor SQLite and Sync, online close/restart me200 and page restore passed.
- HTTPS listener ECONNREFUSED; offline edit persisted before kill, restart while unavailable restores SQLite and permits continued edit; reconnect pushes pending before pull, queue0/已同步; second independent Electron profile sees final text.
- 6 pushes / 7 pulls; writes have canonical API Origin. Untrusted opaque-origin logout rejected before upstream. Cookie values never exposed by production preload/renderer.
- File fallback absolute login201 then credentialed me401: URL-only solution rejected on measured Session failure.
- Desktop typecheck/build + 16 protocol/SQLite tests, desktop storage/product-sync3/3, dev5173 proxy me401 JSON, Web typecheck/build, Web offline-shell1/1 passed. Targeted acceptance TS compilation and git diff check passed.
- Documentation: runbooks/desktop-production.md, P5 product/sync and retrieval/testing entries.
- Production Electron blocker can close. Actual all-interface manual network removal not claimed; test uses real connection refused. TLS fixture uses exact test-only SPKI allowance; production retains default verification and requires trusted deployment certificate.
- Temporary test API/profiles/random databases auto-cleaned; disposable Mongo container and test TLS fixtures removed by main after final run. No shared service/env modified.
- Commit subject: fix(desktop): connect production renderer to api.
