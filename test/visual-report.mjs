/**
 * Visual test viewer - generates HTML report of all screenshots
 * Usage: node test/visual-report.mjs
 */

import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'test/automated';
const REPORT_FILE = 'test/visual-report.html';

function generateReport() {
    const files = fs.readdirSync(SCREENSHOT_DIR)
        .filter(f => f.endsWith('.png'))
        .sort();

    const imgCards = files.map(f => {
        const stat = fs.statSync(path.join(SCREENSHOT_DIR, f));
        const time = stat.mtime.toLocaleString();
        const name = f.replace('ss_', '').replace('.png', '').replace('_', ' ');
        return `
                <div class="card">
                    <img src="${f}" alt="${name}" />
                    <div class="info">
                        <div class="name">${name}</div>
                        <div class="time">${time}</div>
                    </div>
                </div>`;
    }).join('\n        ');

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Visual Test Report</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #1a1a2e;
            color: #eee;
            margin: 0;
            padding: 20px;
        }
        h1 {
            text-align: center;
            color: #00d4ff;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 20px;
            padding: 20px 0;
        }
        .card {
            background: #16213e;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        .card img {
            width: 100%;
            height: auto;
            display: block;
        }
        .card .info {
            padding: 12px;
            font-size: 14px;
        }
        .card .name {
            font-weight: bold;
            color: #00d4ff;
        }
        .card .time {
            color: #888;
            font-size: 12px;
            margin-top: 4px;
        }
        .stats {
            text-align: center;
            padding: 20px;
            background: #0f3460;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .stats span {
            margin: 0 20px;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <h1>Visual Test Report</h1>
    <div class="stats">
        <span>Screenshots: ${files.length}</span>
        <span>Directory: ${SCREENSHOT_DIR}</span>
    </div>
    <div class="grid">
        ${imgCards}
    </div>
</body>
</html>`;

    fs.writeFileSync(REPORT_FILE, html);
    console.log('Report generated: ' + REPORT_FILE);
    console.log('Total screenshots: ' + files.length);
}

generateReport();
