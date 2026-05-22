/**
 * CentralHubGenerator - Generates the central hub with Rose Compass + Cornucopia
 * 
 * Features:
 * - Mosaic plinth with 24 mini-figures in a perfect circle
 * - Golden Cornucopia (roar of abundance) in center
 * - Decorative grass ring
 */

import * as THREE from 'three';

export default class CentralHubGenerator {
    constructor(mapGen, materialSystem) {
        this.mapGen = mapGen;
        this.matSys = materialSystem;
        
        // Параметры центра
        this.hubRadius = 45;       // Радиус центральной зоны
        this.circleRadius = 24;     // Радиус круга фигур
        this.cornucopiaSize = 15;   // Размер рога
        this.plinthSize = 50;       // Размер пьедестала
    }

    /**
     * Generates the complete central hub
     */
    generate() {
        console.log('[CentralHub] Generating central hub...');
        
        // 1. Mosaic plinth base
        this._createPlinth();
        
        // 2. Grass ring
        this._createGrassRing();
        
        // 3. Cornucopia (horn of abundance)
        this._createCornucopia();
        
        // 4. 24 mini-figures in circle
        this._createMiniFigures();
        
        // 5. Compass rose decoration
        this._createCompassRose();
    }

    /**
     * Creates the mosaic plinth base
     */
    _createPlinth() {
        console.log('[CentralHub] Creating plinth...');
        
        const plinthGroup = new THREE.Group();
        
        // Мозаичная основа (сектора)
        const sectorCount = 8;
        const sectorAngle = (Math.PI * 2) / sectorCount;
        
        for (let i = 0; i < sectorCount; i++) {
            const angle = i * sectorAngle;
            const x = Math.cos(angle) * (this.plinthSize / 2);
            const z = Math.sin(angle) * (this.plinthSize / 2);
            
            // Мозаичные плитки разных цветов
            const mosaicColor = Math.floor(i / 2) % 2 === 0 
                ? 0xffd700  // Gold
                : 0xffa500;  // Dark gold
            
            const mosaic = new THREE.Mesh(
                new THREE.PlaneGeometry(25, 25),
                new THREE.MeshBasicMaterial({ 
                    color: mosaicColor,
                    transparent: true,
                    opacity: 0.95
                })
            );
            mosaic.rotation.y = -angle - Math.PI / 2;
            mosaic.position.set(x, -0.5, z);
            plinthGroup.add(mosaic);
        }
        
        // Золотая окантовка
        const rim = new THREE.Mesh(
            new THREE.TorusGeometry(this.plinthSize / 2 - 2, 0.5, 16, 50),
            new THREE.MeshStandardMaterial({
                color: 0xffcc00,
                metalness: 0.9,
                roughness: 0.1
            })
        );
        plinthGroup.add(rim);
        
        this.mapGen._addToScene(plinthGroup);
    }

    /**
     * Creates decorative grass ring around the hub
     */
    _createGrassRing() {
        console.log('[CentralHub] Creating grass ring...');
        
        const innerRadius = this.plinthSize / 2 + 2;
        const outerRadius = this.hubRadius - 10;
        const segments = Math.floor((outerRadius - innerRadius) / 3);
        
        for (let i = 0; i <= segments; i++) {
            const radius = innerRadius + i * 3;
            
            const grassRing = new THREE.Mesh(
                new THREE.RingGeometry(radius - 3, radius, 32),
                this.matSys.grassGreen
            );
            
            grassRing.rotation.x = -Math.PI / 2;
            grassRing.position.y = 0.01;
            
            this.mapGen._addToScene(grassRing);
        }
    }

    /**
     * Creates the golden cornucopia (roar of abundance)
     */
    _createCornucopia() {
        console.log('[CentralHub] Creating cornucopia...');
        
        const cornucopiaGroup = new THREE.Group();
        
        // Основной корпус рога (спиральная форма)
        const hornGeometry = new THREE.TorusGeometry(8, 3, 8, 30, Math.PI);
        const horn = new THREE.Mesh(
            hornGeometry,
            this.matSys.cornucopiaGold.clone()
        );
        
        // Наклоняем рог как естественный
        horn.rotation.z = Math.PI / 6;
        horn.rotation.x = Math.PI / 6;
        
        cornucopiaGroup.add(horn);
        cornucopiaGroup.position.y = 8;
        
        // Емкость внутри (фрукты/припасы)
        const boxGroup = new THREE.Group();
        const boxWidth = 30;
        const boxHeight = 12;
        const boxDepth = 15;
        
        // Несколько ящиков разного цвета
        const boxColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xffa07a];
        
        for (let i = 0; i < 30; i++) {
            // Распределение по спирали
            const angle = (i / 30) * Math.PI * 4;
            const r = 10 + (i % 5) * 2;
            
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;
            
            // Ящик с припасами
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(3, 2.5, 3),
                new THREE.MeshLambertMaterial({ 
                    color: boxColors[i % boxColors.length] 
                })
            );
            box.position.set(x, 2 + Math.sin(angle) * 2, z);
            box.rotation.z = -angle;
            
            boxGroup.add(box);
        }
        
        cornucopiaGroup.add(boxGroup);
        
        this.mapGen._addToScene(cornucopiaGroup);
        cornucopiaGroup.position.set(0, 0, 0);
    }

    /**
     * Creates 24 mini-figures arranged in a perfect circle
     */
    _createMiniFigures() {
        console.log('[CentralHub] Creating 24 mini-figures...');
        
        const figureGroup = new THREE.Group();
        const figureCount = 24;
        const angleStep = (Math.PI * 2) / figureCount;
        
        const figureTypes = [
            { armor: 0x5a5a5a, helmet: 0x4a4a4a },  // Танк
            { armor: 0x3d9e5a, helmet: 0x2d6a3a },  // Метатель
            { armor: 0x2d4a1e, helmet: 0x1a3a2a },  // Спецназ
            { armor: 0x6b4423, helmet: 0x5a3a2a }   // Лесник
        ];
        
        for (let i = 0; i < figureCount; i++) {
            const angle = angleStep * i;
            const radius = this.circleRadius - (i % 4 === 0 ? 2 : 0);
            
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // Группа фигуры
            const figure = new THREE.Group();
            
            // Основание (ноги)
            const legs = new THREE.Group();
            for (let leg = 0; leg < 2; leg++) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.4, 0.4, 3),
                    this.matSys.miniFigureBase
                );
                leg.position.set(
                    leg === 0 ? -0.5 : 0.5,
                    0,
                    0
                );
                legs.add(leg);
            }
            figure.add(legs);
            
            // Тело и броня
            const armor = new THREE.Mesh(
                new THREE.BoxGeometry(2.5, 2.5, 1.2),
                this.matSys.miniFigureArmor
            );
            armor.position.y = 1.5;
            figure.add(armor);
            
            // Голова
            const head = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, 1.2, 0.8),
                this.matSys.miniFigureHelmet
            );
            head.position.y = 3.2;
            
            // Шлем
            const helmet = new THREE.Mesh(
                new THREE.SphereGeometry(0.65, 8, 8),
                this.matSys.miniFigureHelmet
            );
            helmet.position.y = 0.4;
            figure.add(helmet);
            
            // Руки (оружие)
            const weapon = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 3, 0.3),
                new THREE.MeshLambertMaterial({ color: 0x2f2f2f })
            );
            weapon.position.set(-1.1, 2.3, 0);
            figure.add(weapon);
            
            figureGroup.add(figure);
            figure.position.set(x, 0, z);
            
            // Слегка варьируем поворот
            figure.rotation.y = Math.random() * Math.PI;
        }
        
        this.mapGen._addToScene(figureGroup);
    }

    /**
     * Creates decorative compass rose
     */
    _createCompassRose() {
        console.log('[CentralHub] Creating compass rose...');
        
        const roseGroup = new THREE.Group();
        
        // Основание розы
        const baseRing = new THREE.Mesh(
            new THREE.RingGeometry(10, 12, 32),
            new THREE.MeshBasicMaterial({ color: 0xff4400, side: THREE.DoubleSide })
        );
        baseRing.rotation.x = -Math.PI / 2;
        roseGroup.add(baseRing);
        
        // Стрелки N, S, E, W
        const cardinalPoints = ['N', 'E', 'S', 'W'];
        const positions = [
            { x: 8, z: 8, angle: -Math.PI / 4 },    // N
            { x: 8, z: -8, angle: 3 * Math.PI / 4 }, // E
            { x: -8, z: -8, angle: -3 * Math.PI / 4 }, // S
            { x: -8, z: 8, angle: Math.PI / 4 }   // W
        ];
        
        for (let i = 0; i < 4; i++) {
            const point = new THREE.Mesh(
                new THREE.CylinderGeometry(1, 1, 0.2, 8),
                this.matSys.compassRose
            );
            point.position.set(
                positions[i].x,
                -1,
                positions[i].z
            );
            point.rotation.z = positions[i].angle;
            
            // Буква
            const letter = new THREE.Mesh(
                new THREE.PlaneGeometry(1.5, 1.5),
                this.matSys.compassArrow
            );
            letter.position.y = 0.5;
            letter.rotation.y = positions[i].angle;
            letter.visible = false; // Можно включить позже
            
            point.add(letter);
            roseGroup.add(point);
        }
        
        this.mapGen._addToScene(roseGroup);
    }
}
