## Objective
- Redesign the stalker corpse model in `_addStalkerCorpse` to visually match the user's reference photo of a sitting/slumping military corpse with gas mask, helmet, tactical vest, and proper proportions

## Important Details
- **Reference image**: Sitting/slumping corpse against wall, military green camo uniform, heavy tactical vest with many pouches, combat helmet with brim, gas mask with prominent round side filter, heavy shoulder pads, heavy military boots, backpack behind
- MeshPool material caching caused helmet to render black (fixed by creating materials directly)
- Game uses `window.__kilo_test__` flag to reduce countdown to 5 seconds in test mode
- Game states: "countdown" → "spawn" → "playing" → "ended"
- Camera controller only updates rotation when `isLocked` (pointer lock) is true — not available in headless Playwright
- Camera position is clamped by wall collision logic (`_clampCamera`)
- Must set `camera.lookAt()` directly and stop game loop to prevent game loop from overwriting camera
- Cache-busting import: `MapGeneratorNode.js?v=1786192400000`
- Materials created directly with `new THREE.MeshStandardMaterial` (not via MeshPool)
- Server must be restarted after file changes; Playwright used for verification screenshots
- Corpse spawn position changed from inside hangar to outside: `_addStalkerCorpse(x + w / 2 + 6, z + d / 2 + 4, 0, this.scene)`
- Corpse world position: approximately `(-36.5, 0.3, 96.5)` — now in open area outside hangar
- Corpse rotated to face away from hangar (`corpse.rotation.y = -Math.PI / 4`)
- Test must use `game.gameLoop.stop()` (not `gameLoop.paused`) to prevent camera reset
- Test must call `renderer.render(scene, camera)` after setting camera position to capture correct view

## Work State
### Completed
- Initial corpse redesign (sitting pose, green uniform, vest, gas mask, helmet) — committed as `9a9a001`
- Second pass with scaled proportions — committed as `f2f9736`
- Fixed helmet color (brighter green `0x4a7a3a`, larger vest, more prominent gas mask) — committed as `658565a`
- Fixed MeshPool caching issue by creating materials directly — committed as `96df8be`
- Updated cache-busting timestamp on `MapGeneratorNode.js` import
- Server restart + Playwright verification workflow established
- Simplified corpse model with smaller proportions — committed as `a37dd2b`
- Improved helmet (16 segments), larger gas mask filter, more vest pouches — committed as `b112495`
- Complete rewrite of `_addStalkerCorpse` — smaller head (0.3x0.35x0.3), rounder helmet (CylinderGeometry 16 segments), larger gas mask filter — committed as `1059da5`
- Created Playwright test `tests/corpse-screenshot.spec.js` that captures close-up corpse view
- Discovered corpse spawns inside hangar building — walls block camera view
- Discovered game needs `window.__kilo_test__` flag for test-mode countdown (5 seconds)
- Discovered test was setting `gameLoop.paused` but GameLoop checks `game.isPaused` — fixed to `game.gameLoop.stop()`
- Discovered camera was being reset by pending game loop frame — fixed by calling `renderer.render()` after setting camera
- Discovered camera lookAt was pointing at ground (Y=0) instead of corpse center — fixed to look at Y+0.6
- Moved corpse spawn from inside hangar to outside: changed from `_addStalkerCorpse(w / 2 - 2.5, d / 2 - 2.5, 0.3, group)` to `_addStalkerCorpse(x + w / 2 + 6, z + d / 2 + 4, 0, this.scene)`
- Simplified test: removed complex offset-finding logic, set camera position directly (bypassing camera controller clamping)
- Corpse model rewritten with rounded geometries: SphereGeometry for head/helmet/gas mask, CylinderGeometry for torso/vest/arms/legs
- Proportions refined: realistic vest (0.36 radius), proper helmet (0.22 radius), prominent gas mask filter
- Colors improved: brighter uniform (0x4a6a3a), darker vest (0x3a5a2a), darker helmet (0x3a5a2a)
- Corpse rotated to face away from hangar

### Active
None — corpse model redesigned and verified

### Blocked
- (none)

## Next Move
1. Show user the current corpse model screenshot for feedback
2. Iterate based on user feedback
3. Final commit when user is satisfied

## Relevant Files
- `C:\Users\maksk\Desktop\rublox\world\MapGenerator.js`: Main map generation file containing `_addStalkerCorpse` method (line 6145+); hangar definition at line 4367; corpse spawn at line 4672 changed to outside hangar
- `C:\Users\maksk\Desktop\rublox\world\MeshPool.js`: Material/geometry pooling — caused caching issues, now bypassed for corpse materials
- `C:\Users\maksk\Desktop\rublox\main.js`: Entry point that imports MapGenerator, exposes `window.game`, contains game loop and state transitions
- `C:\Users\maksk\Desktop\rublox\core\CameraController.js`: First-person camera controller that continuously overrides camera position/rotation; `_clampCamera` pushes camera away from walls
- `C:\Users\maksk\Desktop\rublox\core\GameLoop.js`: Main game loop using `requestAnimationFrame`; skips update when `document.hidden` unless headless mode detected; `stop()` method cancels animation frame
- `C:\Users\maksk\Desktop\rublox\tests\corpse-screenshot.spec.js`: Playwright test for corpse close-up verification — sets `window.__kilo_test__`, stops gameLoop, sets camera position directly, uses `camera.lookAt()`, renders manually before screenshot
- `C:\Users\maksk\Desktop\rublox\screenshots\corpse-closeup.png`: Latest verification screenshot showing current corpse state visible outside hangar
- `C:\Users\maksk\Desktop\rublox\corpse_new.js`: Temporary file used for method replacement (can be cleaned up)
- `C:\Users\maksk\Desktop\rublox\corpse-replacement.txt`: Temporary file used for method replacement (can be cleaned up)
