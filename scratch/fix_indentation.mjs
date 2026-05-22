const fs = require('fs');

// Читаем текущий файл
let content = fs.readFileSync('world/MapGenerator.js', 'utf8');
const lines = content.split('\n');

// Находим границы методов и заменяем их
function findMethodStart(lines, methodName) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(methodName + '()')) return i;
  }
  return -1;
}

// Правильные методы с отступами в 8 пробелов
const buildCentralPlazaCode = `    buildCentralPlaza() {
        const outerRadius = this.spawnPlazaRadius;

        // Платформа чуть выше уровня биома (0.176), чтобы визуально выделялась
        const platformHeight = 0.3; 

        const baseY = 0.176 + platformHeight * 0.5; // Центр платформы по Y


        console.log(\`[MapGenerator] buildCentralPlaza: radius=\${outerRadius}, height=\${platformHeight}\`);


        // Основная платформа — круглая каменная площадка (один слой, как на референсе)
        const basePlatform = new THREE.Mesh(
            new THREE.CylinderGeometry(outerRadius, outerRadius * 0.98, platformHeight, 64),
            this.materials.plazaStone
        );
        basePlatform.position.set(0, baseY, 0);
        this.addMesh(basePlatform);

        
        // Декоративный бортик по краю (как на референсе)
        const edgeRing = new THREE.Mesh(
            new THREE.CylinderGeometry(outerRadius * 1.02, outerRadius * 1.0, platformHeight + 0.05, 64),
            this.materials.plazaAccent
        );
        edgeRing.position.set(0, baseY + 0.01, 0);
        this.addMesh(edgeRing);

        
        // Коллайдер для платформы
        this.addColliderBox(new THREE.Vector3(0, baseY, 0), outerRadius * 2, platformHeight + 0.1, outerRadius * 2, true);


        console.log(\`[MapGenerator] buildCentralPlaza: добавлена платформа r=\${outerRadius}, h=\${platformHeight}\`);


        // Рога изобилия в центре (на центральной платформе)
        this.buildCornucopia(baseY + platformHeight); 

        
        // Спавн-платформы по окраине центральной площадки — ровно 100 штук как на референсе
        this.buildSpawnPads(100, baseY + platformHeight);


        // Дорожки от центра к каждому биому (4 тропинки)
        this.buildBiomePaths(baseY + platformHeight);
    }`;

const buildCornucopiaCode = `    buildCornucopia(baseY) {
        // baseY — высота центральной платформы (переданная из buildCentralPlaza)
        console.log(\`[MapGenerator] buildCornucopia: baseY=\${baseY}\`);


        // Рога изобилия — золотой конус, стоит прямо на платформе (как на референсе)
        const hornGroup = new THREE.Group();
        hornGroup.position.set(0, baseY, 0); 
        this.addMesh(hornGroup);


        // Основной рог — высокий золотой конус/пирамида (как на референсе)
        const mainHorn = new THREE.Mesh(
            new THREE.ConeGeometry(3.5, 14, 8), // Восьмигранная пирамидальная форма
            this.materials.gold
        );
        mainHorn.position.set(0, 7, 0); // Центр конуса на высоте 7 (половина высоты)
        hornGroup.add(mainHorn);


        // Золотая кромка/бортик внизу рога
        const hornRim = new THREE.Mesh(
            new THREE.CylinderGeometry(3.4, 3.2, 0.4, 8),
            this.materials.goldDark
        );
        hornRim.position.set(0, 0.2, 0);
        hornGroup.add(hornRim);


        // Золотой крест на передней части рога (как на референсе)
        const crossGroup = new THREE.Group();
        crossGroup.position.set(0, 8, 1.8); // На передней поверхности конуса
        crossGroup.rotation.y = Math.PI / 2; // Поворот к игрокам

        // Вертикальная часть креста
        const crossVertical = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 2.5, 0.1),
            this.materials.goldDark
        );
        crossGroup.add(crossVertical);

        // Горизонтальная часть креста
        const crossHorizontal = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.3, 0.1),
            this.materials.goldDark
        );
        crossHorizontal.position.y = 0.8; // Сдвиг вверх от центра вертикали
        crossGroup.add(crossHorizontal);

        hornGroup.add(crossGroup);


        // Коллайдер для рога изобилия
        this.addColliderBox(new THREE.Vector3(0, baseY + 7, 0), 7, 14, 7, false);
    }`;

const buildSpawnPadsCode = `    buildSpawnPads(count, baseY) {
        this.spawnPads = [];
        const radius = this.spawnPlazaRadius * 0.95; // По окраине платформы (~57м из 60м)


        console.log(\`[MapGenerator] buildSpawnPads: \${count} пэдов на радиусе \${radius.toFixed(1)}м\`);




        for (let i = 0; i < count; i++) {

            const angle = (i / count) * Math.PI * 2;


            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;


            // Простая круглая платформа для спавна (как на референсе)
            const padGroup = new THREE.Group();
            padGroup.position.set(x, baseY, z);


            // Базовая круглая плита — цвет как у основной площадки
            const basePlate = new THREE.Mesh(
                new THREE.CylinderGeometry(1.5, 1.4, 0.2, 24),
                this.materials.plazaStone
            );
            basePlate.position.y = 0.1;
            padGroup.add(basePlate);


            // Тонкий бортик по краю (как на референсе)
            const edgeRing = new THREE.Mesh(
                new THREE.CylinderGeometry(1.52, 1.48, 0.25, 24),
                this.materials.plazaAccent
            );
            edgeRing.position.y = 0.15;
            padGroup.add(edgeRing);


            this.addMesh(padGroup);


            // Позиция спавна игрока (над платформой)
            const spawnY = baseY + 0.2 + 1.7;
            this.spawnPads.push({ x, y: spawnY, z, angle: -angle });


            // Коллайдер для платформы
            this.addColliderBox(new THREE.Vector3(x, baseY + 0.1, z), 3, 0.25, 3, true);
        }


        console.log(\`[MapGenerator] buildSpawnPads: добавлено \${count} платформ спавна на радиусе \${radius}\`);
    }`;

// Находим и заменяем методы
const cpStart = findMethodStart(lines, 'buildCentralPlaza');
const cornStart = findMethodStart(lines, 'buildCornucopia');
const spStart = findMethodStart(lines, 'buildSpawnPads');

console.log('Found methods at lines:', { buildCentralPlaza: cpStart + 1, buildCornucopia: cornStart + 1, buildSpawnPads: spStart + 1 });

// Заменяем каждый метод
function replaceMethod(startLine, newCode) {
  // Ищем конец метода (закрывающая скобка на уровне класса)
  let braceCount = 0;
  let endLine = startLine;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;
    if (braceCount === 0 && line.includes('}')) {
      endLine = i;
      break;
    }
  }
  
  console.log(`Replacing lines ${startLine + 1}-${endLine + 1}`);
  const newLines = newCode.split('\n');
  lines.splice(startLine, endLine - startLine + 1, ...newLines);
}

replaceMethod(cpStart, buildCentralPlazaCode);
// После первой замены индексы сдвинулись, нужно пересчитать
const cpNewEnd = cpStart + buildCentralPlazaCode.split('\n').length;
console.log('After first replacement, next method starts around line', cpNewEnd);

// Перечитаем для точности
replaceMethod(cpNewEnd - 1, buildCornucopiaCode);
const cornNewEnd = cpNewEnd - 1 + buildCornucopiaCode.split('\n').length;

replaceMethod(cornNewEnd - 1, buildSpawnPadsCode);

// Сохраняем файл
fs.writeFileSync('world/MapGenerator.js', lines.join('\n'));
console.log('Done! File saved.');