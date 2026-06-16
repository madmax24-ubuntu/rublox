import fs from 'fs';
let vs = fs.readFileSync('world/VoronoiSectors.js', 'utf8');

// Fix 1: count parameter (change from 12 to 16)
vs = vs.replace("generate(count = 12)", "    generate(count = 16)");

// Fix 2: cols from 3 to 4
const lines = vs.split('\n');
for (let i = 0; i < Math.min(200, lines.length); i++) {
    if (/^\s*const cols = 3;\s*$/.test(lines[i])) {
        lines[i] = '        const cols = 4;';
        break;
    }
}

// Fix 3: Replace the entire biomePattern block (lines ~150-158)
let startLine = -1, endLine = -1;
for (let i = 0; i < Math.min(200, lines.length); i++) {
    if (lines[i].includes("// 4 rows x 3 cols grid matching")) { startLine = i; }
    if (startLine >= 0 && endLine === -1 && /^\s*\];\s*$/.test(lines[i])) { endLine = i; break; }
}

if (startLine >= 0 && endLine > startLine) {
    const newBlock = [
        "        // 4x4 grid - clean quadrant layout:",
        "        //   NW(top-left, z<0,x<0)    NE(top-right, z<0,x>0)",
        "        //   SW(bottom-left,z>0,x<0) SE(bottom-right,z>0,x>0)",
        "        const biomePattern = [",
        "            ['forest', 'plains',     'stone_maze',  'stone_maze'],    // row 0 - NW forest | NE stone maze",
        "            ['forest', 'industrial','military',      'stone_maze'],   // row 1 - transition to SW military",
        "            ['swamp',  'ruins',       'ice_lake',     'plains'],       // row 2",
        "            ['ice_lake','forest',    'military',       'ice_lake']"
    ];
    lines.splice(startLine, endLine - startLine + 1, ...newBlock);

    fs.writeFileSync('world/VoronoiSectors.js', lines.join('\n'));
    console.log(`VoronoiSectors.js fixed: replaced lines ${startLine+1} to ${endLine+1}`);
} else {
    console.log("Could not find biomePattern block");
}
