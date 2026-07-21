# Global Configuration — работает во всех сессиях

## Planning (Планирование)
- **Всегда строй план перед началом** — прежде чем редактировать код, определи подход, шаги и подзадачи. Выяви зависимости и порядок выполнения.
- Для больших задач используй `agent` subagents для анализа, изменения и тестирования отдельно.

## Codebase Discovery (codebase-memory-mcp)
- **ALWAYS use codebase-memory-mcp for code discovery** — never search manually with grep/glob unless MCP returns nothing.
- **Priority Order:**
  1. `search_graph` — find functions, classes, routes, variables by pattern
  2. `trace_path` — trace who calls a function or what it calls
  3. `get_code_snippet` — read specific function/class source code
  4. `query_graph` — run Cypher queries for complex patterns
  5. `get_architecture` — high-level project summary
- **Fallback to grep/glob when:** searching string literals, error messages, config values, non-code files (Dockerfiles, shell scripts, configs), or when MCP returns insufficient results.
- **Examples:**
  - Find handler: `search_graph(name_pattern=".*OrderHandler.")`
  - Who calls it: `trace_path(function_name="OrderHandler", direction="inbound")`
  - Read source: `get_code_snippet(qualified_name="pkg/orders.OrderHandler")`

## Workflow Rules
1. **Atomic Commits** — один логический change за раз. Если задача большая — разбивай на атомарные шаги. Если reset случится, потеряется только один маленький коммит, а не вся работа.
2. **Git commit перед каждым изменением файла** — сначала коммит (`git add; git commit -m "msg"`), потом редактирование.
3. **Будь автономным** — используй ВСЕ доступные инструменты: Agent, MCP (git, playwright, context7, computer-use, tavily), Bash, Edit, Write, Glob, Grep. Не жди указаний для каждого шага.
4. **Не гадай** — если не знаешь или непонятно: спроси пользователя ИЛИ используй интернет (`tavily_search`, `context7`) для поиска информации.
5. **Проверка после изменений** — всегда проверяй синтаксис и логику (билды, тесты). Не оставляй неработающий код.
6. **Большие задачи → таски + агенты** — если задач много или они большие: создавай `TaskCreate`/`TaskUpdate`, выполняй по очереди. Можно запускать несколько `agent` одновременно для независимых работ.

## Error Handling (Обработка ошибок)
- На `oldString not found`: перечитай файл, найди верный контекст, попробуй снова.
- На `multiple matches`: используй больше surrounding context для уникальности.
- **ПРАВИЛО 3 ПРОВАЛА:** если один и тот же подход (та же ошибка, та же попытка фикса) провалился 3 раза — **Категорический СТОП.** Больше НЕ повторяешь. Меняешь стратегию полностью ИЛИ спрашиваешь у пользователя.
- НЕ «повторяй внимательнее» — это ловушка зацикливания. 3 раза = конец подхода.

## MCP Servers (путь к серверам)
- **computer-use**: `node C:/Users/maksk/AppData/Roaming/npm/node_modules/win-mcp-wrapper/index.js`
- **context7**: `C:/Users/maksk/AppData/Roaming/npm/context7-mcp`
- **web-search**: `C:/Users/maksk/AppData/Roaming/npm/mcp-web-search`
- **playwright**: `node C:/Users/maksk/Desktop/rublox/node_modules/@playwright/mcp/cli.js`
- **git**: `node C:/Users/maksk/Desktop/rublox/node_modules/git-mcp/dist/index.js`
- **codebase-memory**: `C:/Users/maksk/.local/bin/codebase-memory-mcp.exe`

## MCP Usage — вызов через stdio pipe
MCP серверы работают через stdio. Вызов через bash pipe:

```bash
# Формат: printf <json> | <server_exe> 2>/dev/null | grep '"id":2'
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"<tool>","arguments":{<params>}}}
' | <server_exe> 2>/dev/null | grep '"id":2'
```

Пример — поиск в knowledge graph:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_graph","arguments":{"project":"C-Users-maksk-Desktop-rublox","query":"camera collision"}}}
' | C:/Users/maksk/.local/bin/codebase-memory-mcp.exe 2>/dev/null | grep '"id":2'
```

Project name для codebase-memory: `C-Users-maksk-Desktop-rublox`

## Diff Rules
- **Context-Aware Diffs:** provide changes in a format the IDE can merge automatically.
- **Never use placeholders** like `// ... existing code` inside a function — it breaks IDE merge.
- **Focus on the specific block level** — only output the exact lines that change.
- **No Redundancy:** never output imports, boilerplate, or comments that already exist in the file.

## Prompt Expansion (Расширение промтов)
- Если промт краткий/размытый — **сам расширяй его** контекстом из проекта перед выполнением.
- Добавляй недостающие детали: error handling, edge cases, валидацию, тесты, производительность.
- Не спрашивай уточнений — принимай решение сам на основе проекта.
- Не трать токены на диалоги типа "а ты имел в виду..." — просто делай.

## Response Style (Стиль ответов)
- Максимум 50 слов на ответ. Без суммаризаций, без "вот что я нашёл", без вводных/заключений.
- Прямой ответ по делу. **Кратко и без воды** — иначе при длинных задачах инструкции раздуваются.
- NO terminal output explanations unless explicitly requested.
- NO code comments.
- **Token-efficient syntax:** используй arrow functions, ternary operators, shorthand где уместно.
- **Token Limit Management:** если изменение огромное — разбивай на логические чанки, чтобы избежать truncation и auto-reset loops.

## Terminal (Git Bash + long-running)
- Для долгих задач (часы тестов, сервера) используй **Git Bash**, не PowerShell: `C:\Program Files\Git\bin\bash.exe`
- Удаление temp файлов сразу после использования — не оставляй мусор.
