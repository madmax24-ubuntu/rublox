import * as THREE from 'three';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        this.sunLight = null;
        this.dayTime = 0.3;
        this.weatherType = 'clear';
        this.weatherTimer = 18 + Math.random() * 18;
        this.enableWeather = false;
        this.targetFog = 0.0015;
        this.forceNightTimer = 0;
        this.overrideFog = null;
        this.overrideFogColor = null;
        this.ambient = null;
        this.hemi = null;
        this.init();
    }

    init() {
        this.ambient = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(this.ambient);

        this.hemi = new THREE.HemisphereLight(0xbad5ff, 0x4a3a28, 0.95);
        this.scene.add(this.hemi);

        this.sunLight = new THREE.DirectionalLight(0xffd166, 1.4);
        this.sunLight.castShadow = false;
        this.sunLight.position.set(200, 300, 100);
        this.scene.add(this.sunLight);

        this.scene.fog = new THREE.FogExp2(0x8fd3ff, 0.0015);
    }

    update(delta) {
        const forcedNight = this.forceNightTimer > 0;
        if (forcedNight) {
            this.forceNightTimer = Math.max(0, this.forceNightTimer - delta);
            this.dayTime = 0.92;
        } else {
            this.dayTime += delta * 0.012;
            if (this.dayTime > 1) this.dayTime = 0;
        }

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

        if (this.enableWeather) {
            this.weatherTimer -= delta;
            if (this.weatherTimer <= 0) {
                const roll = Math.random();
                if (roll < 0.5) this.weatherType = 'clear';
                else if (roll < 0.8) this.weatherType = 'fog';
                else this.weatherType = 'rain';
                this.weatherTimer = 20 + Math.random() * 25;
            }

            if (this.weatherType === 'fog') {
                this.targetFog = 0.0032;
                intensity *= 0.75;
                skyColor.lerp(new THREE.Color(0xa0b3c0), 0.3);
            } else if (this.weatherType === 'rain') {
                this.targetFog = 0.0026;
                intensity *= 0.65;
                skyColor.lerp(new THREE.Color(0x7a8a9a), 0.35);
            } else {
                this.targetFog = 0.0015;
            }
        } else {
            this.targetFog = 0.0015;
        }

        if (forcedNight) {
            skyColor.setHex(0x03030c);
            intensity = 0.08;
            this.targetFog = Math.max(this.targetFog, 0.003);
        }
        if (this.overrideFog !== null) {
            this.targetFog = this.overrideFog;
        }

        this.scene.background = skyColor;
        if (this.scene.fog) {
            if (this.overrideFogColor) {
                this.scene.fog.color.lerp(this.overrideFogColor, delta * 2.5);
            } else {
                this.scene.fog.color.lerp(skyColor, delta * 2);
            }
            this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, this.targetFog, delta * 0.6);
        }
        this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, intensity, delta);
        if (this.ambient) {
            const target = forcedNight ? 0.12 : 0.25 + intensity * 0.7;
            this.ambient.intensity = THREE.MathUtils.lerp(this.ambient.intensity, target, delta * 0.8);
        }
        if (this.hemi) {
            const target = forcedNight ? 0.08 : 0.2 + intensity * 0.75;
            this.hemi.intensity = THREE.MathUtils.lerp(this.hemi.intensity, target, delta * 0.8);
        }
    }

    forceNight(duration = 20) {
        this.forceNightTimer = Math.max(this.forceNightTimer, duration);
    }

    setFogOverride(density, color = null) {
        this.overrideFog = density;
        this.overrideFogColor = color ? new THREE.Color(color) : null;
    }

    clearFogOverride() {
        this.overrideFog = null;
        this.overrideFogColor = null;
    }
}
