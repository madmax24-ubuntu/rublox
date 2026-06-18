const fs = require('fs');
const path = require('path');

function fixFile(filePath) {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) return;
    
    let content = fs.readFileSync(fullPath, 'utf8');
    // Replace relative paths with absolute paths from root
    const fixed = content.replace(/from\s+["'][\.\.\/]*node_modules\/three\/build\/three\.module\.js["']/g, 'from "/node_modules/three/build/three.module.js"');
    
    if (fixed !== content) {
        fs.writeFileSync(fullPath, fixed, 'utf8');
        console.log('Fixed:', filePath);
    }
}

// Fix all JS files
const dirs = ['.', 'core', 'entities', 'items', 'world', 'ui', 'design-principles'];
dirs.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) return;
    
    fs.readdirSync(dirPath, {withFileTypes: true}).forEach(entry => {
        if (entry.isFile() && entry.name.endsWith('.js')) {
            fixFile(path.join(dir, entry.name));
        }
    });
});

// Also fix main.js in root
fixFile('main.js');
