import * as THREE from 'three';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        this.sunLight = null;
        this.dayTime = 0.3;
        this.weatherType = 'clear';
        this.weatherTimer = 18 + Math.random() * 18;
        this.enableWeather = false;
        this.targetFog = 0.0028;
        this.currentWeather = 'clear';
        this.weatherChanged = true;
        this.forceNightTimer = 0;
        this.overrideFog = null;
        this.overrideFogColor = null;
        this.ambient = null;
        this.hemi = null;
        this.nightAmbientColor = new THREE.Color(0x0b132b);
        this.targetExposure = 1;
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

        this.scene.fog = new THREE.FogExp2(0x8fd3ff, 0.0028);
        this.scene.background = new THREE.Color(0x8fd3ff);
        this.scene.userData.targetExposure = 1;
    }


    update(delta) {
        const forcedNight = this.forceNightTimer > 0;
        if (forcedNight) {
            this.forceNightTimer = Math.max(0, this.forceNightTimer - delta);
            this.dayTime = 0.92;
        } else {
            this.dayTime += delta * 0.0072;
            if (this.dayTime > 1) this.dayTime = 0;
        }

        const angle = (this.dayTime - 0.25) * Math.PI * 2;
        const r = 600;

        this.sunLight.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 100);

        const skyColor = new THREE.Color(0x050510);
        const daySky = new THREE.Color(0x8fd3ff);
        const duskSky = new THREE.Color(0xffb574);
        const sunHeight = Math.sin(angle);
        const dayFactor = THREE.MathUtils.smoothstep(sunHeight, -0.12, 0.18);
        const duskFactor = 1 - Math.min(1, Math.abs(sunHeight) * 4.2);
        skyColor.lerp(daySky, dayFactor);
        skyColor.lerp(duskSky, duskFactor * 0.3);
        let intensity = 0.08 + dayFactor * 0.98 - duskFactor * 0.12;

        if (this.enableWeather) {
            this.weatherTimer -= delta;
            if (this.weatherTimer <= 0) {
                const roll = Math.random();
                const prev = this.weatherType;
                if (roll < 0.46) this.weatherType = 'clear';
                else if (roll < 0.76) this.weatherType = 'rain';
                else this.weatherType = 'snow';
                if (prev !== this.weatherType) {
                    this.weatherChanged = true;
                }
                this.weatherTimer = 20 + Math.random() * 25;
            }

            if (this.weatherType === 'rain') {
                this.targetFog = 0.0048;
                intensity *= 0.65;
                skyColor.lerp(new THREE.Color(0x7a8a9a), 0.35);
                this.targetExposure = 0.4;
            } else if (this.weatherType === 'snow') {
                this.targetFog = 0.0059;
                intensity *= 0.78;
                skyColor.lerp(new THREE.Color(0xd7e4f5), 0.42);
                this.targetExposure = 0.82;
            } else {
                this.targetFog = 0.0036;
                this.targetExposure = 1;
            }
        } else {
            this.targetFog = 0.0036;
            this.targetExposure = 1;
        }

        if (forcedNight) {
            skyColor.copy(this.nightAmbientColor);
            intensity = 0.0;
            this.targetFog = Math.max(this.targetFog, 0.0058);
            this.targetExposure = Math.min(this.targetExposure, 0.65);
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
        this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, intensity, delta * 1.8);
        this.sunLight.visible = intensity > 0.03;
        if (this.ambient) {
            const target = forcedNight ? 0.2 : 0.25 + intensity * 0.7;
            this.ambient.intensity = THREE.MathUtils.lerp(this.ambient.intensity, target, delta * 0.8);
            if (forcedNight) this.ambient.color.lerp(this.nightAmbientColor, delta * 2.4);
            else this.ambient.color.lerp(new THREE.Color(0xffffff), delta * 1.8);
        }
        if (this.hemi) {
            const target = forcedNight ? 0.18 : 0.2 + intensity * 0.75;
            this.hemi.intensity = THREE.MathUtils.lerp(this.hemi.intensity, target, delta * 0.8);
            if (forcedNight) {
                this.hemi.color.lerp(this.nightAmbientColor, delta * 2.6);
                this.hemi.groundColor.lerp(new THREE.Color(0x080b14), delta * 2.6);
            } else {
                this.hemi.color.lerp(new THREE.Color(0xbad5ff), delta * 1.8);
                this.hemi.groundColor.lerp(new THREE.Color(0x4a3a28), delta * 1.8);
            }
        }
        this.scene.userData.targetExposure = this.targetExposure;
        this.currentWeather = this.weatherType;
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

    consumeWeatherChange() {
        if (!this.weatherChanged) return null;
        this.weatherChanged = false;
        return this.currentWeather || this.weatherType || 'clear';
    }

    getWeatherType() {
        return this.currentWeather || this.weatherType || 'clear';
    }
}
