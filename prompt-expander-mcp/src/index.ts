import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rulesFile = resolve(__dirname, "rules.json");
const rules = JSON.parse(readFileSync(rulesFile, "utf-8")).rules;

const server = new McpServer({ name: "prompt-expander", version: "1.0.0" });

server.tool(
  "expand_prompt",
  "Takes a short, vague user prompt and expands it into a detailed, actionable instruction by applying predefined rules. Use this when the user writes a brief request that needs more context or structure.",
  { prompt: { type: "string" } },
  ({ prompt }) => {
    const lower = prompt.toLowerCase();
    const matched = rules.filter(r => lower.includes(r.keyword));

    if (matched.length === 0) {
      return {
        content: [{ type: "text", text: `No rules matched for: "${prompt}". Original prompt unchanged.` }],
        isError: true,
      };
    }

    const expansions = matched.map(r => r.expansion);
    const expanded = [
      `# Task: ${prompt.trim()}`,
      "",
      "## Requirements",
      ...expansions.map((e, i) => `${i + 1}. ${e}`),
      "",
      "## Notes",
      "- Implement all listed requirements unless explicitly excluded",
      "- Write clean, maintainable code",
      "- Add tests for new functionality",
      "- Follow existing project conventions",
    ].join("\n");

    return {
      content: [{ type: "text", text: expanded }],
    };
  }
);

server.tool(
  "add_rule",
  "Add a new expansion rule. When the user's prompt contains the keyword, the expansion text will be included in the expanded prompt.",
  { keyword: { type: "string" }, expansion: { type: "string" } },
  ({ keyword, expansion }) => {
    const lower = keyword.toLowerCase();
    const existing = rules.findIndex(r => r.keyword === lower);
    if (existing >= 0) {
      rules[existing].expansion = expansion;
    } else {
      rules.push({ keyword: lower, expansion });
    }
    try {
      writeFileSync(rulesFile, JSON.stringify({ rules }, null, 2), "utf-8");
    } catch {
      // rules file might not be writable, that's ok
    }
    return {
      content: [{ type: "text", text: `Rule saved: "${lower}" → "${expansion}"` }],
    };
  }
);

server.tool(
  "list_rules",
  "List all current expansion rules.",
  {},
  () => {
    const text = rules.map(r => `- **${r.keyword}**: ${r.expansion}`).join("\n");
    return { content: [{ type: "text", text: `Total: ${rules.length} rules\n\n${text}` }] };
  }
);

await server.run();