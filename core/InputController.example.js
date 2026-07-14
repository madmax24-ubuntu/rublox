// ============================================================
// Пример интеграции InputController в игровой цикл
// ============================================================

import { InputController } from './InputController.js';
import * as THREE from 'three';

// ── 1. Создание контроллера ───────────────────────────────
const input = new InputController({
    domElement: renderer.domElement,  // канвас для Pointer Lock / тач-событий
    isMobile: true,                    // или false — или оставь undefined для автоопределения
    mouseSensitivity: 0.002,          // ПК: радиан на пиксель мыши
    touchLookSensitivity: 0.012,      // Мобайл: радиан на пиксель свайпа
    joystickRadius: 60,               // радиус джойстика в пикселях
    deadZone: 15                       // мёртвая зона джойстика в пикселях
});

// Подключить event listeners (один раз при старте)
input.attachListeners();

// ── 2. Блокировка курсора (ПК) ───────────────────────────
// При клике на канвас — блокируем курсор для Pointer Lock
renderer.domElement.addEventListener('click', () => {
    if (!input.isMobile) input.lock();
});

// ── 3. Игровой цикл ──────────────────────────────────────
const clock = new THREE.Clock();

function gameLoop() {
    requestAnimationFrame(gameLoop);

    const dt = clock.getDelta(); // секунды (≈0.016 при 60 FPS)

    // Получить результат ввода за этот кадр
    const { move, yawDelta, pitchDelta } = input.update(dt);

    // ── Применить движение к персонажу ───────────────────
    // move — это Float32Array [x, 0, z] в ЛОКАЛЬНЫХ осях камеры:
    //   x > 0 = вправо от камеры, x < 0 = влево
    //   z < 0 = вперёд от камеры, z > 0 = назад
    // Нужно преобразовать из локальных осей в глобальные через quaternion камеры

    if (move) {
        const moveVec = new THREE.Vector3(move[0], 0, move[1]);

        // Получить направление камеры (только yaw — игнорируем pitch для движения)
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();

        // Правый вектор камеры (перпендикуляр к направлению)
        const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));

        // Комбинировать: move[0] * right + move[2] * forward
        const velocity = new THREE.Vector3()
            .addScaledVector(right, move[0])
            .addScaledVector(camDir, -move[1]); // -z = вперёд в Three.js

        // Применить к позиции персонажа × скорость × время
        player.position.addScaledVector(velocity.normalize(), input.moveSpeed * dt);
    }

    // ── Применить вращение к камере ───────────────────────
    // yaw — вращение вокруг оси Y (влево-вправо)
    // pitch — вращение вокруг оси X (вверх-вниз, ±89°)
    camera.rotation.order = 'YXZ';  // ВАЖНО: Yaw → Pitch
    camera.rotation.y = input.yaw;
    camera.rotation.x = input.pitch;

    // ── Отрисовка ────────────────────────────────────────
    renderer.render(scene, camera);
}

// Запуск
gameLoop();

// ── 4. Очистка при выходе ───────────────────────────────
window.addEventListener('beforeunload', () => {
    input.destroy();
});
