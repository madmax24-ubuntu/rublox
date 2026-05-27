## Context Management
- Auto-compact at 96% — no user confirmation needed
- After compact: continue immediately, no summary
- Context window: 140000 tokens

## Timeouts (on tool responses only)
- **If a tool (Bash/Agent/Playwright) stops responding** — kill it and retry with different approach
- **Default timeout**: 60s for tool calls, 30s for browser operations
- **Never wait indefinitely for a tool response** — if stuck, close the tool, change approach, move forward
- **Agents**: if an agent takes >60s without output, stop it and retry with narrower scope

## Autonomy Rules
- **Install dependencies automatically** — if a tool/package is missing, `npm i` / `apt install` without asking
- **Use ALL available tools** — Bash, Glob, Grep, Agent, Playwright, context7, computer-use — whatever solves the task fastest
- **Research first** — always search docs via context7 before guessing. Check npm/Three.js docs for new APIs
- **Search the internet** — if unsure about a library/API, use WebFetch or context7 to find official docs
- **Test autonomously** — create tests, run them, fix failures. Don't ask permission to run `node test.mjs`
- **Self-directed debugging** — if something breaks, add logging, reproduce, fix, verify. Full cycle without permission

## MCP Servers
- **playwright** — browser automation (navigate, screenshot, click, type)
- **playwright** — also read browser console via `page.on('console', msg => log(msg.text()))`
- **playwright** — also capture all console logs: `const logs = await page.evaluate(() => window._consoleLogs || [])`
- **context7** — search documentation, API references, best practices
- Use context7 first for any Three.js/JS question
- Use playwright for testing the game in browser — always read console to debug

## Agent Usage
- Use Agent tool for complex multi-step tasks
- For research: spawn subagent with specific query
- For code changes: spawn subagent with exact file paths
- For testing: spawn subagent with test commands
- **Run agents in parallel** when tasks are independent (maximize speed)
- **Set timeouts** on all agent spawns — agents should not run more than 120s

## Image Reference
- Upload screenshot/photo — I'll analyze it precisely
- Describe what you want changed/added
- I'll generate exact code to match the visual reference

## Code Style
- Direct code only, no explanations unless asked
- Fix errors silently — don't mention them
- Focus on performance for Three.js and survival mechanics
- Small, focused changes — one file at a time
