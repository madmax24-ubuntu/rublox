// 10-minute automated game test with state capture and BOM feedback
// Usage: node test-10min.js

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3001;
const TEST_DURATION_MS = process.argv[2] ? parseInt(process.argv[2]) * 1000 : 10 * 60 * 1000; // default 10 min, override with arg
const CAPTURE_INTERVAL_MS = 15 * 1000; // every 15 seconds
const REPORT_FILE = path.join(process.cwd(), 'test-report.json');

let server = null;
let browser = null;
let page = null;
let testStartTime = null;
let captureTimer = null;
let issues = [];
let stateHistory = [];

// Simple static file server
function startServer() {
    return new Promise((resolve) => {
        server = http.createServer((req, res) => {
            // Strip query string from URL
            const cleanUrl = req.url.split('?')[0];
            let filePath = '.' + cleanUrl;
            if (filePath === './' || filePath === '.') filePath = './index.html';
            
            const ext = path.extname(filePath);
            const contentTypes = {
                '.html': 'text/html; charset=UTF-8',
                '.js': 'text/javascript; charset=UTF-8',
                '.mjs': 'text/javascript; charset=UTF-8',
                '.css': 'text/css; charset=UTF-8',
                '.json': 'application/json; charset=UTF-8'
            };
            
            fs.readFile(filePath, (err, contents) => {
                if (err) {
                    console.log(`[Server] 404: ${req.url} -> ${cleanUrl}`);
                    res.writeHead(404);
                    res.end('Not found');
                } else {
                    console.log(`[Server] 200: ${req.url} -> ${filePath} (${ext})`);
                    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain; charset=UTF-8' });
                    res.end(contents);
                }
            });
        });
        server.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            resolve();
        });
    });
}

function stopServer() {
    if (server) {
        server.close();
        console.log('Server stopped');
    }
}

// Capture game state from the browser
async function captureGameState() {
    try {
        const state = await page.evaluate(() => {
            if (!window.game) return { error: 'No game instance' };
            
            const g = window.game;
            return {
                timestamp: Date.now(),
                gameState: g.gameState || 'unknown',
                isStarted: g.isStarted,
                playerHealth: g.player?.health ?? 'N/A',
                playerPosition: g.player ? {
                    x: g.player.position?.x ?? 'N/A',
                    y: g.player.position?.y ?? 'N/A',
                    z: g.player.position?.z ?? 'N/A'
                } : 'N/A',
                playerAlive: g.player?.isAlive,
                botCount: g.bots?.length || 0,
                zombieCount: g.zombies?.length || 0,
                botKills: g.bots?.reduce((sum, b) => sum + (b.stats?.kills || 0), 0) || 0,
                playerKills: g.player?.stats?.kills || 0,
                playerInventory: g.player?.inventory?.items?.length || 0,
                playerWeapon: g.player?.currentWeapon?.type || 'none',
                zoneRadius: g.zone?.getCurrentRadius?.() || 'N/A',
                zoneDamage: g.zone?.getDamage?.() || 'N/A',
                fps: g.hud?.fps || 'N/A',
                frameTime: g.hud?.frameTime || 'N/A',
                weather: g.environment?.weatherType || 'N/A',
                stormActive: g.environment?.stormActive,
                roundTime: g.roundTime || 'N/A',
                pendingEvents: g.pendingZombieBursts?.length || 0,
                chestCount: g.lootManager?.chests?.length || 0,
                supplyDrops: g.lootManager?.supplyDrops?.length || 0,
                physicsStats: g.physics?.getStats?.() || 'N/A',
                aabbGridStats: g.aabbGrid?.getStats?.() || 'N/A'
            };
        });
        
        stateHistory.push(state);
        
        // Check for issues
        if (state.error) {
            issues.push({
                time: Date.now() - testStartTime,
                type: 'error',
                message: state.error
            });
        }
        
        // Check player health
        if (typeof state.playerHealth === 'number' && state.playerHealth <= 0 && state.playerAlive !== false) {
            issues.push({
                time: Date.now() - testStartTime,
                type: 'health_zero',
                message: 'Player health is 0 but still alive'
            });
        }
        
        // Check for NaN positions
        const pos = state.playerPosition;
        if (typeof pos === 'object' && pos !== null) {
            if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
                issues.push({
                    time: Date.now() - testStartTime,
                    type: 'nan_position',
                    message: `Player position has NaN: x=${pos.x}, y=${pos.y}, z=${pos.z}`
                });
            }
        }
        
        // Check for extremely high FPS (indicates no frame capping)
        if (typeof state.fps === 'number' && state.fps > 200) {
            issues.push({
                time: Date.now() - testStartTime,
                type: 'high_fps',
                message: `FPS too high: ${state.fps}`
            });
        }
        
        // Check bot count consistency
        if (typeof state.botCount === 'number' && state.botCount > 98) {
            issues.push({
                time: Date.now() - testStartTime,
                type: 'bot_overflow',
                message: `Bot count exceeds 98: ${state.botCount}`
            });
        }
        
        // Check for stuck bots
        if (typeof state.botCount === 'number' && state.botCount > 0) {
            const stuckBots = await page.evaluate(() => {
                return window.game?.bots?.filter(b => b.isStuck)?.length || 0;
            });
            if (stuckBots > 5) {
                issues.push({
                    time: Date.now() - testStartTime,
                    type: 'many_stuck_bots',
                    message: `${stuckBots} bots are stuck`
                });
            }
        }
        
        console.log(`[Capture] State: gameState=${state.gameState}, bots=${state.botCount}, zombies=${state.zombieCount}, playerHP=${state.playerHealth}, fps=${state.fps}`);
        
    } catch (e) {
        issues.push({
            time: Date.now() - testStartTime,
            type: 'capture_error',
            message: e.message
        });
        console.error('Capture error:', e.message);
    }
}

// Generate final report
function generateReport() {
    const report = {
        startTime: new Date(testStartTime).toISOString(),
        duration: Date.now() - testStartTime,
        totalCaptures: stateHistory.length,
        totalIssues: issues.length,
        issues: issues,
        stateHistory: stateHistory.slice(-10), // Last 10 captures
        summary: {
            critical: issues.filter(i => ['error', 'nan_position', 'health_zero'].includes(i.type)).length,
            warnings: issues.filter(i => !['error', 'nan_position', 'health_zero'].includes(i.type)).length,
            avgBotCount: stateHistory.reduce((s, h) => s + (h.botCount || 0), 0) / (stateHistory.length || 1),
            avgZombieCount: stateHistory.reduce((s, h) => s + (h.zombieCount || 0), 0) / (stateHistory.length || 1),
            avgPlayerHealth: stateHistory.filter(h => typeof h.playerHealth === 'number').reduce((s, h) => s + h.playerHealth, 0) / (stateHistory.filter(h => typeof h.playerHealth === 'number').length || 1),
            avgFPS: stateHistory.filter(h => typeof h.fps === 'number').reduce((s, h) => s + h.fps, 0) / (stateHistory.filter(h => typeof h.fps === 'number').length || 1)
        }
    };
    
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to ${REPORT_FILE}`);
    console.log(`\n=== TEST SUMMARY ===`);
    console.log(`Duration: ${((Date.now() - testStartTime) / 1000).toFixed(0)}s`);
    console.log(`Captures: ${stateHistory.length}`);
    console.log(`Issues: ${issues.length}`);
    console.log(`Critical: ${report.summary.critical}`);
    console.log(`Warnings: ${report.summary.warnings}`);
    console.log(`Avg FPS: ${report.summary.avgFPS?.toFixed(1) || 'N/A'}`);
    console.log(`Avg Bot Count: ${report.summary.avgBotCount?.toFixed(1) || 'N/A'}`);
    console.log(`Avg Zombie Count: ${report.summary.avgZombieCount?.toFixed(1) || 'N/A'}`);
    console.log(`Avg Player Health: ${report.summary.avgPlayerHealth?.toFixed(1) || 'N/A'}`);
    
    if (issues.length > 0) {
        console.log(`\n=== ISSUES ===`);
        issues.slice(0, 20).forEach((issue, i) => {
            console.log(`  ${i + 1}. [${new Date(issue.time + testStartTime).toISOString()}] ${issue.type}: ${issue.message}`);
        });
        if (issues.length > 20) {
            console.log(`  ... and ${issues.length - 20} more`);
        }
    }
    
    return report;
}

// Main test flow
async function runTest() {
    console.log('Starting 10-minute automated game test...');
    
    // Start server
    await startServer();
    
    // Launch browser
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    // Navigate to game
    const url = `http://localhost:${PORT}`;
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    // Check if page loaded correctly
    const title = await page.title();
    console.log(`Page title: ${title}`);
    const hasGame = await page.evaluate(() => !!window.game);
    console.log(`window.game exists: ${hasGame}`);
    const hasScriptError = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script');
        return Array.from(scripts).filter(s => s.hasAttribute('error')).length;
    });
    console.log(`Scripts with errors: ${hasScriptError}`);
    
    // Wait for game to initialize
    console.log('Waiting for game initialization...');
    
    // Listen for console messages
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[Game]') || text.includes('error') || text.includes('Game loaded')) {
            console.log(`[Browser] ${text}`);
        }
    });
    page.on('pageerror', err => {
        console.error(`[PageError] ${err.message}`);
        issues.push({
            time: Date.now() - testStartTime || 0,
            type: 'page_error',
            message: err.message
        });
    });
    
    await page.waitForFunction(() => window.game !== undefined, { timeout: 60000 });
    
    // Wait for game to actually start (not just load)
    await page.waitForFunction(() => {
        const g = window.game;
        return g && (g.isStarted || g.gameState === 'playing' || g.gameState === 'spawn');
    }, { timeout: 120000 }).catch(() => {
        console.log('Game loaded but not in playable state yet - continuing anyway');
    });
    
    testStartTime = Date.now();
    console.log(`Test started at ${new Date(testStartTime).toISOString()}`);
    
    // Start periodic state capture
    captureTimer = setInterval(captureGameState, CAPTURE_INTERVAL_MS);
    await captureGameState(); // First capture
    
    // Set up test duration timer
    const testTimer = setTimeout(async () => {
        console.log('Test duration reached. Stopping...');
        clearInterval(captureTimer);
        
        // Final capture
        await captureGameState();
        
        // Generate report
        const report = generateReport();
        
        // Close browser
        await browser.close();
        stopServer();
        
        // Exit with appropriate code
        process.exit(report.summary.critical > 0 ? 1 : 0);
    }, TEST_DURATION_MS);
    
    // Handle cleanup on exit
    process.on('SIGINT', () => {
        console.log('\nInterrupted. Cleaning up...');
        clearInterval(captureTimer);
        clearTimeout(testTimer);
        generateReport();
        browser.close().then(() => {
            stopServer();
            process.exit(1);
        });
    });
    
    console.log(`Test will run for ${TEST_DURATION_MS / 1000 / 60} minutes. Capturing state every ${CAPTURE_INTERVAL_MS / 1000} seconds.`);
}

runTest().catch(err => {
    console.error('Test failed:', err);
    browser?.close();
    stopServer();
    process.exit(1);
});
