# ГЛОБАЛЬНЫЕ ПРАВИЛА И ИНСТРУКЦИИ

## ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ

### 1. Git — СТРОГО ОБЯЗАТЕЛЬНО
- **ВСЕ** изменения должны быть зафиксированы через Git.
- Перед началом работы: `git status`, `git diff`, `git log -1 --oneline`.
- После изменений: `git add <files>`, `git commit -m 'message'`, при необходимости `git push`.
- Если файл был случайно удалён (например, AGENTS.md), восстановить: `git restore <file>`.
- Никогда не работай без фиксации — это предотвращает потерю работы.

---

## MCP codebase-memory — ПРАВИЛА ИСПОЛЬЗОВАНИЯ

### Когда использовать
- **Поиск кода/функций/классов**: `codebase_memory_search_graph` (не `search_graph`!)
- **Архитектура проекта**: `codebase_memory_get_architecture` — для общей структуры
- **Список проектов**: `codebase_memory_list_projects` — если нужно переключиться между проектами
- **Точный поиск по тексту**: `codebase_memory_search_code` — для конкретных строк/литералов
- **Зависимости/цепочки вызовов**: `codebase_memory_trace_path`

### Критичные правила
1. **ВСЕГДА передавай аргумент `project` в объекте `args`**:
   ```
   { "server": "codebase-memory", "tool": "search_graph", "args": { "project": "<project_name>", "query": "...", "label": "Class|Function|Method", "limit": 20 } }
   ```
2. Если получил ошибку `missing required argument: project` — это значит ты не передал `project` правильно. **Перечитай ошибку и исправь, не повторяй ошибку.**
3. Имя проекта берётся из `codebase_memory_list_projects` — не гадай.
4. Для точного чтения кода используй `codebase_memory_get_code_snippet` с `qualified_name` (полный путь типа `rublox.items.Weapon.createGunshotSound`).

---

## MCP three.js-devtools — ПРАВИЛА ИСПОЛЬЗОВАНИЯ

### Перед использованием — ОБЯЗАТЕЛЕН бридж
1. **Сервер должен работать**: `npx nodemon --watch server.js server.js` (порт 3001).
2. **Открыть прокси в браузере**: `http://localhost:48385` (или другой прокси-порт).
3. **Проверить бридж**: `threejs_devtools_bridge_status` — должно быть `Bridge: connected`.
4. Если `NOT connected`: перезагрузить страницу (Ctrl+Shift+R), проверить сервер, очистить кэш браузера.

### Инструменты (названия полные, не сокращённые)
- **Поиск объектов сцены**: `threejs_devtools_find_objects` (не `scene_tree`!)
- **Детали объекта**: `threejs_devtools_object_details`
- **Материалы**: `threejs_devtools_material_list`, `threejs_devtools_material_details`
- **Текстуры**: `threejs_devtools_texture_list`, `threejs_devtools_texture_details`
- **Камера**: `threejs_devtools_camera_details`, `threejs_devtools_set_camera`
- **Скриншот**: `threejs_devtools_take_screenshot`
- **Рендер/настройки**: `threejs_devtools_renderer_settings`
- **Перформанс**: `threejs_devtools_performance_snapshot`
- **JS-выполнение**: `threejs_devtools_run_js` — для быстрых тестов/проверок

### Правило
Если получил `Error: No Three.js app connected` — бридж не подключен. **Не повторяй вызов**, сначала проверь `threejs_devtools_bridge_status`.

---

## ТЕСТИРОВАНИЕ — Playwright headless

### Обязательное правило
- **ВСЕ изменения в коде должны быть проверены** через Playwright в headless режиме.
- Не полагаться на визуальную проверку — использовать автотесты.

### Как запускать
```bash
# Проверка работы приложения (headless)
npx playwright test --project chromium --headed=false
```

### Пример теста для проверки багов
```javascript
// tests/example.spec.js
import { test, expect } from '@playwright/test';

test('bazooka explosion works', async ({ page }) => {
  await page.goto('http://localhost:3001');
  // Проверка что выстрел базуки не фризит
  // Проверка что анимация взрыва появляется
  // Проверка что звук играет (через Web Audio API)
});
```

---

## ИТОГОВЫЙ ЧЕК-ЛИСТ ПЕРЕД ЗАВЕРШЕНИЕМ РАБОТЫ

1. [ ] `git status` — все изменения видны
2. [ ] `git diff` — код корректен, нет опечаток
3. [ ] `node --check <file>` — синтаксис OK
4. [ ] `lens_diagnostics` или `verify_code` — нет ошибок
5. [ ] Playwright headless — тесты проходят
6. [ ] `git add <files>` + `git commit -m '<message>'` — зафиксировано
