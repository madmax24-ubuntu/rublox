# AGENTS.md — Global Instruction for Rubo Arena

This file is the **single source of truth** for how you work on this project. Read it on every session start.

**IMPORTANT:** Universal rules are in `APPEND_SYSTEM.md` — read it FIRST, then this file. Never ignore either.

---

## 1. WORKFLOW — STRICT EXECUTION ORDER

Before ANY code change, follow this sequence:

### Step 1: DISCOVER WITH MCP (ALWAYS FIRST)

**Priority:** MCP graph → `read_file` → `search_files` (grep fallback). Use MCP first for navigation. Fall back to file tools only for string literals or non-code files.

```
mcp__codebase_memory__search_graph   → find functions/classes by name pattern
mcp__codebase_memory__get_code_snippet → read specific function source
mcp__codebase_memory__trace_path    → trace call chains (who calls what)
mcp__codebase_memory__get_architecture → project structure overview
```

**For 3D scene verification, use three.js MCP tools:**
```
mcp__threejs__scene_tree          → list all scene objects
mcp__threejs__object_details      → inspect specific object by name/uuid
mcp__threejs__find_objects        → search by type, material, visibility
mcp__threejs__take_screenshot     → capture scene state
mcp__threejs__perf_monitor        → FPS, draw calls, triangles
mcp__threejs__bounding_boxes      → show/hide colliders
mcp__threejs__performance_snapshot → detailed GPU memory analysis
mcp__threejs__overlay_selected    → inspect clicked object
```
**When to use 3D MCP:** After map generation changes, entity spawning, lighting, materials, or post-processing.

### Step 2: APPLY CHANGES LOCALLY

- Use `patch(mode: replace)` for targeted edits — requires exact `old_string` match
- If `patch` fails twice on the same file, use `write_file` for the full file
- **NEVER use `sed` for multi-line edits** (breaks indentation)
- Use `execute_code` (Python) for precise line-level fixes (indentation, bulk changes)

### Step 3: VERIFY BEFORE COMMIT

```
node --check <file>.js              → syntax MUST be valid
git diff --stat <file>              → confirm scope and intent
```
**NEVER commit without both checks.** A commit is not final until verified.

### Step 4: COMMIT

```
git add <file> && git commit -m "type(scope): description"
```
Conventional types: `feat`, `fix`, `refactor`, `debug`, `chore`
One logical change per commit. No drive-by refactors.

### Step 5: PUSH

```
git push
```
Push only after ALL commits for this task are done. Never commit without pushing.

---

## 2. CODEx DELEGATION — AUTONOMOUS CODING AGENTS

Codex CLI (`@openai/codex`) is an autonomous coding agent. Use it for feature building, refactoring, and PR reviews.

### Prerequisites
- Codex installed: `npm install -g @openai/codex`
- OpenAI auth configured (API key or Codex OAuth)
- **Must run inside a git repository** — Codex refuses to run outside one
- Use `pty=true` in terminal calls — Codex is interactive

### One-Shot Tasks
```
terminal(command="codex exec 'Add dark mode toggle to settings'", workdir="~/project", pty=true)
```

### Background Mode (Long Tasks)
```
# Start in background with PTY
terminal(command="codex exec --sandbox workspace-write 'Refactor the auth module'", workdir="~/project", background=true, pty=true)
# Returns session_id

# Monitor progress
process(action="poll", session_id="<id>")
process(action="log", session_id="<id>")

# Send input if Codex asks a question
process(action="submit", session_id="<id>", data="yes")

# Kill if needed
process(action="kill", session_id="<id>")
```

### Key Flags

| Flag | Effect |
|------|--------|
| `exec "prompt"` | One-shot execution, exits when done |
| `--sandbox workspace-write` (`-s`) | Sandboxed but auto-approves file changes (recommended) |
| `--dangerously-bypass-approvals-and-sandbox` | No sandbox, no approvals (fastest, most dangerous) |
| `--sandbox danger-full-access` | No Codex sandbox; use when bubblewrap fails on gateway |

> **Gateway caveat:** When running Codex from Hermes gateway, `workspace-write` sandbox may fail with `Permission denied`. Prefer `--sandbox danger-full-access` in that context.

### Rules
1. **Always use `pty=true`** — Codex is interactive and hangs without PTY
2. **Git repo required** — Codex won't run outside a git directory
3. **Use `exec` for one-shots** — `codex exec "prompt"` runs and exits cleanly
4. **`--sandbox workspace-write` for building** — auto-approves changes within the sandbox
5. **Background for long tasks** — use `background=true` and monitor with `process` tool
6. **Don't interfere** — monitor with `poll`/`log`, be patient with long-running tasks
7. **Parallel is fine** — run multiple Codex processes at once for batch work

### PR Reviews with Codex
```
# Clone to temp directory for safe review
terminal(command="REVIEW=$(mktemp -d) && git clone https://github.com/user/repo.git $REVIEW && cd $REVIEW && gh pr checkout 42 && codex review --base origin/main", pty=true)
```

### Parallel Issue Fixing with Worktrees
```
# Create worktrees
terminal(command="git worktree add -b fix/issue-78 /tmp/issue-78 main", workdir="~/project")
terminal(command="git worktree add -b fix/issue-99 /tmp/issue-99 main", workdir="~/project")

# Launch Codex in each
terminal(command="codex exec --sandbox workspace-write 'Fix issue #78: <description>. Commit when done.'", workdir="/tmp/issue-78", background=true, pty=true)
terminal(command="codex exec --sandbox workspace-write 'Fix issue #99: <description>. Commit when done.'", workdir="/tmp/issue-99", background=true, pty=true)

# Monitor
process(action="list")

# After completion, push and create PRs
terminal(command="cd /tmp/issue-78 && git push -u origin fix/issue-78")
terminal(command="gh pr create --repo user/repo --head fix/issue-78 --title 'fix: ...' --body '...'")

# Cleanup
terminal(command="git worktree remove /tmp/issue-78", workdir="~/project")
```

---

## 3. GIT RULES — NON-NEGOTIABLE

### 3.1 PUSH ONLY GAME SOURCE CODE

**Allowed:** `core/`, `entities/`, `items/`, `world/`, `ai/`, `net/`, `ui/`, `server.js`, `main.js`, `index.html`, `scripts/`, `package.json`, `package-lock.json`, `playwright.config.js`, `tests/*.spec.js`, `AGENTS.md`, `.gitignore`

**BANNED (generated artifacts):** `tests/screenshots/`, `*.png`/`*.jpg` in `tests/`, `*.log`, `*.tmp`, `*.bak`, `node_modules/`, `yandex-game/`

**Rule:** If it's a generated artifact → `.gitignore`d. If it's game logic → committed.

### 3.2 BRANCH STRATEGY
- `main` — stable, always deployable
- Feature branches for multi-commit work: `git checkout -b feature/short-desc`
- After completion: commit → push → merge to main
- Use `git stash` for temporary changes during debugging
- NEVER commit secrets, tokens, or API keys

### 3.3 ERROR RECOVERY
- Syntax error after commit → `git revert <hash>` or `git reset --soft HEAD~1`, fix, recommit
- Wrong commit → `git commit --amend` (if not yet pushed) or `git revert` (if already pushed)

---

## 4. PLAYWRIGHT — HEADLESS VERIFICATION

Playwright configured in `playwright.config.js` with `headless: true`. Tests in `tests/*.spec.js`.

**When to run:** After changes to 3D scene, entities, rendering, or colliders.

**Commands:**
```
npx playwright test --project=chromium             # headless (pipeline)
npx playwright test --project=chromium --headed    # interactive (debugging)
npx playwright test --project=chromium --grep "weapon"  # specific test
```

**Screenshots saved to `tests/screenshots/` are NEVER committed** — they are artifacts.

---

## 5. CODE CONVENTIONS

- **Indentation:** 2 tabs per level (existing codebase style)
- **Quotes:** single for strings, double for JSX
- **Imports:** ES modules (`import { X } from './Y.js'`)
- **No comments** in code unless explaining non-obvious logic
- **No placeholder code** (`TODO`, `FIXME`) — implement or don't commit

---

## 6. VERIFICATION CHECKLIST (BEFORE EVERY COMMIT)

1. [ ] `node --check <file>.js` — syntax valid
2. [ ] `git diff --stat <file>` — diff matches intent
3. [ ] No unintended side effects in modified region
4. [ ] No duplicate variable declarations
5. [ ] Import statements present for new dependencies
6. [ ] Playwright tests pass (if applicable — 3D/entity/rendering changes)
7. [ ] No secrets, tokens, or API keys in diff
8. [ ] No generated artifacts (screenshots, logs, builds) in diff

---

## 7. COMMUNICATION

- Language: Russian for discussion, English for code
- Format: Concrete — file paths, line numbers, command output, diff size
- No introductions, no filler. Lead with the change or answer.
- Never fabricate output — if a tool fails, say so and try an alternative.

---

## 8. PROJECT STRUCTURE

```
rublox/
├── AGENTS.md              ← this file
├── package.json
├── playwright.config.js   ← headless test config
├── server.js              ← Express + WebSocket
├── index.html
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
