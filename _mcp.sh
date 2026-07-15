#!/bin/bash
# MCP helper for codebase-memory-mcp
# Usage: _mcp.sh <method> <params_json>
# Example: _mcp.sh search_graph '{"project":"C-Users-maksk-Desktop-rublox","query":"camera collision"}'

PROJECT="C-Users-maksk-Desktop-rublox"
MCP_EXE="C:/Users/maksk/.local/bin/codebase-memory-mcp.exe"

METHOD="$1"
PARAMS="$2"

printf '{