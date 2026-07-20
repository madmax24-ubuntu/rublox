import { chromium } from 'playwright';
import fs from 'fs';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('console', (msg) => { if (msg.type() === 'error') console.error(msg.text()); });

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.locator('text=Начать игру').first().click();
    await page.waitForTimeout(3000);

    const perks = ['Быстрые руки','Тихий шаг','Больше патронов','Быстрый бег','Толстая кожа','Устойчивая прицел','Авто-огонь'];
    for (const perk of perks) {
        const el = page.locator(`text=${perk}`).first();
        if (await el.isVisible().catch(() => false)) { await el.click(); await page.waitForTimeout(500); break; }
    }
    await page.waitForTimeout(15000);
    const startBtn = page.locator('text=Начать игру').first();
    if (await startBtn.isVisible().catch(() => false)) { await startBtn.click(); await page.waitForTimeout(5000); }

    const data = await page.evaluate(() => {
        const game = window.game;
        if (!game) return null;
        const results = { player: {}, bots: [] };

        const p = game.player;
        if (p) {
            const box = new THREE.Box3().setFromObject(p.mesh);
            results.player = {
                modelHeight: box.max.y - box.min.y,
                modelMinY: box.min.y,
                modelMaxY: box.max.y,
                physicsHeight: p.physics.height,
                physicsRadius: p.physics.radius,
                meshScale: p.mesh.scale.clone(),
                position: p.position.clone(),
                meshPos: p.mesh.position.clone(),
                meshWorldPos: (() => { const v = new THREE.Vector3(); p.mesh.getWorldPosition(v); return v.clone(); })()
            };
        }

        for (const bot of game.bots) {
            if (!bot.isAlive) continue;
            const box = new THREE.Box3().setFromObject(bot.mesh);
            results.bots.push({
                id: bot.id,
                modelHeight: box.max.y - box.min.y,
                modelMinY: box.min.y,
                modelMaxY: box.max.y,
                physicsHeight: bot.physics.height,
                physicsRadius: bot.physics.radius,
                meshScale: bot.mesh.scale.clone(),
                position: bot.position.clone(),
                meshPos: bot.mesh.position.clone(),
                meshWorldPos: (() => { const v = new THREE.Vector3(); bot.mesh.getWorldPosition(v); return v.clone(); })()
            });
        }
        return results;
    });

    if (data) {
        fs.writeFileSync('test-results/diagnostic.json', JSON.stringify(data, null, 2));
        console.log('Diagnostic data saved to test-results/diagnostic.json');
    } else {
        console.error('Could not get diagnostic data');
    }

    await browser.close();
}

main().catch(console.error);
