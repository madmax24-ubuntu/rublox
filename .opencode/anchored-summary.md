## Objective
- Fix bazooka first-shot freeze and explosion freeze via async worker buffer generation and simplified playback

## Important Details
- **Node.js v24 compatibility**: `**` operator with unary `-` causes `SyntaxError`; fixed via `gauss(x, s)` helper using `-1.0 * (x ** 2)` in AudioSynth.js
- **Node.js v24 worker crash**: Worker code had same `**` operator issue — fixed by wrapping inner expressions in extra parens: `-(((...)) ** 2)` on lines 10, 35, 36, 40, 42
- **Test mock gap**: `MockAudioContext` lacked `window.addEventListener`/`removeEventListener`, causing `init()` to crash; added to both test files
- **Critical bug #1**: `_ensureLazyInit()` called `this.init()` which checked `_initPromise` was already set and returned `true` early — `_doInit()` was **never called**, leaving `audioContext` null forever. Fixed: `_ensureLazyInit()` now calls `this._doInit()` directly.
- **Critical bug #2**: `loadSamples()` was NOT awaited in `_doInit()`, so `_initPromise` resolved before samples were loaded. Fixed: `await this.loadSamples()` in `_doInit()`.
- **Critical bug #3 — game hang on start**: `main.js` added `await audioInitPromise` after map generation (commit `3b6fab1`) blocking game start if audio init hangs. Fixed: restored sync init, worker as background opt (commit `e4e87e6`).
- **DataCloneError on transfer**: `self.postMessage({ type, data }, [data])` fails for `impulse` type where `data` is `Float32Array[]` (multi-channel). Fixed: removed all transfer lists, use structured clone (commit `700f6e8`).
- **Playwright hooks bug**: Arrow functions in `page.addInitScript()` captured `this` from enclosing scope (window), not from caller (AudioContext). `origCreateGain.apply(this, args)` called with wrong `this` context. Fixed: use regular functions for patched methods.
- **Explosion freeze fix**: `playBazooka` had 11 sync nodes + `playProceduralExplosion` had 9 sync nodes = **20 total**. Worker already pre-mixes all layers into complete buffers. Simplified both to BufferSource + Gain + Panner (3 nodes each = 6 total). Removed unused `createBazookaHissBuffer()`/`createExplosionCrackleBuffer()` methods and their buffer properties.
- **Commits**: `445f808`, `e0519a2`, `e90fba1`, `57f0137`, `4426b0e`, `5d1b33d`, `3b6fab1`, `5123968`, `1a24a15`, `312109b`, `700f6e8`, `e4e87e6`, `4462b28`, `3458ab7` pushed to main

## MCP Bridge Workflow
**Before using threejs-devtools MCP:**
1. Dev server running: `npx nodemon server.js` on `http://localhost:3001`
2. Bootstrap bridge: `Start-Process -FilePath "node.exe" -ArgumentList "scripts/bootstrap-bridge.cjs"`
3. Verify: `mcp__threejs_devtools_bridge_status` → `Bridge: connected`
4. Test with MCP tools (perf_monitor, run_js, console_capture, scene_tree, etc.)
5. **ALWAYS cleanup**: `Get-Process -Name "playwright","chromium" | Stop-Process -Force`

**Limitations of headless MCP testing:**
- AudioContext requires user gesture (click) to resume in headless Chromium
- Cannot test audio playback in headless mode — use Playwright integration tests instead
- Performance monitor measures server-side headless rendering (low FPS without GPU)
- Use MCP for: scene tree, materials, geometry, lights, shaders, screenshots, console errors

## Work State
### Completed
- Created `core/AudioSynthWorker.js` for async buffer generation
- Updated `core/AudioSynth.js`: worker setup, `_doInit()` refactor, guard, `gauss()` helper, `await` on all async methods, `.then()` tick fix, `_ensureLazyInit` calls `_doInit()` directly, `await loadSamples()`
- Updated `main.js`: removed `await audioInitPromise` — game starts immediately; audio init runs in background
- Fixed Node.js v24 `**` operator disambiguation via `gauss()` helper in AudioSynth.js
- Fixed Node.js v24 `**` operator syntax in AudioSynthWorker.js (lines 10, 35, 36, 40, 42) — wrapped inner expressions in extra parens
- Fixed test mocks: added `addEventListener`/`removeEventListener`
- Fixed critical `_ensureLazyInit()` bug: changed to call `_doInit()` directly, removed `_lazyInitCalled` guard
- Added `await` to all async AudioSynth methods calling `_ensureLazyInit()`
- Fixed `startWeatherLoop` tick callback `.then()` pattern
- Added bazooka display name "Базука" to `entities/Player.js`
- Added bazooka support to `ui/HUD.js`: inventory slot icon "BAZ", Russian name mapping, ammo counter display
- Fixed `loadSamples()` not awaited in `_doInit()`
- Added `type` field to worker error messages
- Added 5s timeout to `_postWorker` with fallback to null
- **Removed transfer lists from all worker postMessage calls** — use structured clone (commit `700f6e8`)
- **Restored original sync `init()` pattern** — audioContext + buffers created synchronously, worker spawned in background (commit `e4e87e6`)
- **Created Playwright integration test** `tests/bazooka-sounds.spec.cjs` — verifies AudioSynth buffers exist and `playBazooka` creates audio nodes in real Chromium browser (commit `4462b28`)
- **Simplified bazooka playback**: `playBazooka` → 3 nodes (BufferSource + Gain + Panner), `playProceduralExplosion` → 3 nodes (BufferSource + Gain + Panner). Total: 6 nodes (was 20). Removed `createBazookaHissBuffer`/`createExplosionCrackleBuffer` and their buffer properties (commit `3458ab7`)
- **Created bootstrap-bridge.cjs** for automated bridge setup
- **Updated CLAUDE.md** with proper MCP bridge workflow
- Tests pass: 3/3 Playwright integration tests

### Active
None — all tasks completed

### Blocked
- Pre-existing hangar wall `walkable: false` test failure in `tests/bazooka-hangar.test.js` (Node.js Jest ESM issue)

## Next Move
1. User tests bazooka explosion visually in browser — verify no freeze
2. If freeze persists, investigate other sync-heavy code paths (particle effects, post-processing)

## Relevant Files
- `C:\Users\maksk\Desktop\rublox\core\AudioSynth.js`: Sync `init()` + worker background; `playBazooka` → 3 nodes, `playProceduralExplosion` → 3 nodes; removed `createBazookaHissBuffer`/`createExplosionCrackleBuffer`
- `C:\Users\maksk\Desktop\rublox\core\AudioSynthWorker.js`: Pre-generates complete buffers with all layers mixed; uses structured clone (no transfer lists)
- `C:\Users\maksk\Desktop\rublox\main.js`: Removed `await audioInitPromise`
- `C:\Users\maksk\Desktop\rublox\tests\bazooka-sounds.spec.cjs`: Playwright integration test — 3/3 pass
- `C:\Users\maksk\Desktop\rublox\scripts\bootstrap-bridge.cjs`: Automated bridge bootstrap for MCP testing
- `C:\Users\maksk\Desktop\rublox\entities\Player.js`: Added `bazooka` → `"Базука"` in `getWeaponDisplayName()`
- `C:\Users\maksk\Desktop\rublox\ui\HUD.js`: Added bazooka inventory slot icon "BAZ", Russian name mapping, ammo counter display
- `C:\Users\maksk\Desktop\rublox\items\Weapon.js`: Existing bazooka weapon profile (line 2536 calls `audioSynth.playBazooka?.(srcPos, srcKey)`)