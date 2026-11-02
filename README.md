# inbox-mcp

A tiny, single-purpose [MCP](https://modelcontextprotocol.io) server that lets you
create GitHub issues by voice from a **Pebble Index 01** ring.

The full GitHub MCP server can reach every repository your token can see. This relay
can't. It exposes exactly one tool, `create_issue`, and that tool always files into one
hard-coded repository: [`brlauuu/inbox`](https://github.com/brlauuu/inbox). The model
never picks the owner or repo, so a misheard project name ends up in the issue body
instead of sending the issue to the wrong place. You triage the inbox later.

```
Pebble ring ──voice──▶ Pebble app (LLM) ──MCP / HTTPS──▶ inbox-mcp ──REST──▶ GitHub: brlauuu/inbox
                                      Bearer PROXY_TOKEN             Bearer GITHUB_PAT
```

It runs as a Cloudflare Worker or a Vercel Function. There are no dependencies and no
build step.

## How it works

- Speaks MCP over **Streamable HTTP** (plain JSON-RPC over `POST`, no SSE), protocol
  versions `2025-06-18`, `2025-03-26` and `2024-11-05`.
- Handles `initialize`, `ping`, `tools/list` and `tools/call`. Notifications get a
  `202` with no body.
- `create_issue(title, body?)` creates the issue through the GitHub REST API and
  returns its number and URL.
- Every request must carry `Authorization: Bearer <PROXY_TOKEN>`. Anything else gets a
  `401`.
- The server sends instructions telling the client model not to ask for or guess a
  repository, and to keep any project name the user mentions in the body.

## Configuration

| Secret        | Purpose                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_PAT`  | A **fine-grained** personal access token scoped to the inbox repo only, with **Issues: Read and write**. Nothing else is needed. |
| `PROXY_TOKEN` | A long random string the Pebble app sends as its bearer token. Generate one with `openssl rand -hex 32`.                            |

To target a different repository, change `OWNER` and `REPO` at the top of
[`worker.js`](worker.js).

## Deploy to Cloudflare Workers

```sh
npx wrangler login
npx wrangler secret put GITHUB_PAT
npx wrangler secret put PROXY_TOKEN
npx wrangler deploy
```

Your endpoint is `https://inbox-mcp.<your-subdomain>.workers.dev/`.

For local testing, put the two secrets in a `.dev.vars` file (it's gitignored) and run
`npx wrangler dev`.

## Deploy to Vercel

[`api/index.js`](api/index.js) wraps the same handler and passes `process.env` in place
of the Worker `env`. [`vercel.json`](vercel.json) routes every path to it.

```sh
npx vercel link
npx vercel env add GITHUB_PAT production
npx vercel env add PROXY_TOKEN production
npx vercel deploy --prod
```

Your endpoint is `https://<project>.vercel.app/`. If Vercel Deployment Protection is on,
turn it off for production (or bypass it), or the Pebble app gets Vercel's login page
instead of the server.

## Connect the Pebble app

Add a custom MCP server in the Pebble app:

- **URL:** your deployed endpoint from above
- **Auth header:** `Authorization: Bearer <PROXY_TOKEN>`

Then say something like *"Create an issue: fix the login timeout in the dashboard
project"* into the ring.

## Test with curl

```sh
URL=https://inbox-mcp.<your-subdomain>.workers.dev/
TOKEN=<PROXY_TOKEN>

curl -s "$URL" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -s "$URL" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_issue","arguments":{"title":"Test from curl","body":"Hello from inbox-mcp"}}}'
```

## Files

| File            | What it is                                                  |
| --------------- | ----------------------------------------------------------- |
| `worker.js`     | The whole MCP server (Cloudflare Worker `fetch` handler)    |
| `wrangler.toml` | Cloudflare Worker config                                    |
| `api/index.js`  | Vercel Function entrypoint that reuses `worker.js`          |
| `vercel.json`   | Routes all Vercel paths to the function                     |
| `package.json`  | Marks the project as ES modules. It has no dependencies.   |
