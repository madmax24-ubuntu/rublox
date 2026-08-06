# AGENTS.md — Hermes Agent Global Instruction

This file is the **single source of truth** for how you work on this project. Read it on every session start. Follow every rule.

---

## 1. WORKFLOW RULES — NON-NEGOTIABLE

### 1.1 LOCAL CHANGES FIRST — NEVER COMMIT BLINDLY

All changes are applied to local files **before** any Git operation. You commit only what you verified.

**Required sequence before every commit:**

1. **Apply changes** — `patch`, `write_file`, `execute_code`
2. **Verify syntax** — `node --check <file>.js` — syntax MUST be valid
3. **Review diff** — `git diff --stat <file>` — confirm scope and intent
4. **Commit** — conventional format: `git add <file> && git commit -m "type(scope): description"`
5. **Push** — `git push` — only after ALL commits for this task are done

**NEVER skip steps 2 or 3.** A commit is not final until verified.

### 1.2 ERROR HANDLING DURING WORK

- **Patch fails:** Re-read file with `read_file`, retry `patch` with correct `old_string`. If it fails twice, use `write_file` for the full file.
- **`sed` broke indentation:** Do NOT use `sed` for multi-line edits. Use `code_execution` (Python) for precise line-level fixes.
- **Syntax error after commit:** Revert with `git revert <hash>` or `git reset --soft HEAD~1`, fix, and recommit.

---

## 2. GIT HYGIENE

### 2.1 PUSH ONLY GAME SOURCE CODE

**Allowed in repo:**
- `core/`, `entities/`, `items/`, `world/`, `ai/`, `net/`, `ui/`
- `server.js`, `main.js`, `index.html`
- `scripts/` (build scripts only)
- `package.json`, `package-lock.json`
- `playwright.config.js`, `tests/*.spec.js` (test CODE, not test artifacts)
- `.gitignore`, `AGENTS.md`

**BANNED from repo — these are generated artifacts:**
- `tests/screenshots/` — visual test output, regenerated each run
- `*.png`, `*.jpg` (anywhere in `tests/`) — never commit screenshots
- `*.log`, `*.tmp`, `*.bak`
- `node_modules/`
- `yandex-game/` (build output)

**Rule:** If a file is a generated artifact (screenshot, log, build output, cache), it stays `.gitignore`d. Game logic goes in.

### 2.2 COMMIT CONVENTIONS

- Format: `type(scope): description` — types: `feat`, `fix`, `refactor`, `debug`, `chore`
- One logical change per commit
- Never commit secrets, tokens, or API keys
- Run `git diff --stat` before every commit to verify scope

### 2.3 BRANCH STRATEGY

- `main` — stable branch, always deployable
- Feature branches for multi-commit work: `git checkout -b feature/short-desc`
- After completing a feature branch: commit, push, then merge to main
- Use `git stash` for temporary changes during debugging

---

## 3. MCP INTEGRATION — CODEBASE MEMORY + THREE.JS

MCP servers `codebase-memory` and `threejs-devtools` are configured globally in Hermes config. Use them.

### 3.1 DISCOVERY — ALWAYS START WITH MCP

**Before any code change, discover with MCP:**

1. `mcp__codebase_memory__search_graph` — find functions, classes, routes by name pattern
2. `mcp__codebase_memory__get_code_snippet` — read specific function/class source
3. `mcp__codebase_memory__trace_path` — trace call chains (who calls what)
4. `mcp__codebase_memory__get_architecture` — project structure overview

**Priority order:** MCP graph → `read_file` → `search_files` (grep fallback)
Use MCP first for navigation. Fall back to file tools only for string literals or non-code files.

### 3.2 3D SCENE VERIFICATION — THREE.JS MCP

**For 3D scene verification, use three.js MCP tools:**

- `mcp__threejs__scene_tree` — list all objects in the scene hierarchy
- `mcp__threejs__object_details` — inspect a specific object by name/uuid
- `mcp__threejs__find_objects` — search objects by type, material, visibility
- `mcp__threejs__take_screenshot` — capture current scene state
- `mcp__threejs__perf_monitor` — check FPS, draw calls, triangles
- `mcp__threejs__performance_snapshot` — detailed GPU memory analysis
- `mcp__threejs__bounding_boxes` — show/hide axis-aligned bounding boxes

**When to use 3D MCP verification:**
- After changes to map generation (colliders, walls, doors)
- After changes to entity spawning (position, rotation, scale)
- After changes to rendering (lighting, materials, post-processing)

---

## 4. PLAYWRIGHT — HEADLESS VERIFICATION

Playwright is configured in `playwright.config.js` with `headless: true`. Tests live in `tests/*.spec.js`.

### 4.1 WHEN TO RUN PLAYWRIGHT TESTS

- After changes to 3D scene (map generation, colliders, lighting)
- After changes to entities (spawn, death, movement)
- After changes to rendering (camera, post-processing, effects)
- Before committing any feature or refactor

### 4.2 RUN COMMANDS

```
npx playwright test --project=chromium             # headless, for pipeline
npx playwright test --project=chromium --headed    # interactive, for debugging
npx playwright test --project=chromium --grep "weapon"  # specific test
```

### 4.3 TEST ARTIFACTS

Screenshots saved by Playwright to `tests/screenshots/` are **NEVER committed** — they are artifacts, not source code. They stay `.gitignore`d.

---

## 5. CODE CONVENTIONS

- **Indentation:** 2 tabs per level (matching existing codebase style)
- **Quotes:** single quotes for strings, double quotes for JSX
- **Imports:** ES modules (`import { X } from './Y.js'`)
- **No comments in code** unless explaining non-obvious logic
- **No placeholder code** (`TODO`, `FIXME`) — either implement or don't commit
- **No drive-by refactors** — only touch what the task requires

---

## 6. COMMUNICATION

- Language: Russian for discussion, English for code
- Format: Concrete — file paths, line numbers, command output, diff size
- No introductions, no filler. Lead with the change or answer.
- Never fabricate output — if a tool fails, say so and try an alternative.

---

## 7. VERIFICATION CHECKLIST

Before committing any change, verify:

1. [ ] `node --check <file>.js` — syntax valid
2. [ ] `git diff --stat <file>` — diff matches intent
3. [ ] No unintended side effects in modified region
4. [ ] No duplicate variable declarations
5. [ ] Import statements present for new dependencies
6. [ ] Playwright tests pass (if applicable — 3D/entity/rendering changes)
7. [ ] No secrets, tokens, or API keys in diff
8. [ ] No generated artifacts (screenshots, logs, builds) in diff

---

## 8. PROJECT STRUCTURE

```
rublox/
├── AGENTS.md              ← this file — read it every session
├── package.json           ← dependencies, scripts
├── playwright.config.js   ← headless test config
├── server.js              ← Express + WebSocket server
├── index.html             ← game entry point
├── core/                  ← audio, physics, utilities
├── entities/              ← Player, Enemy, EntityManager
├── items/                 ← Weapon, Inventory, Item
├── world/                 ← MapGenerator, InstancedMeshSystem, BiomeSystem
├── ai/                    ← enemy AI (Zombie, Stalker, Rat)
├── net/                   ← multiplayer (Peer, GameServer)
├── ui/                    ← HUD, menus, controls
├── tests/                 ← Playwright test specs (NOT artifacts)
└── yandex-game/           ← build output (gitignored)
```
