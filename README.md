# Inkframe — Draw to HTML

Draw with a red pen on an invisible canvas overlay, label stroke groups, then generate real HTML elements from the sketch via a pluggable vision API (Perceptron by default). Use **Global chat** for page-wide changes and sandboxed Node.js backends.

## Quick start

```bash
cp .env.example .env
# Set PERCEPTRON_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY / XAI_API_KEY)

npm install
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3001  

## How to use

1. Draw freely with the red pen.
2. When you lift the pointer, a label panel appears under the stroke group.
3. Keep drawing to hide the panel and grow the group; it reappears when you stop.
4. Type a label and hit **Confirm** to generate that region (HTML, client scripts, optional backend).
5. Use **Global edits** (bottom-right, hidden in preview) for site-wide ops — e.g. “soft blue background” or “add a counter that fetches YouTube views”.
6. Press **Preview** (or `T`) to interact with the page; Esc exits preview.
7. Hit **Publish**, choose a URL name (`letters`, `numbers`, `-`, `_`), then open `http://localhost:5173/your-name` — no editor chrome, with that site’s sandboxed APIs at `/api/p/your-name/...`.

## Global chat vs drawing

| | Drawing / Confirm | Global chat |
|---|---|---|
| Scope | One sketched region | Whole page |
| Typical ops | add / replace / remove section | `pageStyle`, multi-element edits |
| Backend | Yes (sandboxed) | Yes (sandboxed) |

## Per-user backend sandboxes

Each browser gets a stable `sessionId` (localStorage). AI-generated Node handlers are deployed under:

`/api/u/:sessionId/<route>`

Example client script (injected as `apiBase`):

```js
const res = await fetch(`${apiBase}/youtube-views?id=dQw4w9WgXcQ`)
const data = await res.json()
root.querySelector('.views').textContent = data.views
```

**Safeguards**

- Handlers run in a **child process** with a stripped environment (no host API keys).
- `npm install --ignore-scripts` into `sandboxes/<sessionId>/` only.
- Package **allowlist** (cheerio, axios, zod, …) — see `server/sandbox/allowlist.ts`.
- Static checks block `fs`, `child_process`, `eval`, `process.env`, localhost URLs, etc.
- Require guard: only allowlisted builtins + packages resolved inside that session directory.
- Request timeout (default 12s). Routes are isolated per session so users do not share API paths.

## Vision providers

Set `VISION_PROVIDER=perceptron|openai|anthropic|grok` (or pick one in the toolbar).

| Provider    | Env key               | Default model              |
|------------|------------------------|----------------------------|
| Perceptron | `PERCEPTRON_API_KEY`   | `perceptron-mk1.5`         |
| OpenAI     | `OPENAI_API_KEY`       | `gpt-4o`                   |
| Anthropic  | `ANTHROPIC_API_KEY`    | `claude-sonnet-4-20250514` |
| Grok (xAI) | `XAI_API_KEY`          | `grok-4.7`                 |

Providers share one request/response contract in `server/vision/types.ts`. Add another adapter by implementing `VisionProvider` and registering it in `server/vision/registry.ts`.

## Scripts

- `npm run dev` — Vite + API together
- `npm run dev:web` / `npm run dev:api` — run separately
- `npm run build` — production client build
