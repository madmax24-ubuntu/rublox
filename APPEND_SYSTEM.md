# UNIVERSAL GLOBAL INSTRUCTIONS — APPLY TO ALL PROJECTS

## 1. ALWAYS USE GIT (NON-NEGOTIABLE)

### Before any work
- `git status` — check current state
- `git diff` — confirm working copy is clean
- `git log -1 --oneline` — know the last commit

### After changes
- `node --check <file>.js` — syntax valid
- `git diff --stat` — diff matches intent
- `git add <file>` + `git commit -m "type(scope): description"`
- Push only after ALL task commits are done: `git push`

**NEVER commit generated artifacts:** screenshots, logs, tmp files, node_modules, build output.
**Conventional types:** `feat`, `fix`, `refactor`, `debug`, `chore`
**One logical change per commit.** No drive-by refactors.

---

## 2. MCP codebase-memory — RULES FOR DISCOVERY

### Available tools (use these names exactly)
- `codebase_memory_list_projects` — list all indexed projects
- `codebase_memory_search_graph` — find functions/classes by name pattern (BM25 search)
- `codebase_memory_get_code_snippet` — read specific function source by qualified name
- `codebase_memory_trace_path` — trace call chains (who calls what)
- `codebase_memory_get_architecture` — project structure overview
- `codebase_memory_search_code` — exact text search in code files

### CRITICAL RULES
1. **ALWAYS pass `project` argument via `args`**:
   ```
   { "server": "codebase-memory", "tool": "search_graph", "args": { "project": "<name>", "query": "...", "label": "Class|Function|Method", "limit": 20 } }
   ```
2. If you get `missing required argument: project` — you passed it wrong. Read the error, fix it, do NOT repeat.
3. Get project name from `codebase_memory_list_projects` — do not guess.
4. Use `codebase_memory_get_code_snippet` with `qualified_name` to read exact function bodies.

### Discovery order
1. `codebase_memory_get_architecture` → project structure
2. `codebase_memory_search_graph` → find target function/class
3. `codebase_memory_get_code_snippet` → read the actual code
4. `codebase_memory_trace_path` → trace dependencies

---

## 3. MCP three.js-devtools — BRIDGE REQUIRED

### Before using ANY three.js tool, verify the bridge
1. **Dev server must be running**: `npx nodemon --watch server.js server.js` (or project equivalent)
2. **Open the proxy URL** in your browser (check server output for the URL, e.g., `http://localhost:48385`)
3. **Verify bridge**: `threejs_devtools_bridge_status` → must say `Bridge: connected`
4. If `NOT connected`: hard refresh the browser page (Ctrl+Shift+R), check server is running

### Available tools (use full names, NOT abbreviations)
- `threejs_devtools_find_objects` — search by type, material, visibility (NOT `scene_tree`)
- `threejs_devtools_object_details` — inspect specific object
- `threejs_devtools_material_list` / `material_details` — inspect materials
- `threejs_devtools_texture_list` / `texture_details` — inspect textures
- `threejs_devtools_camera_details` / `set_camera` — camera controls
- `threejs_devtools_take_screenshot` — capture scene state
- `threejs_devtools_perf_monitor` / `performance_snapshot` — FPS, draw calls, triangles
- `threejs_devtools_bounding_boxes` — show/hide colliders
- `threejs_devtools_run_js` — execute JS on the scene (for quick tests)
- `threejs_devtools_renderer_settings` — renderer config

### Rule
If you get `Error: No Three.js app connected` — the bridge is not connected. **Do NOT repeat the call.** Fix the bridge first with `threejs_devtools_bridge_status`.

---

## 4. PLAYWRIGHT — HEADLESS VERIFICATION

### When to run
After changes to: 3D scene, entities, rendering, colliders, UI, or any visual feature.

### Commands
```bash
npx playwright test --project=chromium           # headless (pipeline)
npx playwright test --project=chromium --headed  # interactive (debugging)
npx playwright test --project=chromium --grep "test-name"  # specific test
```

### Screenshots are artifacts
Screenshots saved to `tests/screenshots/` are **NEVER committed** — they are generated artifacts.

---

## 5. VERIFICATION CHECKLIST (BEFORE EVERY COMMIT)

1. [ ] `node --check <file>.js` — syntax valid
2. [ ] `git diff --stat <file>` — diff matches intent
3. [ ] No unintended side effects in modified region
4. [ ] No duplicate variable declarations
5. [ ] Import statements present for new dependencies
6. [ ] Playwright tests pass (if visual/rendering/collider changes)
7. [ ] No secrets, tokens, or API keys in diff
8. [ ] No generated artifacts (screenshots, logs, builds) in diff

---

## 6. WORKFLOW ORDER (STRICT)

1. **DISCOVER** — MCP codebase-memory or three.js-devtools
2. **READ** — the target code file(s)
3. **APPLY** — targeted edits using `patch` (not `sed` for multiline)
4. **VERIFY** — `node --check` + `git diff --stat` + Playwright
5. **COMMIT** — `git add` + `git commit -m "type(scope): description"`
6. **PUSH** — `git push` after ALL task commits

**NEVER skip discovery or verification.**
**NEVER commit without verifying.**

---

## 7. COMMUNICATION

- Language: Russian for discussion, English for code
- Format: concrete — file paths, line numbers, command output
- No introductions, no filler. Lead with the change or answer.
- Never fabricate output — if a tool fails, say so and try an alternative.
