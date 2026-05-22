import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let requests = [];
let failures = [];

page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text().substring(0, 300)}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERROR] ${err.message.substring(0, 500)}`);
});
page.on('requestfailed', req => {
    failures.push(req.url());
    console.log(`[FAILED] ${req.url().substring(req.url().indexOf('/rublox'))}`);
});
page.on('request', req => {
    const url = req.url();
    if (url.includes('/rublox/')) {
        requests.push(url.substring(url.indexOf('/rublox')));
    }
});
page.on('response', resp => {
    const url = resp.request().url();
    if (url.includes('/rublox/') && resp.status() !== 200) {
        console.log(`[RESP ${resp.status()}] ${url.substring(url.indexOf('/rublox'))}`);
    }
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

console.log(`\n=== Summary ===`);
console.log(`Total requests: ${requests.length}`);
console.log(`Total failures: ${failures.length}`);

if (failures.length > 0) {
    console.log('\nFailed requests:');
    failures.forEach(f => console.log(f.substring(f.indexOf('/rublox'))));
}

await browser.close();
