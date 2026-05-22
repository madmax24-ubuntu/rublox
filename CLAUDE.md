## Context Management
- Auto-compact at 96% — no user confirmation needed
- After compact: continue immediately, no summary
- Context window: 140000 tokens

## MCP Servers
- **playwright** — browser automation (navigate, screenshot, click, type)
- **context7** — search documentation, API references, best practices
- Use context7 first for any Three.js/JS question
- Use playwright for testing the game in browser

## Agent Usage
- Use Agent tool for complex multi-step tasks
- For research: spawn subagent with specific query
- For code changes: spawn subagent with exact file paths
- For testing: spawn subagent with test commands

## Image Reference
- Upload screenshot/photo — I'll analyze it precisely
- Describe what you want changed/added
- I'll generate exact code to match the visual reference

## Code Style
- Direct code only, no explanations unless asked
- Fix errors silently — don't mention them
- Focus on performance for Three.js and survival mechanics
- Small, focused changes — one file at a time
