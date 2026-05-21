# Hermes API integration notes

These notes capture the current recommended Hermes endpoint for DocHermes.

## Recommended endpoint

DocHermes should target Hermes API Server's OpenAI-compatible chat endpoint:

```text
POST /v1/chat/completions
```

Local default once Hermes API Server is running:

```text
http://localhost:8642/v1/chat/completions
```

Hosted/Railway-style endpoint shape:

```text
https://<your-hermes-api-domain>/v1/chat/completions
```

If the API server is exposed publicly, requests must use bearer auth:

```http
Authorization: Bearer <API_SERVER_KEY>
Content-Type: application/json
```

## Historical mismatch fixed by the compatibility layer

The initial prototype documented/sent a custom gateway endpoint:

```text
http://localhost:8787/coach
```

That is not a default Hermes API Server route. Hermes' built-in API server exposes routes such as:

- `GET /health`
- `GET /v1/models`
- `GET /v1/capabilities`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/runs`

So DocHermes should either:

1. update the client to send OpenAI-compatible multimodal chat requests to `/v1/chat/completions`, or
2. keep `/coach` and add a custom adapter service that translates `/coach` requests into Hermes chat completions.

Recommendation: use option 1 unless there is a strong compatibility reason to preserve `/coach`.

## Recommended request shape

Instead of this custom payload:

```json
{
  "question": "Should I take this trade now?",
  "screenshot": {
    "mimeType": "image/png",
    "dataBase64": "..."
  }
}
```

send OpenAI-compatible multimodal chat JSON:

```json
{
  "model": "hermes-agent",
  "messages": [
    {
      "role": "system",
      "content": "You are DocHermes, a risk coach for trading workflows. You do not place trades, route orders, access wallets, or provide execution commands. Analyze the selected trading-window screenshot and the user's question. Focus on risk, confirmation, invalidation, position sizing discipline, and emotional overtrading."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Should I take this trade now?\n\nConstraints:\n- executionCapability: false\n- platformAgnostic: true\n- captureRequiresUserSelection: true"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,..."
          }
        }
      ]
    }
  ]
}
```

## Response parsing

The existing parser already accepts basic OpenAI-style responses:

```json
{
  "choices": [
    {
      "message": {
        "content": "..."
      }
    }
  ]
}
```

That makes `/v1/chat/completions` the cleanest near-term integration target.

## Implementation status

`src/main/hermesClient.ts` now converts DocHermes' capture/question structure into the OpenAI-compatible multimodal chat format above when `auto` or `openai-chat` mode is active.

The settings default to the base URL:

```text
http://localhost:8642
```

DocHermes appends `/v1/chat/completions` for the Hermes API Server adapter. For a Railway-hosted Hermes API server, use the public API-server domain as the base URL plus bearer auth.

The compatibility layer also supports:

- Local candidate probing for `localhost` and `127.0.0.1` on known Hermes ports.
- `auto`, `openai-chat`, `legacy-coach`, and `custom` endpoint modes.
- Legacy `/coach` fallback when explicitly configured or discovered during auto probing.
- Model discovery through `/v1/models` and model-rejection diagnostics.
- Text and screenshot/image pings for connection testing.
- Masked debug reports that redact bearer tokens, URL userinfo, and common token query parameters.

When a connection test discovers a working candidate endpoint, DocHermes records that effective connection for future `askHermes(...)` calls.

## Privacy note

For trading screenshots, local Hermes API Server is preferred for privacy and latency:

```text
http://localhost:8642/v1/chat/completions
```

A hosted endpoint works, but it sends screenshots over the internet and should be opt-in, authenticated, and clearly disclosed in the UI.
