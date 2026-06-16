const fs = require('fs');
let vs = fs.readFileSync('../VoronoiSectors.js', 'utf8');

// Fix 1: count parameter (change from 12 to 16)
vs = vs.replace("generate(count = 12)", "    generate(count = 16)");

// Fix 2: cols from 3 to 4
vs = vs.replace("const cols = 3;", "        const cols = 4;");

// Fix 3: Replace the entire biomePattern block
let idxStart = -1, idxEnd = -1;
const posMatch = vs.indexOf("// 4 rows x 3 cols grid matching");
if (posMatch >= 0) {
    idxStart = posMatch;
    let searchFrom = posMatch + 60;
    const bracketPos = vs.indexOf('];', searchFrom);
    if (bracketPos > 0) {
        idxEnd = bracketPos + 2;
    }

    if (idxStart >= 0 && idxEnd > idxStart) {
        const newPatternBlock = `        // 4x4 grid - clean quadrant layout:
        //   NW(top-left, z<0,x<0)    NE(top-right, z<0,x>0)
        //   SW(bottom-left,z>0,x<0) SE(bottom-right,z>0,x>0)
        const biomePattern = [
            ['forest', 'plains',     'stone_maze',  'stone_maze'],    // row 0 - NW forest | NE stone maze
            ['forest', 'industrial','military',      'stone_maze'],   // row 1 - transition to SW military
            ['swamp',  'ruins',       'ice_lake',     'plains'],       // row 2
            ['ice_lake','forest',    'military',       'ice_lake']`;

        vs = vs.substring(0, idxStart) + newPatternBlock + vs.substring(idxEnd);
    }
}

fs.writeFileSync('../VoronoiSectors.js', vs);
console.log('VoronoiSectors.js fixed');
