# Global Rules

## Workflow (обязательно)

### 1. Plan first — before any work

Каждая нетривиальная задача начинается с плана:
1. Определи подход, шаги, зависимости
2. Выбери правильные инструменты
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

1. **Встроенные:** glob, grep, read, edit, bash — для локальных операций
2. **Bash:** shell-команды, git, npm, node
3. **Agent:** сложные многошаговые задачи, большие файлы, параллельная работа

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

## MCP Tools (Codebase-Memory)

MCP инструменты НЕ работают через ToolSearch (Claude Code bug). Используй Bash напрямую:

```bash
# Поиск по графу (search_graph)
printf '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_graph","arguments":{"query":"update","project":"C-Users-maksk-Desktop-rublox","limit":5}},"id":1}\n' | \
  timeout 30 ~/.local/bin/codebase-memory-mcp.exe 2>/dev/null | \
  python -c "
import sys, json; text = sys.stdin.read(); obj = json.loads(text.split('\n')[0]); print(obj['result']['content'][0]['text'][:3000])
"

# Архитектура (get_architecture)
printf '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_architecture","arguments":{"project":"C-Users-maksk-Desktop-rublox"}},"id":1}\n' | \
  timeout 30 ~/.local/bin/codebase-memory-mcp.exe 2>/dev/null | \
  python -c "
import sys, json; text = sys.stdin.read(); obj = json.loads(text.split('\n')[0]); print(obj['result']['content'][0]['text'][:3000])
"

# Схема графа (get_graph_schema)
printf '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_graph_schema","arguments":{"project":"C-Users-maksk-Desktop-rublox"}},"id":1}\n' | \
  timeout 30 ~/.local/bin/codebase-memory-mcp.exe 2>/dev/null | \
  python -c "
import sys, json; text = sys.stdin.read(); obj = json.loads(text.split('\n')[0]); print(obj['result']['content'][0]['text'])
"

# Поиск кода (search_code)
printf '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_code","arguments":{"pattern":"Player","project":"C-Users-maksk-Desktop-rublox"}},"id":1}\n' | \
  timeout 30 ~/.local/bin/codebase-memory-mcp.exe 2>/dev/null | \
  python -c "
import sys, json; text = sys.stdin.read(); obj = json.loads(text.split('\n')[0]); print(obj['result']['content'][0]['text'][:3000])
"

# Запрос по графу (query_graph — Cypher)
printf '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"query_graph","arguments":{"query":"MATCH (f:Function) RETURN f.qualified_name, f.complexity ORDER BY f.complexity DESC LIMIT 10","project":"C-Users-maksk-Desktop-rublox"}},"id":1}\n' | \
  timeout 30 ~/.local/bin/codebase-memory-mcp.exe 2>/dev/null | \
  python -c "
import sys, json; text = sys.stdin.read(); obj = json.loads(text.split('\n')[0]); print(obj['result']['content'][0]['text'])
"

# Трассировка вызовов (trace_path)
printf '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"trace_path","arguments":{"function_name":"update","project":"C-Users-maksk-Desktop-rublox","direction":"both","depth":3}},"id":1}\n' | \
  timeout 30 ~/.local/bin/codebase-memory-mcp.exe 2>/dev/null | \
  python -c "
import sys, json; text = sys.stdin.read(); obj = json.loads(text.split('\n')[0]); print(obj['result']['content'][0]['text'])
"

# Код функции (get_code_snippet)
printf '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_code_snippet","arguments":{"qualified_name":"Player.update","project":"C-Users-maksk-Desktop-rublox"}},"id":1}\n' | \
  timeout 30 ~/.local/bin/codebase-memory-mcp.exe 2>/dev/null | \
  python -c "
import sys, json; text = sys.stdin.read(); obj = json.loads(text.split('\n')[0]); print(obj['result']['content'][0]['text'][:3000])
"

# Список проектов
printf '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":1}\n' | \
  timeout 30 ~/.local/bin/codebase-memory-mcp.exe 2>/dev/null | \
  python -c "
import sys, json; text = sys.stdin.read(); obj = json.loads(text.split('\n')[0]); print(obj['result']['content'][0]['text'])
"
```

**Переменные окружения (опционально):**
- `MCP_BIN` — путь к бинарному файлу MCP (по умолчанию: `~/.local/bin/codebase-memory-mcp.exe`)
- `MCP_PROJECT` — имя проекта в графе (по умолчанию: `C-Users-maksk-Desktop-rublox`)

**Все 8 MCP инструментов работают:** index_repository, search_graph, query_graph, trace_path, get_code_snippet, get_graph_schema, get_architecture, search_code

## Memory Management

- Сохраняй в `~/.claude/memory/` только:
  - Project conventions, которые НЕ в коде
  - User preferences и workflow rules
  - Decision rationale (почему так, а не иначе)
- Не сохраняй: код, паттерны, структуру — это в репозитории
- Обновляй память при изменении правил
