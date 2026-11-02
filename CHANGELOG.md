# Changelog

## Unreleased

- `skills/triage-inbox`: a Claude Code skill that walks through the inbox and files each issue into the repo it belongs to.
- Docs: note that GitHub can't transfer issues from a private inbox to a public repository.

## 0.0.1 — 2026-11-02

First release.

- MCP server over Streamable HTTP (JSON-RPC over `POST`, no SSE) that handles `initialize`, `ping`, `tools/list` and `tools/call`, for protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05`.
- A single tool, `create_issue(title, body?)`, that files every issue into the one repository set by `GITHUB_REPO` (`owner/repo`). Clients can't choose or override the repository. A missing or malformed value returns an error without calling GitHub.
- Every request must send `Authorization: Bearer <PROXY_TOKEN>`.
- Deploys as a Cloudflare Worker (`wrangler.toml`) or a Vercel Function (`api/index.js`, `vercel.json`). No dependencies and no build step.
- README with setup, deployment and Pebble Index 01 instructions, a project logo, and a GitHub Pages site at https://brlauuu.github.io/inbox-mcp/.
