import * as THREE from 'three';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        this.sunLight = null;
        this.dayTime = 0.3;
        this.init();
    }

    init() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambient);

        const hemi = new THREE.HemisphereLight(0xbad5ff, 0x4a3a28, 0.95);
        this.scene.add(hemi);

        this.sunLight = new THREE.DirectionalLight(0xffd166, 1.4);
        this.sunLight.castShadow = false;
        this.sunLight.position.set(200, 300, 100);
        this.scene.add(this.sunLight);

        this.scene.fog = new THREE.FogExp2(0x8fd3ff, 0.0015);
    }

    update(delta) {
        this.dayTime += delta * 0.004;
        if (this.dayTime > 1) this.dayTime = 0;

        const angle = (this.dayTime - 0.25) * Math.PI * 2;
        const r = 600;

        this.sunLight.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 100);

        let skyColor = new THREE.Color(0x000000);
        let intensity = 0;

        if (this.dayTime > 0.2 && this.dayTime < 0.8) {
            skyColor.setHex(0x8fd3ff);
            intensity = 1.05;
            if (this.dayTime < 0.3 || this.dayTime > 0.7) {
                skyColor.setHex(0xffb574);
                intensity = 0.7;
            }
        } else {
            skyColor.setHex(0x050510);
            intensity = 0.0;
        }

        this.scene.background = skyColor;
        this.scene.fog.color.lerp(skyColor, delta * 2);
        this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, intensity, delta);
    }
}
