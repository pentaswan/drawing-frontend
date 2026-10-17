# Inkframe — Draw to HTML

Draw with a red pen on an invisible canvas overlay, label stroke groups, then generate real HTML elements from the sketch via a pluggable vision API (Perceptron by default).

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
4. Type a label and hit **Confirm** to seal that group.
5. Repeat for more regions, then **Generate**.
6. Confirm or discard any open strokes before generating.
7. Keep iterating to build up a full page.

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
