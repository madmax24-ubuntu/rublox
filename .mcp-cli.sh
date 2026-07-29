#!/bin/bash
# MCP CLI wrapper — calls Codebase-Memory MCP server via stdio
# Usage:
#   . .mcp-cli.sh           # load functions into shell
#   mcp_call <tool> <args_json>   # call any tool
#   mcp_search_graph 'query' [limit]
#   mcp_get_arch [project]
#   mcp_get_schema
#   mcp_list_projects
#   mcp_trace_path <func> [direction] [depth]
#   mcp_get_code <qualified_name>
#   mcp_query_graph '<cypher>'
#   mcp_search_code '<pattern>' [file_pattern]

MCP_BIN="${MCP_BIN:-$HOME/.local/bin/codebase-memory-mcp.exe}"
MCP_PROJECT="${MCP_PROJECT:-C-Users-maksk-Desktop-rublox}"

mcp_call() {
  local tool="$1"
  shift
  local args="${1:-{}}"
  printf '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"%s","arguments":%s},"id":1}\n' "$tool" "$args" | \
    timeout 30 "$MCP_BIN" 2>/dev/null | \
    python -c "
import sys, json
text = sys.stdin.read()
obj = json.loads(text.split('\n')[0])
content = obj['result']['content'][0]['text']
try:
    data = json.loads(content)
    print(json.dumps(data, indent=2))
except:
    print(content)
" 2>/dev/null
}

mcp_list_projects() {
  mcp_call list_projects '{}'
}

mcp_search_graph() {
  local query="${1:-}"
  local limit="${2:-200}"
  mcp_call search_graph "{\"query\":\"$query\",\"project\":\"$MCP_PROJECT\",\"limit\":$limit}"
}

mcp_get_arch() {
  local project="${1:-$MCP_PROJECT}"
  mcp_call get_architecture "{\"project\":\"$project\",\"aspects\":[\"overview\"]}"
}

mcp_get_schema() {
  mcp_call get_graph_schema "{\"project\":\"$MCP_PROJECT\"}"
}

mcp_trace_path() {
  local func="$1"
  local dir="${2:-both}"
  local depth="${3:-3}"
  mcp_call trace_path "{\"function_name\":\"$func\",\"project\":\"$MCP_PROJECT\",\"direction\":\"$dir\",\"depth\":$depth}"
}

mcp_get_code() {
  local qn="$1"
  mcp_call get_code_snippet "{\"qualified_name\":\"$qn\",\"project\":\"$MCP_PROJECT\"}"
}

mcp_query_graph() {
  local cypher="$1"
  mcp_call query_graph "{\"query\":\"$cypher\",\"project\":\"$MCP_PROJECT\"}"
}

mcp_search_code() {
  local pattern="$1"
  local file_pat="${2:-}"
  local extra=""
  if [ -n "$file_pat" ]; then
    extra=",\"file_pattern\":\"$file_pat\""
  fi
  mcp_call search_code "{\"pattern\":\"$pattern\",\"project\":\"$MCP_PROJECT\"$extra}"
}
