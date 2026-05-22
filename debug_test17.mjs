import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let allConsole = [];
let allErrors = [];

page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    allConsole.push(text);
    if (msg.type() === 'error' || msg.text().toLowerCase().includes('error')) {
        console.log(text.substring(0, 500));
    }
});
page.on('pageerror', err => {
    const text = `[PAGEERROR] ${err.message}`;
    allErrors.push(text);
    console.log(text.substring(0, 500));
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

console.log(`\n=== Summary ===`);
console.log(`Total console messages: ${allConsole.length}`);
console.log(`Total pageerrors: ${allErrors.length}`);

if (allConsole.length > 0) {
    console.log('\n=== All console messages ===');
    allConsole.forEach(m => console.log(m.substring(0, 300)));
}

if (allErrors.length > 0) {
    console.log('\n=== All pageerrors ===');
    allErrors.forEach(e => console.log(e.substring(0, 300)));
}

await browser.close();
