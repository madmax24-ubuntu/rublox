import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = 'http://localhost:3001';
const SCREENSHOT_DIR = 'test-results/screenshots';
const REPORT_FILE = 'test-results/test-report.txt';
const TOTAL_TEST_DURATION = 60000; // 60 seconds max
const PHASE_TIMEOUTS = {
    startScreen: 8000,
    loading: 12000,
    preGame: 15000,
    gameplay: 25000,
    errorDetection: 10000,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
let page;
let browser;
const screenshots = [];
const errors = [];
const consoleMessages = [];
let phaseResults = {};
let testStart = 0;
let currentPhase = '';

function mkdir(dir) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function ts() {
    return new Date().toISOString();
}

function log(msg) {
    const elapsed = ((Date.now() - testStart) / 1000).toFixed(1);
    process.stdout.write(`[${elapsed}s] ${msg}\n`);
}

async function setCameraPosition(x, y, z, lookAtX = 0, lookAtY = 0, lookAtZ = 0, fov = 90) {
    try {
        await page.evaluate((cx, cy, cz, lx, ly, lz, f) => {
            const g = window.getGameInstance?.();
            if (g && g.camera) {
                g.camera.position.set(cx, cy, cz);
                g.camera.lookAt(lx, ly, lz);
                g.camera.fov = f;
                g.camera.updateProjectionMatrix();
            }
        }, x, y, z, lookAtX, lookAtY, lookAtZ, fov);
    } catch {
        // ignore
    }
}

async function countObjectsByType(type) {
    try {
        return await page.evaluate((t) => {
            const g = window.getGameInstance?.();
            if (!g || !g.scene) return 0;
            let count = 0;
            g.scene.traverse((obj) => {
                if (obj.userData?.mapGenerated && obj.type === t) count++;
            });
            return count;
        }, type);
    } catch {
        return 0;
    }
}

async function captureTopViews() {
    const positions = [
        { name: 'north', x: 0, y: 300, z: -50, fov: 90 },
        { name: 'east', x: 200, y: 200, z: 0, fov: 90 },
        { name: 'south', x: 0, y: 300, z: 50, fov: 90 },
        { name: 'west', x: -200, y: 200, z: 0, fov: 90 },
        { name: 'center_45', x: 100, y: 250, z: 100, fov: 60 },
    ];
    for (const pos of positions) {
        await setCameraPosition(pos.x, pos.y, pos.z, 0, 0, 0, pos.fov);
        await page.waitForTimeout(200);
        await screenshot(`top_${pos.name}`);
    }
    await setCameraPosition(0, 500, 0, 0, 0, 0, 60);
}

async function screenshot(name) {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const dir = join(process.cwd(), SCREENSHOT_DIR);
    mkdir(dir);
    const path = join(dir, `${safeName}.png`);
    try {
        await page.screenshot({ path, fullPage: false });
        screenshots.push({ name, path, time: ts() });
        log(`Screenshot: ${name} -> ${path}`);
        return path;
    } catch (e) {
        log(`Screenshot error: ${e.message}`);
        return null;
    }
}

function recordPhaseResult(phase, status, details = []) {
    phaseResults[phase] = { status, details, time: ts() };
    log(`Phase ${phase}: ${status}${details.length ? ' | ' + details.join(', ') : ''}`);
}

function addError(msg) {
    errors.push({ msg, time: ts() });
    log(`ERROR: ${msg}`);
}

async function checkCanvasState() {
    try {
        return await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return { exists: false, error: 'no canvas element' };
            const style = window.getComputedStyle(canvas);
            const parent = canvas.parentElement;
            const parentStyle = parent ? window.getComputedStyle(parent) : null;
            return {
                exists: true,
                width: canvas.width,
                height: canvas.height,
                display: style.display,
                visibility: style.visibility,
                opacity: parseFloat(style.opacity),
                parentDisplay: parentStyle ? parentStyle.display : 'none',
                parentNode: parent ? parent.id || parent.tagName : 'none',
                webgl: !!canvas.getContext('webgl2') || !!canvas.getContext('webgl'),
            };
        });
    } catch (e) {
        return { error: e.message };
    }
}

async function checkConsoleErrors() {
    try {
        const logs = await page.evaluate(() => {
            const all = typeof window.getConsoleLogs === 'function' ? window.getConsoleLogs(200) : [];
            const errors = all.filter(l => l.type === 'error');
            return errors;
        });
        return logs;
    } catch {
        return [];
    }
}

async function checkStartScreen() {
    try {
        return await page.evaluate(() => {
            const el = document.getElementById('startScreen');
            if (!el) return { exists: false };
            const s = window.getComputedStyle(el);
            return {
                exists: true,
                display: s.display,
                visibility: s.visibility,
                hasButton: !!document.getElementById('startButtonDesktop') || !!document.getElementById('startButtonMobile'),
                title: document.querySelector('.start-title')?.textContent || '',
            };
        });
    } catch {
        return { error: 'timeout' };
    }
}

async function checkHUD() {
    try {
        return await page.evaluate(() => {
            const hud = document.getElementById('hud');
            if (!hud) return { hudExists: false };
            return {
                hudExists: true,
                playersCount: document.getElementById('playersCount')?.textContent || '',
                zoneInfo: document.getElementById('zoneInfo')?.textContent || '',
                modeInfo: document.getElementById('modeInfo')?.textContent || '',
                perkInfo: document.getElementById('perkInfo')?.textContent || '',
                minimapCanvas: !!document.getElementById('minimapCanvas'),
            };
        });
    } catch {
        return { error: 'timeout' };
    }
}

async function checkGameInstance() {
    try {
        return await page.evaluate(() => {
            const g = window.getGameInstance();
            if (!g) return { exists: false };
            return {
                exists: true,
                paused: g.isPaused ?? 'unknown',
                gameStarted: g.gameStarted ?? 'unknown',
                sceneVisible: g.scene ? (g.scene.children.length > 0) : false,
                cameraPos: g.camera ? `${g.camera.position.x.toFixed(1)},${g.camera.position.y.toFixed(1)},${g.camera.position.z.toFixed(1)}` : 'unknown',
                playerCount: g.players ? g.players.length : (g.playerCount ?? 'unknown'),
            };
        });
    } catch {
        return { error: 'timeout' };
    }
}

async function simulateMouseMove(x, y) {
    try {
        await page.mouse.move(x, y);
    } catch {
        // ignore
    }
}

async function simulateClick(x, y, button = 'left') {
    try {
        await page.mouse.click(x, y, { button });
    } catch {
        // ignore
    }
}

async function simulateKeyPress(keys) {
    try {
        await page.keyboard.down(keys);
        await page.keyboard.up(keys);
    } catch {
        // ignore
    }
}

async function waitUntil(conditionFn, timeout, interval = 500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            if (await conditionFn()) return true;
        } catch {
            // continue
        }
        await page.waitForTimeout(interval);
    }
    return false;
}

// ─── Phase 1: Start Screen ──────────────────────────────────────────────────
async function phase1StartScreen() {
    currentPhase = 'phase1_start_screen';
    log('=== Phase 1: Start Screen Test ===');
    let pass = true;
    let details = [];

    // Open game page
    try {
        await page.goto(BASE_URL, { timeout: 15000, waitUntil: 'load' });
        log('Page loaded');
    } catch (e) {
        addError(`Failed to load page: ${e.message}`);
        pass = false;
        details.push(`page_load_failed`);
        await screenshot('p1_page_load_failed');
        recordPhaseResult('phase1', pass ? 'PASS' : 'FAIL', details);
        return pass;
    }

    // Wait a moment for rendering
    await page.waitForTimeout(1000);

    // Check start screen exists
    const startScreen = await checkStartScreen();
    if (startScreen.exists) {
        log(`Start screen: display=${startScreen.display}, title="${startScreen.title}"`);
    } else if (startScreen.error) {
        addError(`Start screen check failed: ${startScreen.error}`);
        pass = false;
        details.push('start_screen_check_failed');
    }

    // Canvas is created by game engine after start, not at page load -- skip pre-start check
    log('Canvas not expected before game init (created during initAsync)');

    // Click "Начать игру" button
    try {
        const desktopBtn = await page.$('#startButtonDesktop');
        const mobileBtn = await page.$('#startButtonMobile');
        const btn = desktopBtn || mobileBtn;
        if (btn) {
            await btn.click();
            log('Clicked "Начать игру" button');
        } else {
            addError('Start button not found');
            pass = false;
            details.push('start_button_not_found');
        }
    } catch (e) {
        addError(`Failed to click start button: ${e.message}`);
        pass = false;
        details.push('start_button_click_failed');
    }

    await screenshot('p1_after_start_click');
    await page.waitForTimeout(2000);
    await screenshot('p1_after_2s');

    recordPhaseResult('phase1', pass ? 'PASS' : 'FAIL', details);
    return pass;
}

// ─── Phase 2: Loading Phase ─────────────────────────────────────────────────
async function phase2Loading() {
    currentPhase = 'phase2_loading';
    log('=== Phase 2: Loading Phase Test ===');
    let pass = true;
    let details = [];

    // Monitor loading progress
    const checkLoading = async () => {
        try {
            return await page.evaluate(() => {
                const overlay = document.getElementById('loadingOverlay');
                const fill = document.getElementById('loadingFill');
                const text = document.getElementById('loadingText');
                const startScreen = document.getElementById('startScreen');
                return {
                    loadingVisible: overlay ? window.getComputedStyle(overlay).display !== 'none' : false,
                    fillWidth: fill ? parseFloat(fill.style.width) || 0 : 0,
                    loadingText: text ? text.textContent : '',
                    startHidden: startScreen ? window.getComputedStyle(startScreen).display === 'none' : true,
                };
            });
        } catch {
            return null;
        }
    };

    // Wait for loading to start (start screen should be hidden)
    const started = await waitUntil(async () => {
        const s = await checkLoading();
        return s && s.startHidden;
    }, 5000);

    if (!started) {
        addError('Loading never started - start screen never hidden');
        pass = false;
        details.push('loading_never_started');
        await screenshot('p2_loading_stuck');
        recordPhaseResult('phase2', pass ? 'PASS' : 'FAIL', details);
        return pass;
    }
    log('Loading phase started');

    // Take screenshot at 5s
    await page.waitForTimeout(3000);
    const loadingState = await checkLoading();
    if (loadingState) {
        log(`Loading: ${loadingState.loadingText} (fill=${loadingState.fillWidth}%)`);
    }
    await screenshot('p2_loading_at_3s');

    // Wait for canvas to become visible
    const canvasVisible = await waitUntil(async () => {
        const cs = await checkCanvasState();
        return cs.exists && cs.display !== 'none' && cs.visibility !== 'hidden';
    }, 8000);

    if (!canvasVisible) {
        addError('Canvas never became visible during loading');
        pass = false;
        details.push('canvas_never_visible');
    }

    // Verify canvas dimensions
    const finalCanvas = await checkCanvasState();
    if (finalCanvas.exists && finalCanvas.width > 0 && finalCanvas.height > 0) {
        log(`Canvas final: ${finalCanvas.width}x${finalCanvas.height}, WebGL=${finalCanvas.webgl}`);
        if (finalCanvas.webgl) {
            log('WebGL context confirmed');
        } else {
            addError('No WebGL context detected');
            pass = false;
            details.push('no_webgl_context');
        }
    }

    await screenshot('p2_loading_complete');

    // Wait for loading to finish
    await page.waitForTimeout(2000);
    const postLoad = await checkLoading();
    if (postLoad) {
        log(`Post-load: loadingVisible=${postLoad.loadingVisible}`);
    }

    recordPhaseResult('phase2', pass ? 'PASS' : 'FAIL', details);
    return pass;
}

// ─── Phase 3: Pre-Game Phase ────────────────────────────────────────────────
async function phase3PreGame() {
    currentPhase = 'phase3_pre_game';
    log('=== Phase 3: Pre-Game Phase Test ===');
    let pass = true;
    let details = [];

    // Wait for HUD to appear (should appear after ~10s countdown)
    const hudAppeared = await waitUntil(async () => {
        const h = await checkHUD();
        return h.hudExists;
    }, 10000);

    if (!hudAppeared) {
        addError('HUD never appeared');
        pass = false;
        details.push('hud_never_appeared');
        await screenshot('p3_hud_missing');
    }

    const hud = await checkHUD();
    if (hud.error) {
        addError(`HUD check failed: ${hud.error}`);
        pass = false;
        details.push('hud_check_failed');
    } else if (hud.hudExists) {
        log(`HUD: players="${hud.playersCount}", zone="${hud.zoneInfo}", mode="${hud.modeInfo}", perk="${hud.perkInfo}"`);

        // Verify player count is 32
        const playerMatch = hud.playersCount.match(/\d+/);
        if (playerMatch) {
            const count = parseInt(playerMatch[0]);
            log(`Player count: ${count} (expected 32)`);
            if (count === 32) {
                log('Player count is correct (32)');
            } else {
                addError(`Player count is ${count}, expected 32`);
                details.push(`player_count_mismatch:${count}`);
                pass = false;
            }
        }

        // Check HUD elements exist
        const checks = [
            ['playersCount', hud.playersCount !== ''],
            ['zoneInfo', hud.zoneInfo !== ''],
            ['modeInfo', hud.modeInfo !== ''],
            ['perkInfo', hud.perkInfo !== ''],
        ];
        for (const [id, ok] of checks) {
            if (!ok) {
                addError(`HUD element missing: ${id}`);
                details.push(`${id}_missing`);
                pass = false;
            }
        }

        // Check minimap
        if (hud.minimapCanvas) {
            log('Minimap canvas present');
        } else {
            addError('Minimap canvas not found');
            details.push('minimap_missing');
            pass = false;
        }
    }

    // Verify scene visibility
    const cs = await checkCanvasState();
    if (cs.exists && cs.display !== 'none' && cs.visibility !== 'hidden') {
        log(`Scene visible: ${cs.width}x${cs.height}`);
    } else {
        addError('Scene not visible in pre-game phase');
        pass = false;
        details.push('scene_not_visible');
        await screenshot('p3_scene_missing');
    }

    // Check game instance
    const game = await checkGameInstance();
    if (game.exists) {
        log(`Game: paused=${game.paused}, camera=${game.cameraPos}, scene=${game.sceneVisible}`);
    }

    await screenshot('p3_pre_game_hud');
    await page.waitForTimeout(3000);

    // Capture top-down views for map inspection
    log('=== Capturing Top-Down Map Views ===');
    await captureTopViews();
    log('Top-down views captured');

    recordPhaseResult('phase3', pass ? 'PASS' : 'FAIL', details);
    return pass;
}

// ─── Phase 4: Gameplay Test ─────────────────────────────────────────────────
async function phase4Gameplay() {
    currentPhase = 'phase4_gameplay';
    log('=== Phase 4: Gameplay Test ===');
    let pass = true;
    let details = [];

    // Record initial camera position
    const initialGame = await checkGameInstance();
    const initialCamera = initialGame.cameraPos || 'unknown';
    log(`Initial camera: ${initialCamera}`);

    // Test WASD movement (hold keys to allow game movement frames)
    try {
        // Hold W for 2s
        await page.keyboard.down('w');
        await page.waitForTimeout(2000);
        await page.keyboard.up('w');

        const posW = await page.evaluate(() => {
            const g = window.getGameInstance();
            return g?.camera ? { x: g.camera.position.x.toFixed(2), y: g.camera.position.y.toFixed(2), z: g.camera.position.z.toFixed(2) } : null;
        });
        log(`After W (2s): camera=${posW ? JSON.stringify(posW) : 'null'}`);

        // Hold A for 1s
        await page.keyboard.down('a');
        await page.waitForTimeout(1000);
        await page.keyboard.up('a');

        // Hold S for 1s
        await page.keyboard.down('s');
        await page.waitForTimeout(1000);
        await page.keyboard.up('s');

        // Hold D for 1s
        await page.keyboard.down('d');
        await page.waitForTimeout(1000);
        await page.keyboard.up('d');

        log('WASD keys tested');
    } catch (e) {
        addError(`WASD test error: ${e.message}`);
        details.push('wasd_error');
    }

    // Test mouse look (camera rotation) via pointer lock
    try {
        const rect = await page.evaluate(() => {
            const c = document.querySelector('canvas');
            if (!c) return null;
            const r = c.getBoundingClientRect();
            return { x: r.width / 2, y: r.height / 2 };
        });
        if (rect) {
            // Request pointer lock on canvas for mouse look
            await page.mouse.click(rect.x, rect.y, { button: 'left' });
            await page.waitForTimeout(200);
            // Move mouse - the game's pointer lock should capture it
            await page.mouse.move(rect.x + 100, rect.y);
            await page.waitForTimeout(500);
            await page.mouse.move(rect.x, rect.y);
            await page.waitForTimeout(500);
            // Release pointer lock
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            log('Mouse look tested (pointer lock)');
        }
    } catch (e) {
        addError(`Mouse look test error: ${e.message}`);
        details.push('mouse_look_error');
    }

    // Test jump (space key) - hold briefly to allow physics frame
    try {
        await page.keyboard.down(' ');
        await page.waitForTimeout(500);
        await page.keyboard.up(' ');
        await page.waitForTimeout(500);

        const camAfterJump = await page.evaluate(() => {
            const g = window.getGameInstance();
            return g?.camera ? { y: g.camera.position.y.toFixed(2) } : null;
        });
        log(`Jump tested, camera Y: ${camAfterJump ? camAfterJump.y : 'null'}`);
        log('Jump (space) tested');
    } catch (e) {
        addError(`Jump test error: ${e.message}`);
        details.push('jump_error');
    }

    // Test weapon attack (LMB) - simulate multiple clicks
    try {
        const attackRect = await page.evaluate(() => {
            const c = document.querySelector('canvas');
            if (!c) return null;
            const r = c.getBoundingClientRect();
            return { x: r.width / 2, y: r.height / 2 };
        });
        if (attackRect) {
            for (let i = 0; i < 3; i++) {
                await page.mouse.click(attackRect.x, attackRect.y, { button: 'left' });
                await page.waitForTimeout(300);
            }
            log('Attack (LMB) tested - 3 clicks');
        }
    } catch (e) {
        addError(`Attack test error: ${e.message}`);
        details.push('attack_error');
    }

    // Take screenshots every 5s during gameplay
    const screenshotsCount = 5;
    for (let i = 0; i < screenshotsCount; i++) {
        await page.waitForTimeout(5000);
        const snapName = `p4_gameplay_${i + 1}s`;
        await screenshot(snapName);

        // Check canvas still visible
        const cs = await checkCanvasState();
        if (!cs.exists || cs.display === 'none' || cs.visibility === 'hidden') {
            addError('Canvas disappeared during gameplay!');
            details.push('canvas_disappeared');
            pass = false;
            await screenshot('p4_canvas_disappeared');
            break;
        }

        // Check game still running
        const g = await checkGameInstance();
        if (g.exists) {
            log(`Gameplay check ${i + 1}: camera=${g.cameraPos}, paused=${g.paused}`);
        } else {
            addError('Game instance unavailable during gameplay');
            details.push('game_instance_gone');
            pass = false;
        }
    }

    // Test E key (interact)
    try {
        await simulateKeyPress('e');
        await page.waitForTimeout(200);
        log('Interact (E) tested');
    } catch {
        // Non-critical
    }

    // Test inventory slot key (number 1)
    try {
        await simulateKeyPress('1');
        await page.waitForTimeout(200);
        log('Inventory slot (1) tested');
    } catch {
        // Non-critical
    }

    recordPhaseResult('phase4', pass ? 'PASS' : 'FAIL', details);
    return pass;
}

// ─── Phase 5: Error Detection ───────────────────────────────────────────────
async function phase5ErrorDetection() {
    currentPhase = 'phase5_error_detection';
    log('=== Phase 5: Error Detection ===');
    let pass = true;
    let details = [];

    // Monitor console errors
    const consoleErrors = await checkConsoleErrors();
    log(`Console errors found: ${consoleErrors.length}`);

    const typeErrors = consoleErrors.filter(e => e.msg.includes('TypeError'));
    const renderErrors = consoleErrors.filter(e =>
        e.msg.includes('render') || e.msg.includes('rendering') || e.msg.includes('gl.')
    );
    const sceneErrors = consoleErrors.filter(e =>
        e.msg.includes('scene') || e.msg.includes('undefined') || e.msg.includes('null')
    );

    if (typeErrors.length > 0) {
        addError(`Found ${typeErrors.length} TypeError(s): ${typeErrors.slice(0, 3).map(e => e.msg).join(' | ')}`);
        details.push(`typeErrors:${typeErrors.length}`);
        pass = false;
    }

    if (renderErrors.length > 0) {
        addError(`Found ${renderErrors.length} render-related error(s): ${renderErrors.slice(0, 3).map(e => e.msg).join(' | ')}`);
        details.push(`renderErrors:${renderErrors.length}`);
        pass = false;
    }

    // Check canvas visibility one more time
    const cs = await checkCanvasState();
    if (cs.exists) {
        if (cs.display === 'none') {
            addError('Canvas display is "none" - scene disappeared!');
            details.push('canvas_display_none');
            pass = false;
            await screenshot('p5_canvas_none');
        } else if (cs.visibility === 'hidden') {
            addError('Canvas visibility is "hidden" - scene disappeared!');
            details.push('canvas_visibility_hidden');
            pass = false;
            await screenshot('p5_canvas_hidden');
        } else if (cs.opacity === 0) {
            addError('Canvas opacity is 0 - scene disappeared!');
            details.push('canvas_opacity_zero');
            pass = false;
            await screenshot('p5_canvas_invisible');
        } else {
            log(`Canvas state: display=${cs.display}, visibility=${cs.visibility}, opacity=${cs.opacity}`);
        }
    } else {
        addError('No canvas element found!');
        details.push('canvas_missing');
        pass = false;
        await screenshot('p5_no_canvas');
    }

    // Check game instance
    const game = await checkGameInstance();
    if (game.exists) {
        log(`Game alive: paused=${game.paused}, scene=${game.sceneVisible}`);
        if (!game.sceneVisible) {
            addError('Game scene has no children - scene may be destroyed');
            details.push('scene_empty');
            pass = false;
        }
    } else {
        addError('Game instance is null/undefined');
        details.push('game_instance_null');
        pass = false;
    }

    await screenshot('p5_error_detection');

    recordPhaseResult('phase5', pass ? 'PASS' : 'FAIL', details);
    return pass;
}

// ─── Phase 6: Reporting ─────────────────────────────────────────────────────
function phase6Reporting() {
    currentPhase = 'phase6_reporting';
    log('=== Phase 6: Generating Report ===');

    const totalDuration = ((Date.now() - testStart) / 1000).toFixed(1);
    const verdict = Object.values(phaseResults).every(r => r.status === 'PASS')
        ? 'ALL TESTS PASSED'
        : 'SOME TESTS FAILED';

    const report = [
        `═══════════════════════════════════════════════════════`,
        `  Rubo Arena - Game Test Report`,
        `  Generated: ${ts()}`,
        `═══════════════════════════════════════════════════════`,
        ``,
        `  URL: ${BASE_URL}`,
        `  Duration: ${totalDuration}s`,
        `  Verdict: ${verdict}`,
        ``,
        `───────────────────────────────────────────────────────`,
        `  Phase Results`,
        `───────────────────────────────────────────────────────`,
    ];

    const phaseNames = {
        phase1: 'Phase 1: Start Screen',
        phase2: 'Phase 2: Loading Phase',
        phase3: 'Phase 3: Pre-Game',
        phase4: 'Phase 4: Gameplay',
        phase5: 'Phase 5: Error Detection',
    };

    for (const [phase, result] of Object.entries(phaseResults)) {
        const name = phaseNames[phase] || phase;
        const icon = result.status === 'PASS' ? 'PASS' : 'FAIL';
        report.push(`  [${icon}] ${name}`);
        if (result.details.length) {
            for (const d of result.details) {
                report.push(`        - ${d}`);
            }
        }
    }

    report.push(``);
    report.push(`───────────────────────────────────────────────────────`);
    report.push(`  Errors Found (${errors.length})`);
    report.push(`───────────────────────────────────────────────────────`);

    if (errors.length === 0) {
        report.push(`  No errors detected`);
    } else {
        for (let i = 0; i < errors.length; i++) {
            const e = errors[i];
            report.push(`  ${i + 1}. [${e.time}] ${e.msg}`);
        }
    }

    report.push(``);
    report.push(`───────────────────────────────────────────────────────`);
    report.push(`  Screenshots (${screenshots.length})`);
    report.push(`───────────────────────────────────────────────────────`);

    for (const s of screenshots) {
        report.push(`  ${s.name}: ${s.path}`);
    }

    report.push(``);
    report.push(`═══════════════════════════════════════════════════════`);

    // Write report
    mkdir(join(process.cwd(), 'test-results'));
    writeFileSync(REPORT_FILE, report.join('\n'));
    log(`Report written to ${REPORT_FILE}`);

    // Print report to console
    log('---');
    for (const line of report) {
        log(line);
    }
    log('---');

    return verdict.includes('PASSED');
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    testStart = Date.now();
    log('Starting Rubo Arena Game Test Automation');

    // Launch browser
    try {
        browser = await chromium.launch({
            headless: false,
            args: [
                '--disable-gpu',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1280,900',
            ],
        });
        log('Browser launched');
    } catch (e) {
        log(`FATAL: Could not launch browser: ${e.message}`);
        process.exit(1);
        return;
    }

    // Create context
    page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        locale: 'ru-RU',
        timezoneId: 'Europe/Moscow',
    });

    // Intercept console messages from browser
    page.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();
        consoleMessages.push({ type, text, time: ts() });
        if (type === 'error') {
            log(`BROWSER ERROR: ${text}`);
        }
    });

    page.on('pageerror', (err) => {
        log(`PAGE ERROR: ${err.message}`);
        addError(`PageError: ${err.message}`);
    });

    // Enable test mode before loading game (runs before any page scripts)
    await page.addInitScript(() => {
        window['testModeEnabled'] = true;
        window['testMode'] = true;
        window['setTestMode'](true);
        localStorage.setItem('testMode', 'true');
    });

    // Run phases sequentially
    try {
        const p1 = await phase1StartScreen();
        await page.waitForTimeout(1000);

        const p2 = await phase2Loading();

        const p3 = await phase3PreGame();
        await page.waitForTimeout(2000);

        const p4 = await phase4Gameplay();
        await page.waitForTimeout(1000);

        const p5 = await phase5ErrorDetection();
        await page.waitForTimeout(1000);

        // Final screenshot
        await screenshot('final_state');

        phase6Reporting();
    } catch (e) {
        addError(`Fatal phase error: ${e.message}`);
        log(`FATAL: ${e.message}`);
        try {
            await screenshot('fatal_error');
        } catch {
            // ignore screenshot errors
        }

        // Still generate report even on fatal error
        phase6Reporting();
    } finally {
        // Cleanup
        try {
            await browser.close();
            log('Browser closed');
        } catch {
            // ignore
        }
    }

    // Exit code: 0 = all pass, 1 = some failed
    const allPassed = phaseResults.phase1?.status === 'PASS'
        && phaseResults.phase2?.status === 'PASS'
        && phaseResults.phase3?.status === 'PASS'
        && phaseResults.phase4?.status === 'PASS'
        && phaseResults.phase5?.status === 'PASS';

    process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
    log(`CRASH: ${e.message}`);
    process.exit(2);
});
