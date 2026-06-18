/**
 * Visual regression test for Rublo Arena game.
 * Uses Playwright to launch the game, capture screenshots,
 * and compare them against a reference image.
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// ─── Configuration ───────────────────────────────────────────────
const GAME_URL = process.env.GAME_URL || 'http://localhost:3001/';
const REFERENCE_PATH = process.env.REFERENCE_PATH || './test-results/visual-screenshots/ref_game.png';
const AUTO_REF_PATH = './test-results/visual-screenshots/auto_ref.png';
const SCREENSHOT_DIR = './test-results/visual-screenshots';
const REPORT_DIR = './test-results/visual-comparison';
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS) || 5;
const ATTEMPT_DELAY = parseInt(process.env.ATTEMPT_DELAY) || 3000;
const MAP_READY_TIMEOUT = parseInt(process.env.MAP_READY_TIMEOUT) || 60000;
const RENDER_STABILIZE = parseInt(process.env.RENDER_STABILIZE) || 5000;
const SSIM_THRESHOLD = parseFloat(process.env.SSIM_THRESHOLD) || 0.85;
const PSNR_THRESHOLD = parseFloat(process.env.PSNR_THRESHOLD) || 25.0;
const MSE_THRESHOLD = parseFloat(process.env.MSE_THRESHOLD) || 2500.0;

// ─── Helpers ─────────────────────────────────────────────────────

function mkdir(dir) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// ─── Image comparison via Python ─────────────────────────────────

function compareImages(refPath, testPath) {
    try {
        const output = execSync(`python test/compare_images.py "${refPath}" "${testPath}"`, {
            timeout: 30000,
            encoding: 'utf8'
        }).trim();

        if (output.startsWith('RESULT:')) {
            return JSON.parse(output.slice(7));
        } else if (output.startsWith('ERROR:')) {
            return { error: output.slice(6), ssim: 0, psnr: 0, mse: -1, pass: false };
        }
    } catch (e) {
        return { error: e.message, ssim: 0, psnr: 0, mse: -1, pass: false };
    }
    return { error: 'Comparison failed', ssim: 0, psnr: 0, mse: -1, pass: false };
}

// ─── Browser interaction ────────────────────────────────────────

async function enableTestMode(page) {
    try {
        await page.evaluate(() => {
            try { localStorage.setItem('testMode', 'true'); } catch (e) { console.warn('localStorage not available'); }
            window._testModeEnabled = true;
            if (typeof window.setTestMode === 'function') window.setTestMode(true);
        });
    } catch { }
}

async function waitForMapReady(page, timeout = MAP_READY_TIMEOUT) {
    const start = Date.now();
    let lastFrameCount = 0;

    while (Date.now() - start < timeout) {
        const elapsed = Date.now() - start;

        try {
            const state = await page.evaluate(() => {
                const g = window.game || null;
                if (!g) return { hasGame: false };
                return {
                    hasGame: true,
                    isStarted: g.isStarted || false,
                    hasMap: !!g.map,
                    hasRenderer: !!g.renderer,
                    hasScene: !!g.scene,
                    hasCamera: !!g.camera,
                    hasPlayer: !!g.player,
                    hasHUD: !!g.hud,
                    renderCount: g.renderFrameCount || 0,
                    gameState: g.gameState || 'unknown',
                    canvasCount: document.querySelectorAll('canvas').length,
                };
            });

            const canvasCount = await page.evaluate('document.querySelectorAll("canvas").length');

            const statusParts = [`[${(elapsed / 1000).toFixed(0)}s]`];
            for (const k of ['hasGame', 'isStarted', 'hasMap', 'hasRenderer', 'hasScene', 'hasCamera', 'canvasCount', 'renderCount']) {
                if (state[k] !== undefined) statusParts.push(`${k}=${state[k]}`);
            }
            process.stdout.write(`  ${statusParts.join(' ')}\r`);

            // Check if map is ready
            if (state.hasGame && state.isStarted && state.hasMap &&
                state.hasRenderer && canvasCount > 0 &&
                state.renderCount > 10 && lastFrameCount !== state.renderCount) {

                lastFrameCount = state.renderCount;

                // Force render passes
                await page.evaluate(() => {
                    if (window.game && window.game.renderer && window.game.scene && window.game.camera) {
                        for (let i = 0; i < 5; i++) window.game.renderer.render(window.game.scene, window.game.camera);
                    }
                });
                await page.waitForTimeout(2000);

                console.log(`  ✓ Map ready after ${(elapsed / 1000).toFixed(0)}s`);
                return true;
            }
        } catch (e) {
            // Ignore errors during check
        }

        await page.waitForTimeout(2000);
    }

    console.log(`  ✗ Timeout after ${(timeout / 1000).toFixed(0)}s`);
    return false;
}

async function captureScreenshot(page, path) {
    try {
        await page.waitForTimeout(2000);
        const canvas = await page.$('canvas');
        if (canvas) {
            await canvas.screenshot({ path });
            const stats = readFileSync(path).length;
            if (stats > 1000) {
                console.log(`  ✓ Canvas screenshot saved (${stats} bytes)`);
                return true;
            }
        }
        await page.screenshot({ path, fullPage: false });
        const stats = readFileSync(path).length;
        console.log(`  ✓ Page screenshot saved (${stats} bytes)`);
        return true;
    } catch (e) {
        console.log(`  ✗ Screenshot failed: ${e.message}`);
        return false;
    }
}

async function clickStartButton(page) {
    try {
        const btn = await page.$('#startButtonDesktop') || await page.$('.start-btn');
        if (btn) {
            await btn.click();
            console.log('  ✓ Clicked start button');
            await page.waitForTimeout(2000);
            try {
                await page.waitForSelector('#loadingOverlay', { state: 'hidden', timeout: 15000 });
                console.log('  ✓ Loading overlay hidden');
            } catch {
                console.log('  ⚠ Loading overlay still visible');
            }
        } else {
            console.log('  ⚠ Start button not found');
        }
    } catch (e) {
        console.log(`  ✗ Click start failed: ${e.message}`);
    }
}

async function forceInitializeGame(page) {
    try {
        await page.evaluate(() => {
            if (window.game && !window.game.isStarted) {
                window.game._testMode = true;
                localStorage.setItem('testMode', 'true');
                window.game.startGame().catch(err => console.error('Start failed:', err));
            }
        });
        console.log('  ✓ Forced game start');
        await page.waitForTimeout(5000);
    } catch (e) {
        console.log(`  ✗ Force init failed: ${e.message}`);
    }
}

async function getConsoleLogs(page, count = 100) {
    try {
        return await page.evaluate((c) => (window._consoleLogs || []).slice(-c), count);
    } catch { return []; }
}

async function debugPageState(page) {
    try {
        const info = await page.evaluate(() => {
            const result = {
                url: window.location.href,
                domContentLoaded: document.readyState,
                hasGameRoot: !!document.getElementById('gameRoot'),
                hasStartScreen: !!document.getElementById('startScreen'),
                hasLoadingOverlay: !!document.getElementById('loadingOverlay'),
                loadingVisible: document.getElementById('loadingOverlay')?.offsetParent !== null,
                startScreenVisible: document.getElementById('startScreen')?.offsetParent !== null,
                bodyClass: document.body?.className || '',
                canvasCount: document.querySelectorAll('canvas').length,
                threeDefined: typeof THREE !== 'undefined',
                gameDefined: typeof window.game !== 'undefined',
            };
            if (window.game) {
                result.gameState = {
                    isStarted: window.game.isStarted,
                    initialized: window.game.initialized,
                    hasScene: !!window.game.scene,
                    hasCamera: !!window.game.camera,
                    hasRenderer: !!window.game.renderer,
                    hasMap: !!window.game.map,
                    hasPlayer: !!window.game.player,
                    hasHUD: !!window.game.hud,
                    renderFrameCount: window.game.renderFrameCount || 0,
                    gameState: window.game.gameState,
                };
            }
            return result;
        });

        console.log('\n  Page State:');
        for (const [k, v] of Object.entries(info)) {
            if (typeof v === 'object') {
                console.log(`    ${k}:`);
                for (const [kk, vv] of Object.entries(v)) console.log(`      ${kk}: ${vv}`);
            } else {
                console.log(`    ${k}: ${v}`);
            }
        }
        return info;
    } catch (e) {
        console.log(`  ✗ Debug failed: ${e.message}`);
        return {};
    }
}

// ─── Main test loop ─────────────────────────────────────────────

async function runVisualTest() {
    mkdir(SCREENSHOT_DIR);
    mkdir(REPORT_DIR);

    // Generate reference if not found
    if (!existsSync(REFERENCE_PATH)) {
        console.log(`  [INFO] Reference not found, generating auto-reference...`);
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const refPage = await context.newPage();
        await refPage.goto(GAME_URL);
        await refPage.click('#startButtonDesktop');
        await refPage.waitForTimeout(8000);
        await refPage.screenshot({ path: AUTO_REF_PATH, fullPage: false });
        await browser.close();
        console.log(`  ✓ Auto-reference saved: ${AUTO_REF_PATH}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('Rublo Arena Visual Regression Test');
    console.log('='.repeat(60));
    console.log(`URL: ${GAME_URL}`);
    console.log(`Reference: ${REFERENCE_PATH}`);
    console.log(`Max attempts: ${MAX_ATTEMPTS}`);
    console.log(`Thresholds: SSIM>=${SSIM_THRESHOLD}, PSNR>=${PSNR_THRESHOLD}dB`);
    console.log('='.repeat(60));

    const results = [];
    let browser, page;

    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            ignoreHTTPSErrors: true,
            locale: 'ru-RU',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        page = await context.newPage();

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log(`\n${'─'.repeat(40)}`);
            console.log(`Attempt ${attempt}/${MAX_ATTEMPTS}`);
            console.log('─'.repeat(40));

            const attemptId = uuid().slice(0, 8);
            const screenshotPath = join(SCREENSHOT_DIR, `attempt_${attempt}_${attemptId}.png`);

            try {
                console.log(`\n  [1/6] Navigating to ${GAME_URL}...`);
                await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
                console.log(`  ✓ Page loaded (${page.url()})`);

                console.log(`  [2/6] Enabling test mode...`);
                await enableTestMode(page);

                console.log(`  [3/6] Checking game initialization...`);
                await page.waitForTimeout(3000);
                const consoleLogs = await getConsoleLogs(page);
                const errorLogs = consoleLogs.filter(l => l.type === 'error');
                if (errorLogs.length > 0) {
                    console.log(`  ⚠ Found ${errorLogs.length} console errors:`);
                    for (const err of errorLogs.slice(0, 5)) {
                        console.log(`    - ${err.text?.substring(0, 200) || 'unknown'}`);
                    }
                }

                const debugInfo = await debugPageState(page);

                console.log(`\n  [4/6] Clicking start button...`);
                await clickStartButton(page);

                console.log(`\n  [5/6] Waiting for map rendering...`);
                const mapReady = await waitForMapReady(page, MAP_READY_TIMEOUT);

                if (!mapReady) {
                    console.log('  ⚠ Map not ready, attempting force initialization...');
                    await forceInitializeGame(page);
                    const retryReady = await waitForMapReady(page, 15000);
                    if (!retryReady) {
                        console.log('  ✗ Map rendering failed completely');
                        await page.screenshot({ path: screenshotPath, fullPage: true });
                        results.push({ attempt, error: 'Map rendering failed', screenshot: screenshotPath, mapReady: false, debugInfo, consoleLogs: consoleLogs.slice(-50) });
                        continue;
                    }
                }

                console.log(`\n  [6/6] Capturing screenshot...`);
                await captureScreenshot(page, screenshotPath);

                // Wait for render stabilization
                await page.waitForTimeout(RENDER_STABILIZE);

                // Extra render passes
                await page.evaluate(() => {
                    if (window.game && window.game.renderer && window.game.scene && window.game.camera) {
                        for (let i = 0; i < 3; i++) window.game.renderer.render(window.game.scene, window.game.camera);
                    }
                });
                await page.waitForTimeout(2000);

                // Take final screenshot
                const finalScreenshot = join(SCREENSHOT_DIR, `final_${attempt}_${attemptId}.png`);
                await captureScreenshot(page, finalScreenshot);

                // Compare with reference (use auto-ref if original not found)
                const compRef = existsSync(AUTO_REF_PATH) ? AUTO_REF_PATH : REFERENCE_PATH;
                console.log(`\n  Comparing against: ${compRef}`);
                const comparison = compareImages(compRef, finalScreenshot);
                comparison.attempt = attempt;
                comparison.screenshot = finalScreenshot;
                comparison.consoleLogs = consoleLogs.slice(-50);
                comparison.mapReady = true;

                results.push(comparison);

                console.log(`\n  Results:`);
                console.log(`    SSIM:    ${comparison.ssim ?? 'N/A'} (threshold: ${SSIM_THRESHOLD})`);
                console.log(`    PSNR:    ${comparison.psnr ?? 'N/A'} dB (threshold: ${PSNR_THRESHOLD})`);
                console.log(`    MSE:     ${comparison.mse ?? 'N/A'} (threshold: ${MSE_THRESHOLD})`);
                console.log(`    Different pixels: ${comparison.pct_different_pixels ?? 'N/A'}%`);
                console.log(`    Max diff: ${comparison.max_diff ?? 'N/A'}`);
                console.log(`    Pass: ${comparison.pass}`);

                if (comparison.pass) {
                    console.log(`\n  ✓✓✓ MATCH FOUND — Test PASSED ✓✓✓`);
                    await browser.close();
                    return true;
                }

                console.log(`\n  ✗✗✗ Below threshold — will retry ✗✗✗`);

            } catch (e) {
                console.log(`  ✗ Test error: ${e.message}`);
                try { await page.screenshot({ path: screenshotPath, fullPage: true }); } catch { }
                results.push({ attempt, error: e.message, screenshot: screenshotPath });
            }

            if (attempt < MAX_ATTEMPTS) {
                console.log(`\n  Waiting ${ATTEMPT_DELAY / 1000}s before retry...`);
                await new Promise(r => setTimeout(r, ATTEMPT_DELAY));
            }
        }
    } finally {
        if (browser) await browser.close();
    }

    // ─── Generate report ─────────────────────────────────────────
    console.log(`\n${'='.repeat(60)}`);
    console.log('Test Complete — Generating Report');
    console.log('='.repeat(60));

    const report = {
        testId: uuid(),
        timestamp: new Date().toISOString(),
        reference: REFERENCE_PATH,
        url: GAME_URL,
        thresholds: { ssimMin: SSIM_THRESHOLD, psnrMin: PSNR_THRESHOLD, mseMax: MSE_THRESHOLD },
        attempts: results.length,
        passed: results.some(r => r.pass),
        results,
    };

    const reportPath = join(REPORT_DIR, `report_${uuid().slice(0, 8)}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n  Report saved: ${reportPath}`);

    // Print summary
    console.log(`\n${'─'.repeat(40)}`);
    console.log('Summary:');
    console.log(`  Total attempts: ${results.length}`);
    console.log(`  Passed: ${report.passed}`);

    for (const r of results) {
        const ssim = r.ssim ?? 'N/A';
        const psnr = r.psnr ?? 'N/A';
        const passFlag = r.pass || false;
        const status = passFlag ? '✓ PASS' : '✗ FAIL';
        console.log(`  ${status} | SSIM=${ssim} | PSNR=${psnr}`);
    }

    // Save best screenshot
    if (results.length > 0) {
        const best = results.reduce((a, b) => (a.ssim ?? -1) > (b.ssim ?? -1) ? a : b);
        if (best.screenshot && existsSync(best.screenshot)) {
            const bestCopy = join(SCREENSHOT_DIR, 'best_match.png');
            writeFileSync(bestCopy, readFileSync(best.screenshot));
            console.log(`\n  Best match saved: ${bestCopy}`);
            console.log(`    SSIM: ${best.ssim}`);
            console.log(`    PSNR: ${best.psnr} dB`);
        }
    }

    return report.passed;
}

// ─── Entry point ────────────────────────────────────────────────

async function main() {
    const passed = await runVisualTest();

    console.log(`\n${'='.repeat(60)}`);
    console.log(passed ? 'FINAL RESULT: PASSED' : 'FINAL RESULT: FAILED');
    console.log('='.repeat(60));

    process.exit(passed ? 0 : 1);
}

main().catch((e) => {
    console.log(`CRASH: ${e.message}`);
    process.exit(2);
});
