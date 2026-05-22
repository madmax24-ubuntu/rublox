import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let allRequests = [];
let allResponses = [];

page.on('request', req => {
    allRequests.push(req.url());
});
page.on('response', resp => {
    allResponses.push({ url: resp.url(), status: resp.status() });
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

console.log(`\n=== Requests (${allRequests.length}) ===`);
allRequests.forEach(url => {
    const short = url.substring(url.indexOf('/rublox') + 1);
    console.log(short);
});

console.log(`\n=== Responses (${allResponses.length}) ===`);
allResponses.forEach(r => {
    const short = r.url.substring(r.url.indexOf('/rublox') + 1);
    console.log(`${r.status} ${short}`);
});

await browser.close();
