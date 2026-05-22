import { chromium } from 'playwright';
import http from 'http';

// First check if server responds
const mainRes = await new Promise((resolve, reject) => {
    http.get('http://localhost:3001/main.js', res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: data.substring(0, 200) }));
    }).on('error', reject);
});
console.log('main.js response:', mainRes.status);
console.log('Content-Type:', mainRes.headers['content-type']);
console.log('First 200 chars:', mainRes.data.substring(0, 200));

// Check index.html
const indexRes = await new Promise((resolve, reject) => {
    http.get('http://localhost:3001/', res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: data.substring(0, 500) }));
    }).on('error', reject);
});
console.log('\nindex.html response:', indexRes.status);
console.log('Content-Type:', indexRes.headers['content-type']);
