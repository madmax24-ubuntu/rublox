import { chromium } from 'playwright';

const URL = 'http://localhost:3001?debug=true';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));
    page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));

    console.log('Opening debug mode...');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(10000);

    // Start multi-camera test
    console.log('\n📷 Starting multi-camera test...');
    await page.evaluate(() => {
        if (window.runTestCameras) {
            window.runTestCameras();
            console.log('🚀 Multi-camera test started');
        } else {
            console.error('❌ runTestCameras not available');
        }
    });

    // Wait for test to complete
    await page.waitForTimeout(testCamerasTotalTime() + 5000);

    console.log('\n=== VERIFICATION COMPLETE ===');
    console.log('Screenshots saved as test-*.png in browser downloads folder');
    console.log('Check browser console for camera positions and screenshot confirmations');

    // Take final verification screenshot
    await page.screenshot({ path: 'test-screenshots/final_verification.png', fullPage: false });
    console.log('✅ Final verification screenshot saved');

    await browser.close();
})();

function testCamerasTotalTime() {
    // 14 cameras × 3000ms each + 500ms delay each = ~52 seconds
    return 14 * 3500;
}
