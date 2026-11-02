// Minimal MCP server (Streamable HTTP) for Pebble Index 01.
// Exposes one tool, create_issue, that always files into one repo, set by the
// GITHUB_REPO secret/env var ("owner/repo"). The client can never choose the repo.

const VERSION = "0.0.2";

const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS =
  "Use create_issue whenever the user asks to create, file, log or add a GitHub issue, " +
  "task, bug or idea. The repository is fixed and handled by the server: never ask for " +
  "or guess an owner or repository name. Put the user's words in the body, including " +
  "any project name they mention, even if it looks misspelled.";

const TOOLS = [
  {
    name: "create_issue",
    description:
      "Create a GitHub issue in the user's issue inbox. The repository is fixed; " +
      "do not ask for one.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short issue title" },
        body: {
          type: "string",
          description:
            "Issue details as dictated, including any project the user mentioned",
        },
      },
      required: ["title"],
    },
  },
];

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }
    if (request.headers.get("Authorization") !== `Bearer ${env.PROXY_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    let msg;
    try {
      msg = await request.json();
    } catch {
      return rpcError(null, -32700, "Parse error");
    }
    if (Array.isArray(msg) || typeof msg !== "object" || msg === null) {
      return rpcError(null, -32600, "Invalid request");
    }

    // Notifications (no id) get no JSON-RPC response.
    if (msg.id === undefined || msg.id === null) {
      return new Response(null, { status: 202 });
    }

    switch (msg.method) {
      case "initialize": {
        const asked = msg.params?.protocolVersion;
        return rpc(msg.id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked)
            ? asked
            : SUPPORTED_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "inbox-issues", title: "Inbox Issues", version: VERSION },
          instructions: INSTRUCTIONS,
        });
      }
      case "ping":
        return rpc(msg.id, {});
      case "tools/list":
        return rpc(msg.id, { tools: TOOLS });
      case "tools/call":
        return callTool(msg, env);
      default:
        return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  },
};

async function callTool(msg, env) {
  const { name, arguments: args = {} } = msg.params ?? {};
  if (name !== "create_issue") {
    return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
  }
  const title = String(args.title ?? "").trim();
  if (!title) return toolResult(msg.id, "A title is required.", true);

  const repo = String(env.GITHUB_REPO ?? "").trim();
  if (!REPO_PATTERN.test(repo)) {
    return toolResult(
      msg.id,
      "Server misconfigured: GITHUB_REPO must be set to \"owner/repo\".",
      true,
    );
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "inbox-issues-mcp",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body: String(args.body ?? "") }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return toolResult(
      msg.id,
      `GitHub returned ${res.status}: ${data.message ?? "unknown error"}`,
      true,
    );
  }
  return toolResult(msg.id, `Created issue #${data.number}: ${data.html_url}`);
}

function rpc(id, result) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolResult(id, text, isError = false) {
  return rpc(id, { content: [{ type: "text", text }], isError });
}
