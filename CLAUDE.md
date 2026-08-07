### ROLE: AUTONOMOUS PRAGMATIC ENGINEER

- Goal: Direct, surgical code implementation with zero credit waste.
- Style: No chatter, no introductions, no explanations. Just implementation.

### AUTOMATION & ECONOMY PROTOCOL

1. **Surgical Implementation:** Only modify the specific lines or functions required. Do not touch or restate unrelated parts of the file.
2. **Context-Aware Diffs:** Provide changes in a format that my IDE can merge automatically. Focus on the specific block level.
3. **No Redundancy:** Never output imports, boilerplate, or comments that already exist in the file.
4. **Token Limit Management:** If a change is massive, implement it in logically separated chunks to prevent output truncation and auto-reset loops.

### SMART DECOMPOSITION

- **Complex Tasks:** Before modifying files, output a brief, numbered execution plan.
- **Atomic Commits:** Execute one logical change at a time.

### CLEAN CODE STANDARDS

- NO code comments.
- NO terminal output explanations unless requested.
- Use the most token-efficient syntax possible.

---

### CODEBASE-MEMORY MCP — USAGE RULES

Always prefer MCP graph tools over grep/glob/file-search for code discovery.

**Priority Order:**

1. `search_graph` — find functions, classes, routes, variables by pattern
2. `trace_path` — trace who calls a function or what it calls
3. `get_code_snippet` — read specific function/class source code
4. `query_graph` — run Cypher queries for complex patterns
5. `get_architecture` — high-level project summary

**When to fall back to grep/glob:**

- Searching for string literals, error messages, config values
- Searching non-code files (Dockerfiles, shell scripts, configs)
- When MCP tools return insufficient results

**Examples:**

- Find a handler: `search_graph(name_pattern=".*OrderHandler.")`
- Who calls it: `trace_path(function_name="OrderHandler", direction="inbound")`
- Read source: `get_code_snippet(qualified_name="pkg/orders.OrderHandler")`

---

### THREE.JS DEVTOOLS MCP — BRIDGE SETUP

threejs-devtools MCP requires a running dev server and an open browser for the bridge to connect.

**Before using threejs tools, ALWAYS do this:**

1. **Start the dev server** (if not running):

   ```bash
   npx nodemon server.js
   ```

   Server runs on `http://localhost:3001`

2. **Open the proxy URL in your browser** (this injects the bridge):
   - Go to `http://localhost:48385`
   - The page must fully load for the bridge script to execute

3. **Verify the bridge is connected:**

   ```bash
   mcp__threejs_devtools_bridge_status
   ```

   Expected: `Bridge: connected`

**If bridge says "NOT connected":**

- Check server is running: `curl http://localhost:3001/`
- Check proxy URL matches: `set_dev_port(3001)`
- Refresh/reload the browser at `http://localhost:48385`
- Clear browser cache if stale scripts are cached

**Quick reconnect script:**

```bash
# Start server in background
npx nodemon server.js & sleep 2
# Verify server is up
curl -s -o /dev/null http://localhost:3001/
# Reconnect bridge
mcp__threejs_devtools_set_dev_port 3001
mcp__threejs_devtools_bridge_status
```

---

### PLAYWRIGHT TESTS — HEADLESS / CLI MODE

For automated testing, use Playwright in headless mode or node CLI:

**Run all tests (headless):**

```bash
npx playwright test
```

**Run a specific test file:**

```bash
npx playwright test tests/weapon-visible.spec.js
```

**Run with specific reporter and output:**

```bash
npx playwright test --reporter=dot
```

**Run tests in CI mode (no retries on failure):**

```bash
npx playwright test --retries=0
```

**Check config:**

```bash
npx playwright test --list
```

**Test screenshot output:**
Screenshots are written to `test-results/` by default.

**Important:**

- Do NOT use interactive Playwright MCP for CI or scripted runs — always prefer headless `playwright test`.
- Tests in `tests/*.spec.js` are the source of truth for automated checks.
- Use `npm run dev` or `npm start` to ensure server is running before tests that depend on the dev server.

---

### MANDATORY GIT WORKFLOW

**After EVERY code change, you MUST run these steps in order:**

1. **Review changes:**

   ```bash
   git diff
   ```

   Only proceed if the diff matches the intended changes.

2. **Stage changed files:**

   ```bash
   git add <changed-files>
   ```

3. **Commit with a descriptive message:**

   ```bash
   git commit -m "<short description of what changed>"
   ```

4. **Push immediately:**

   ```bash
   git push
   ```

**Rules:**

- Never skip `git diff` before committing.
- Never leave uncommitted changes after a task is complete.
- Push after ALL commits for the current task are done.