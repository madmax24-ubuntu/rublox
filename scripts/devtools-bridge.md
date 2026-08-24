# threejs_devtools MCP — Bridge

Скрипт `devtools-bridge.cjs` открывает proxy-URL MCP в вашем браузере (Firefox) и держит процесс alive, чтобы вкладка не закрывалась.

## Быстрый запуск

1. Узнай proxy URL через `mcp__threejs_devtools_mcp__bridge_status`
2. Запусти: `node scripts/devtools-bridge.cjs http://localhost:<port>`
3. Проверь подключение: `mcp__threejs_devtools_mcp__bridge_status` → должно быть "Bridge: connected"

## Пример

```bash
node scripts/devtools-bridge.cjs http://localhost:9222
```

Скрипт открывает страницу в Firefox и держит процесс alive.

## Остановка

Нажмите `Ctrl+C` в терминале или закройте вкладку в браузере.

## Важно

- Proxy URL **меняется** между сессиями MCP. Перед каждым запуском получайте актуальный URL через `bridge_status`.
- Dev-сервер (`npm run dev`) должен быть запущен на порту 3001.
- Не закрывайте вкладку в браузере, пока используете devtools.
- После перезапуска сервера или MCP нужно перезапустить bridge (новый proxy URL).
