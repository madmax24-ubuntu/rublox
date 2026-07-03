const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:3001/');
    await page.click('#startButtonDesktop');
    await page.waitForTimeout(5000);
    const canvas = await page.$('canvas');
    if (canvas) {
        await canvas.screenshot({ path: './test-results/current_map.png' });
        console.log('Saved current map screenshot');
    }
    const ref = fs.readFileSync('./Gemini_Generated_Image_qgbvlxqgbvlxqgbv.png');
    fs.writeFileSync('./test-results/reference.png', ref);
    console.log('Saved reference image');
    await browser.close();
})();
