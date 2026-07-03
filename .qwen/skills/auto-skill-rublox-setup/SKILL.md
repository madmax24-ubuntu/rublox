---
name: rublox-setup
description: Setup Playwright, Git, and MCP for internet search in the rublox project
source: auto-skill
extracted_at: '2026-07-03T07:10:30.969Z'
---

# Rublox Project Setup

## Setup Steps

### 1. Playwright
- Already installed in `package.json` (`playwright@^1.59.1`)
- Chromium browser installed via `npx playwright install chromium`
- FFmpeg installed via `npx playwright install ffmpeg`
- Ready for automated testing

### 2. Git
- Git version 2.52.0 installed
- Repository initialized
- Some untracked files in `test-results/`

### 3. MCP for Internet Search
- `web_fetch` tool already available for fetching URL content
- For MCP-based search, consider Tavily or Brave Search API
- Requires API key from external service

## Current State
- Playwright: ✅ Installed + browsers
- Git: ✅ Installed + repo
- MCP Search: ⚠️ `web_fetch` available, MCP servers not configured
