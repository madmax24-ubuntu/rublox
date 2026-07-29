# Global Rules

## MCP Tools — correct tool names

**ALL MCP tools use prefix `mcp__<Server>__<tool>`. Call via ToolSearch + direct tool call.**

### Работающие серверы (проверено):
| Server | Prefix | Key tools |
|--------|--------|-----------|
| Codebase-Memory | `mcp__Codebase-Memory__` | get_architecture, search_code, get_code_snippet, query_graph, search_graph, trace_path, index_repository |
| Git | `mcp__Git__` | status, log, diff, commit, branch, merge, rebase, stash, reset, checkout, pull, blame, file_history |
| Playwright | `mcp__Playwright2__` | browser_navigate, browser_click, browser_type, browser_snapshot, browser_evaluate |
| Computer-Use | `mcp__Computer-Use__` | click, type_text, press_key, scroll, drag, screenshot |
| Three.js | `mcp__Three_js__` | scene_tree, object_details, material_details, take_screenshot |

### Неработающие серверы (НЕ ИСПОЛЬЗОВАТЬ):
| Server | Status | Причина |
|--------|--------|---------|
| MCP-Web-Search | ❌ | Server not configured |
| Context7 | ❌ | Server not configured |
| Memory | ❌ | Memory graph пустой, сущности не созданы |
| Filesystem | ❌ | Конфликт с встроенными Read/Edit/Glob |

### Правильный порядок вызова MCP:
1. **ToolSearch** → `select:<tool_name>` для загрузки deferred tools
2. **Direct call** → `mcp__Server__<tool>` после загрузки
3. **Fallback** → встроенные Bash/Glob/Grep/Read/Edit

## Workflow (обязательно)

### 1. Plan first — before any work

Каждая нетривиальная задача начинается с плана:
1. Определи подход, шаги, зависимости
2. Выбери правильные инструменты (MCP → встроенные → grep/glob)
3. Только потом — действия

### 2. Git before every file change

**Правило:** перед каждым изменением файла → `git add` → `git commit`.

```
git add <files>
git commit -m "brief description"
```

- Atomic commits: один логический change = один commit
- После коммита → тестирование → если ок → продолжение

### 3. Verify after editing

**Правило:** после каждого редактирования → полноценное тестирование.

- Билды: `npm run build` / `npm run compile`
- Тесты: `npm test` / `npm run test` / `jest` / `vitest`
- Ручная проверка: запустить, убедиться, что не сломалось

**Не оставляй неработающий код.**

### 4. Large files — chunks or agents

**Правило:** большие файлы читать/редактировать кусками или через агентов.

- Чтение: `offset` + `limit` в `Read`
- Редактирование: точечные `Edit` с уникальным контекстом
- Для файлов > 500 строк: `Agent` с подзадачей
- Никогда не читай файл целиком без необходимости

## Tool Selection

1. **MCP first:** поиск по коду → Codebase-Memory; браузер → Playwright; UI → Computer-Use; документация → Context7
2. **Встроенные:** glob, grep, read, edit, bash — для локальных операций
3. **Grep fallback:** строковые литералы, конфиги, не-код файлы

## Error Handling

- `oldString not found` → перечитай файл, найди точный контекст
- `multiple matches` → добавь surrounding context для уникальности
- **Rule of 3:** один и тот же подход провалился 3 раза → стоп, меняй стратегию или спрашивай пользователя. НЕ повторяешь

## Diff Rules

- Контекст только вокруг изменённых строк
- No placeholders `// ... existing code` внутри функций
- Только изменённые строки, без лишних boilerplate/комментариев
- Большие изменения → split into logical chunks

## Communication

- **Не спрашивай** очевидное (где файл, что сделать, как закоммитить)
- **Спрашивай** только когда:
  - Неточное ТЗ (нужно clarification)
  - 3 попытки провалились (Rule of 3)
  - Действие деструктивное (удаление, reset --hard, force push)
- **Действуй автономно** для рутинных задач
- Коротко, по делу. Без "хорошо", "готово", "я сделал"

## Security (обязательно)

- **Не ломай** API keys, tokens, secrets в коммитах или выводе
- **Не показывай** полные API keys — маскируй (`sk-ant-***...***`)
- **Не commit** `.env`, `.env.local`, credentials, tokens
- `git restore .env` если accidentally закоммитил
- Для тестов используй test keys, не prod

## Parallel Operations

- **Можно параллельно:** `git status` + `git diff` + `git log`; чтение нескольких файлов; независимые bash-команды
- **Нельзя параллельно:** git commit → git status; edit → read той же строки
- **Нельзя параллельно:** git push → git status (push может фейлиться)

## When to use Agent

- Чтение/модификация файлов > 500 строк
- Поиск по репозиторию (> 10 результатов)
- Многозадачность: найти файлы + проверить билд + запустить тесты
- Любой запрос типа "найди и исправь" с несколькими подзадачами

## Memory Management

- Сохраняй в `~/.claude/memory/` только:
  - Project conventions, которые НЕ в коде
  - User preferences и workflow rules
  - Decision rationale (почему так, а не иначе)
- Не сохраняй: код, паттерны, структуру — это в репозитории
- Обновляй память при изменении правил
