import * as THREE from 'three';

export function spawnDamagePopup(scene, position, amount, options = {}) {
    if (!scene || !position) return;

    const color = options.color || '#ff5b5b';
    const text = options.text || `${Math.round(amount)}`;
    const duration = options.duration || 700;
    const rise = options.rise || 0.8;
    const start = performance.now();

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.2, 0.6, 1);
    sprite.renderOrder = 999;
    sprite.position.copy(position);
    sprite.position.y += 2.2;
    scene.add(sprite);

    const camera = scene.userData?.camera;

    const tick = () => {
        const t = (performance.now() - start) / duration;
        if (t >= 1) {
            scene.remove(sprite);
            material.dispose();
            texture.dispose();
            return;
        }
        sprite.position.y = position.y + 2.2 + rise * t;
        material.opacity = 1 - t;
        if (camera) {
            sprite.quaternion.copy(camera.quaternion);
        }
        requestAnimationFrame(tick);
    };

    tick();
}
