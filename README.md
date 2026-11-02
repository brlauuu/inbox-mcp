<p align="center"><img src="docs/logo.svg" width="120" alt="inbox-mcp logo"></p>

# inbox-mcp

A tiny, single-purpose [MCP](https://modelcontextprotocol.io) server that lets you
create GitHub issues by voice.

**Why**: because using GitHub's official MCP is hard when you give weird names to your repos and the transcription agents can't parse them out. Especially when English is not your native language.

`inbox-mcp` allows you to choose one repo, stuff all the issues there, irrelevant how poorly transcribed they are, and then transfer them to the right repo.

I use it for interaction with my [**Pebble Index 01**](https://repebble.com/index) ring:

```
Pebble ring ──voice──▶ Pebble app (LLM) ──MCP / HTTPS──▶ inbox-mcp ──REST──▶ GitHub: <GITHUB_REPO>
                                        Bearer PROXY_TOKEN        Bearer GITHUB_PAT
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
| `GITHUB_REPO` | The one repository every issue goes to, as `owner/repo` (for example `your-name/issue-inbox`). Clients can't override it.                  |

If `GITHUB_REPO` is missing or malformed, `create_issue` returns an error and never calls GitHub.

### Keeping your issues private

GitHub has no per-issue privacy: a public repo's issues are always public. Because
`inbox-mcp` files into a *separate* repository, you can still keep them private.
Make the `GITHUB_REPO` repository private, and give `GITHUB_PAT` access to just that
repo. This code repo can stay public.

## Deploy to Cloudflare Workers

```sh
npx wrangler login
npx wrangler secret put GITHUB_PAT
npx wrangler secret put PROXY_TOKEN
npx wrangler secret put GITHUB_REPO   # e.g. your-name/issue-inbox
npx wrangler deploy
```

Your endpoint is `https://inbox-mcp.<your-subdomain>.workers.dev/`.

For local testing, put the three values in a `.dev.vars` file (it's gitignored) and run
`npx wrangler dev`.

## Deploy to Vercel

[`api/index.js`](api/index.js) wraps the same handler and passes `process.env` in place
of the Worker `env`. [`vercel.json`](vercel.json) routes every path to it.

```sh
npx vercel link
npx vercel env add GITHUB_PAT production
npx vercel env add PROXY_TOKEN production
npx vercel env add GITHUB_REPO production   # e.g. your-name/issue-inbox
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
| `docs/`         | GitHub Pages site                                           |
