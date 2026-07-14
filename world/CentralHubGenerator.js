/**
 * CentralHubGenerator - Generates the central hub with Rose Compass + Cornucopia
 * 
 * Features:
 * - Mosaic plinth with 24 mini-figures in a perfect circle
 * - Golden Cornucopia (roar of abundance) in center
 * - Decorative grass ring
 */

import * as THREE from "/node_modules/three/build/three.module.js";

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
     * Creates the mosaic plinth base with starburst pattern
     * Matches reference: beige base + reddish-brown rays + yellow inner circle + gray rim
     */
    _createPlinth() {
        const plinthGroup = new THREE.Group();
        const outerR = this.plinthSize / 2;   // 25 — внешний радиус платформы
        const innerR = 8;                      // внутренний жёлтый круг
        
        // 1) Base disc — light beige (visible between rays)
        const baseGeo = new THREE.CircleGeometry(outerR, 64);
        const baseMesh = new THREE.Mesh(
            baseGeo,
            new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.8 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6})
        );
        baseMesh.rotation.x = -Math.PI / 2;
        baseMesh.position.y = -0.3;
        plinthGroup.add(baseMesh);
        
        // 2) Starburst rays — sharp triangular wedges from innerR to outerR
        const rayCount = 12;
        const rayAngle = (Math.PI * 2) / rayCount;
        for (let i = 0; i < rayCount; i++) {
            const isRed = (i % 2 === 0);
            
            // Build triangle: center → outer edge point 1 → outer edge point 2
            const aStart = i * rayAngle;
            const aEnd = (i + 1) * rayAngle;
            const aMid = (aStart + aEnd) / 2;
            
            // Inner point on circle at innerR
            const ix = Math.cos(aMid) * innerR;
            const iz = Math.sin(aMid) * innerR;
            // Outer points at outerR (slightly narrower than full wedge for gap)
            const gapHalfAngle = rayAngle * 0.42;
            const ox1 = Math.cos(aMid - gapHalfAngle) * outerR;
            const oz1 = Math.sin(aMid - gapHalfAngle) * outerR;
            const ox2 = Math.cos(aMid + gapHalfAngle) * outerR;
            const oz2 = Math.sin(aMid + gapHalfAngle) * outerR;
            
            const triGeo = new THREE.BufferGeometry();
            const verts = new Float32Array([
                ix, 0, iz,
                ox1, 0, oz1,
                ox2, 0, oz2
            ]);
            triGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            triGeo.computeVertexNormals();
            
            const triMesh = new THREE.Mesh(
                triGeo,
                new THREE.MeshStandardMaterial({
                    color: isRed ? 0xb87a4e : 0xd4c4a8,
                    roughness: 0.7,
                    side: THREE.DoubleSide,
                    polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6
                })
            );
            triMesh.rotation.x = -Math.PI / 2;
            triMesh.position.y = -0.2;
            plinthGroup.add(triMesh);
        }
        
        // 3) Inner yellow circle — cornucopia base
        const innerGeo = new THREE.CircleGeometry(innerR, 48);
        const innerMesh = new THREE.Mesh(
            innerGeo,
            new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.5, metalness: 0.3 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6})
        );
        innerMesh.rotation.x = -Math.PI / 2;
        innerMesh.position.y = -0.1;
        plinthGroup.add(innerMesh);
        
        // 4) Gray border ring
        const rimGeo = new THREE.TorusGeometry(outerR, 0.6, 8, 48);
        const rimMesh = new THREE.Mesh(
            rimGeo,
            new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.2 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6})
        );
        rimMesh.rotation.x = -Math.PI / 2;
        rimMesh.position.y = -0.1;
        plinthGroup.add(rimMesh);
        
        // 5) Inner ring separating yellow from rays
        const innerRingGeo = new THREE.TorusGeometry(innerR, 0.3, 8, 48);
        const innerRingMesh = new THREE.Mesh(
            innerRingGeo,
            new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.5 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6})
        );
        innerRingMesh.rotation.x = -Math.PI / 2;
        innerRingMesh.position.y = -0.15;
        plinthGroup.add(innerRingMesh);
        
        this.mapGen._addToScene(plinthGroup);
    }

    /**
     * Creates decorative grass ring around the hub
     */
    _createGrassRing() {
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
        const cornucopiaGroup = new THREE.Group();
        
        // Основной корпус рога (спиральная форма)
        const hornGeometry = new THREE.TorusGeometry(8, 3, 4, 12, Math.PI);
        const horn = new THREE.Mesh(
            hornGeometry,
            this.matSys.cornucopiaGold.clone()
        );
        horn.userData.mapGenerated = true;
        
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
