# Roundabout

Roundabout is a local LLM gateway you run on your own machine.

It starts a daemon on `localhost`, exposes OpenAI-compatible and Anthropic-compatible endpoints, and routes stable model aliases to upstream providers like OpenAI, Anthropic, and OpenRouter. The goal is to let local tools talk to one endpoint while you keep provider keys, aliases, and fallback policy in one place.

## What It Does

- runs a local daemon with a single auth/token model for your apps
- exposes OpenAI-style chat and embeddings endpoints
- exposes Anthropic-style messages, completions, and token counting endpoints
- resolves local model aliases to provider/model targets
- supports ordered provider fallback through alias config
- works well as a bridge for local tools such as Claude Code or custom scripts

## Install

```bash
npm install -g @rajparekh/roundabout
```

Or run it without a global install:

```bash
npx @rajparekh/roundabout start
```

This installs the `roundabout` CLI command.

## Quick Start

1. Run the setup wizard:

```bash
roundabout setup
```

2. Start the daemon:

```bash
roundabout start
```

3. Generate a token for a local client:

```bash
roundabout token create my-app
```

4. Point your client at the local daemon:

OpenAI-style:

```bash
curl http://127.0.0.1:4317/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rb_your_token" \
  -d '{
    "model": "smart",
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }'
```

Anthropic-style:

```bash
curl http://127.0.0.1:4317/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: rb_your_token" \
  -d '{
    "model": "smart",
    "max_tokens": 128,
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }'
```

## Commands

```bash
roundabout setup
roundabout start
roundabout start --debug
roundabout token create my-app
roundabout token rotate my-app
roundabout token list
roundabout status
```

For local development:

```bash
npm run dev -- setup
npm run dev -- start
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

Key config sections:

- `daemon`: local bind host and port
- `providers`: upstream API keys and optional custom base URLs
- `aliases`: local model names and fallback routes
- `tokens`: local client tokens accepted by the daemon

## API Surfaces

OpenAI-compatible:

- `POST /v1/chat/completions`
- `POST /v1/embeddings`
- `GET /v1/models`

Anthropic-compatible:

- `POST /v1/messages`
- `POST /v1/complete`
- `POST /v1/messages/count_tokens`

Auth:

- OpenAI-style endpoints accept `Authorization: Bearer <project-token>`
- Anthropic-style endpoints accept either `x-api-key: <project-token>` or Bearer auth

## Packaging

The npm package is published as `@rajparekh/roundabout` and installs the `roundabout` binary.

To build or package locally:

```bash
npm run build
npm pack
```

## License

MIT. See [LICENSE](/Users/rajparekh/roundabout/LICENSE).
