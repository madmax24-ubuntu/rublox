# threejs_devtools MCP — Headless Bridge

Скрипт `devtools-bridge.mjs` запускает headless-браузер (Playwright + Chromium), который открывает proxy-URL MCP и держит bridge-соединение открытым. Это позволяет использовать инструменты threejs_devtools без ручного открытия браузера.

## Установка зависимостей

```bash
npm install playwright
npx playwright install chromium
```

## Быстрый запуск

1. Узнай proxy URL через `mcp__threejs_devtools_mcp__bridge_status`
2. Запусти: `node scripts/devtools-bridge.mjs http://localhost:<port>`
3. Проверь подключение: `mcp__threejs_devtools_mcp__bridge_status` → должно быть "Bridge: connected"

## Пример

```bash
node scripts/devtools-bridge.mjs http://localhost:18706
```

Скрипт работает в фоне, периодически проверяет соединение и автоматически перезагружает страницу при разрыве.

## Остановка

Нажмите `Ctrl+C` в терминале, где запущен скрипт.

## Важно

- Proxy URL **меняется** между сессиями MCP. Перед каждым запуском получайте актуальный URL через `bridge_status`.
- Dev-сервер (`npm run dev`) должен быть запущен на порту 3001.
- Скрипт держит браузер открытым — не закрывайте терминал, пока используете devtools.
