# InputController — Гибридное управление ПК + Mobile (Minecraft Bedrock-style)## Быстрый старт
```jsimport { InputController } from './core/InputController.js';

const input = new InputController({ domElement: renderer.domElement });
input.attachListeners();

// ПК: заблокировать курсор при клике
renderer.domElement.addEventListener('click', () => input.lock());

// Игровой цикл
function loop() {
    requestAnimationFrame(loop);
    const dt = clock.getDelta();
    const { move, yawDelta, pitchDelta } = input.update(dt);
    // move — Float32Array [локальныйX, 0, локальныйZ]
    // yawDelta / pitchDelta — приращения углов за кадр
}
```

## Архитектура

### ПК (Pointer Lock API)
- **Движение**: WASD → флаги в `input.keys` → нормализация вектора → `move`
- **Обзор**: `mousemove.movementX/Y` → накопление за кадр → `yawDelta/pitchDelta`
- Курсор блокируется через `input.lock()` при клике на канвас

### Мобильный (Мультитач)
- **Левая половина экрана** → виртуальный джойстик:  
  Точка первого касания = центр джойстика. Вектор к палцу нормализуется [-1..1] с мёртвой зоной и ограничением радиуса.
- **Правая половина экрана** → трекпад обзора:  
  Свайп от точки касания → поворот камеры. Точка отсчёта обновляется каждый тик чтобы избежать дрейфа.
- **Мультитач**: джойстик и трекпад работают одновременно (2 пальца). Каждое касание привязано к `identifier`.

## Методы

| Метод | Описание |
|-------|----------|
| `attachListeners()` | Подключить event listeners (один раз при старте) |
| `destroy()` | Снять все listeners и освободить память |
| `lock()` | Заблокировать курсор (ПК, Pointer Lock) |
| `unlock()` | Разблокировать курсор |
| `update(dt)` | Основной метод — вызывать каждый кадр. Возвращает `{ move, yawDelta, pitchDelta }` |

## Свойства

| Свойство | Описание | По умолчанию |
|----------|----------|-------------|
| `moveSpeed` | Скорость движения (ед/сек) | 8 |
| `mouseSensitivity` | Чувствительность мыши (рад/пкс) | 0.002 |
| `touchLookSensitivity` | Чувствительность обзора на таче (рад/пкс) | 0.012 |
| `joystickRadius` | Радиус джойстика (пкс) | 60 |
| `deadZone` | Мёртвая зона джойстика (пкс) | 15 |
| `maxPitchDeg` | Макс. угол pitch (°) | 89 |
| `yaw` | Текущий угол yaw (радианы) | 0 |
| `pitch` | Текущий угол pitch (радианы) | 0 |
| `isMobile` | Флаг мобильного режима | автоопределение |

## Применение результата

### Движение (локальные → глобальные оси)
```js
const { move } = input.update(dt);
// move = Float32Array [локальныйX, 0, локальныйZ]
// локальныйX > 0 = вправо от камеры
// локальныйZ < 0 = вперёд от камеры

if (move) {
    const moveVec = new THREE.Vector3(move[0], 0, move[1]);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0; camDir.normalize(); // только горизонталь
    const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0,1,0));

    player.position.addScaledVector(right, move[0] * input.moveSpeed * dt);
    player.position.addScaledVector(camDir, -move[1] * input.moveSpeed * dt);
}
```

### Вращение камеры
```js
camera.rotation.order = 'YXZ'; // Yaw → Pitch (критично!)
camera.rotation.y = input.yaw;
camera.rotation.x = input.pitch; // ±89° (clamp встроенный)
```

## Ключевые принципы

1. **deltaTime во всём**: все расчёты умножаются на `dt` → одинаковое поведение при 30/60/144 FPS
2. **Нормализация вектора движения**: по диагонали (W+D) нет ускорения √2
3. **Clamp pitch ±89°**: защита от Gimbal Lock — игрок не может вывернуть шею
4. **Сбор ввода → обработка в update()**: event listeners только записывают флаги/смещения, вся логика в `update(dt)` → независимость от частоты событий ОС
5. **preventDefault на тачах**: отключает скролл/зум/выделение браузера во время игры
