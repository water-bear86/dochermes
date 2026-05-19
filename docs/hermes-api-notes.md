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

## Current mismatch to fix

The prototype currently documents/sends a custom gateway endpoint:

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

## Suggested next code change

Update `src/main/hermesClient.ts` so it converts DocHermes' current capture/question structure into the OpenAI-compatible multimodal chat format above.

The settings field should eventually default to:

```text
http://localhost:8642/v1/chat/completions
```

For a Railway-hosted Hermes API server, use the public API-server domain with the same path, plus bearer auth.

## Privacy note

For trading screenshots, local Hermes API Server is preferred for privacy and latency:

```text
http://localhost:8642/v1/chat/completions
```

A hosted endpoint works, but it sends screenshots over the internet and should be opt-in, authenticated, and clearly disclosed in the UI.
