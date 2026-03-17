# Roundabout

Roundabout is a local OpenAI-compatible LLM proxy. It runs as a CLI-managed daemon on `localhost`, maps stable model aliases to provider-specific models, and routes requests across OpenAI, Anthropic, and OpenRouter with ordered fallback.

## Commands

```bash
npm run dev -- setup
npm run dev -- start
npm run dev -- token create my-app
npm run dev -- token list
npm run dev -- status
```

## Config

By default Roundabout stores config in `~/.roundabout/config.json`.

```json
{
  "daemon": {
    "host": "127.0.0.1",
    "port": 4317
  },
  "providers": {
    "openai": {
      "enabled": true,
      "apiKey": "sk-openai"
    }
  },
  "aliases": {
    "smart": {
      "primary": {
        "provider": "openai",
        "model": "gpt-4.1-mini"
      },
      "fallbacks": [],
      "capabilities": ["chat"]
    }
  },
  "tokens": {
    "my-app": {
      "token": "rb_example",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

## API

Roundabout exposes an OpenAI-style `/v1` surface:

- `POST /v1/chat/completions`
- `POST /v1/embeddings`
- `GET /v1/models`

Authenticate with `Authorization: Bearer <project-token>`.

## License

MIT. See [LICENSE](/Users/rajparekh/roundabout/LICENSE).
