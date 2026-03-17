import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { validateApiToken } from "./auth.js";
import type { DebugLogger } from "./debug.js";
import { toAnthropicError, toOpenAiError } from "./errors.js";
import type { FetchLike } from "./providers/base.js";
import { ProxyService } from "./service.js";
import type {
  AnthropicCompletionRequest,
  AnthropicCountTokensRequest,
  AnthropicMessageRequest,
  ChatRequest,
  EmbeddingRequest,
  RoundaboutConfig
} from "./types.js";

export function createServer(
  config: RoundaboutConfig,
  fetcher?: FetchLike,
  logger: DebugLogger = { enabled: false, log() {} }
): FastifyInstance {
  const app = Fastify({ logger: false });
  const proxy = new ProxyService(config, fetcher);

  app.addHook("onRequest", async (request) => {
    logger.log("request.received", {
      method: request.method,
      url: request.url,
      headers: request.headers
    });
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/healthz") {
      return;
    }

    const auth = validateApiToken(
      {
        authorization: request.headers.authorization,
        "x-api-key":
          typeof request.headers["x-api-key"] === "string" ? request.headers["x-api-key"] : undefined
      },
      config
    );
    if (!auth) {
      const isAnthropic = isAnthropicRequest(request.url);
      if (isAnthropic) {
        logger.log("auth.failed", {
          surface: "anthropic",
          url: request.url
        });
        reply.code(401).send({
          type: "error",
          error: {
            type: "authentication_error",
            message: "Invalid or missing api key"
          }
        });
      } else {
        logger.log("auth.failed", {
          surface: "openai",
          url: request.url
        });
        reply.code(401).send({
          error: {
            message: "Invalid or missing bearer token",
            type: "authentication_error",
            code: "invalid_api_key"
          }
        });
      }
      return reply;
    }
  });

  app.get("/healthz", async () => ({
    ok: true,
    host: config.daemon.host,
    port: config.daemon.port,
    aliases: Object.keys(config.aliases).length
  }));

  app.get("/v1/models", async () => ({
    object: "list",
    data: Object.entries(config.aliases).map(([id, route]) => ({
      id,
      object: "model",
      created: 0,
      owned_by: route.primary.provider
    }))
  }));

  app.post("/v1/chat/completions", async (request, reply) => {
    const body = request.body as ChatRequest;
    logger.log("request.body", {
      url: request.url,
      body
    });
    try {
      if (body.stream) {
        const stream = proxy.streamChat(body);
        const first = await stream.next();
        if (first.done) {
          reply.raw.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive"
          });
          reply.raw.write("data: [DONE]\n\n");
          reply.raw.end();
          return reply;
        }

        reply.raw.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive"
        });
        logger.log("response.stream.chunk", {
          url: request.url,
          chunk: first.value
        });
        reply.raw.write(`data: ${JSON.stringify(first.value)}\n\n`);

        for await (const chunk of stream) {
          logger.log("response.stream.chunk", {
            url: request.url,
            chunk
          });
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        reply.raw.write("data: [DONE]\n\n");
        reply.raw.end();
        return reply;
      }

      const response = await proxy.chat(body);
      logger.log("response.body", {
        url: request.url,
        body: response
      });
      return reply.send(response);
    } catch (error) {
      const normalized = toOpenAiError(error);
      logger.log("response.error", {
        url: request.url,
        body: normalized.body
      });
      return reply.code(normalized.statusCode).send(normalized.body);
    }
  });

  app.post("/v1/embeddings", async (request, reply) => {
    const body = request.body as EmbeddingRequest;
    logger.log("request.body", {
      url: request.url,
      body
    });
    try {
      const response = await proxy.embeddings(body);
      logger.log("response.body", {
        url: request.url,
        body: response
      });
      return reply.send(response);
    } catch (error) {
      const normalized = toOpenAiError(error);
      logger.log("response.error", {
        url: request.url,
        body: normalized.body
      });
      return reply.code(normalized.statusCode).send(normalized.body);
    }
  });

  app.post("/v1/messages", async (request, reply) => {
    const body = request.body as AnthropicMessageRequest;
    logger.log("request.body", {
      url: request.url,
      body
    });
    try {
      if (body.stream) {
        const stream = proxy.streamMessages(body);
        const first = await stream.next();
        if (first.done) {
          reply.raw.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive"
          });
          reply.raw.end();
          return reply;
        }

        reply.raw.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive"
        });
        logger.log("response.stream.chunk", {
          url: request.url,
          chunk: first.value
        });
        reply.raw.write(`event: ${first.value.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(first.value)}\n\n`);

        for await (const event of stream) {
          logger.log("response.stream.chunk", {
            url: request.url,
            chunk: event
          });
          reply.raw.write(`event: ${event.type}\n`);
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        reply.raw.end();
        return reply;
      }

      const response = await proxy.messages(body);
      logger.log("response.body", {
        url: request.url,
        body: response
      });
      return reply.send(response);
    } catch (error) {
      const normalized = toAnthropicError(error);
      logger.log("response.error", {
        url: request.url,
        body: normalized.body
      });
      return reply.code(normalized.statusCode).send(normalized.body);
    }
  });

  app.post("/v1/complete", async (request, reply) => {
    const body = request.body as AnthropicCompletionRequest;
    logger.log("request.body", {
      url: request.url,
      body
    });
    try {
      if (body.stream) {
        const stream = proxy.streamComplete(body);
        const first = await stream.next();
        if (first.done) {
          reply.raw.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive"
          });
          reply.raw.end();
          return reply;
        }

        reply.raw.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive"
        });
        logger.log("response.stream.chunk", {
          url: request.url,
          chunk: first.value
        });
        reply.raw.write(`event: ${first.value.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(first.value)}\n\n`);

        for await (const event of stream) {
          logger.log("response.stream.chunk", {
            url: request.url,
            chunk: event
          });
          reply.raw.write(`event: ${event.type}\n`);
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        reply.raw.end();
        return reply;
      }

      const response = await proxy.complete(body);
      logger.log("response.body", {
        url: request.url,
        body: response
      });
      return reply.send(response);
    } catch (error) {
      const normalized = toAnthropicError(error);
      logger.log("response.error", {
        url: request.url,
        body: normalized.body
      });
      return reply.code(normalized.statusCode).send(normalized.body);
    }
  });

  app.post("/v1/messages/count_tokens", async (request, reply) => {
    const body = request.body as AnthropicCountTokensRequest;
    logger.log("request.body", {
      url: request.url,
      body
    });
    try {
      const response = await proxy.countTokens(body);
      logger.log("response.body", {
        url: request.url,
        body: response
      });
      return reply.send(response);
    } catch (error) {
      const normalized = toAnthropicError(error);
      logger.log("response.error", {
        url: request.url,
        body: normalized.body
      });
      return reply.code(normalized.statusCode).send(normalized.body);
    }
  });

  return app;
}

export async function startServer(
  config: RoundaboutConfig,
  fetcher?: FetchLike,
  logger?: DebugLogger
) {
  const app = createServer(config, fetcher, logger);
  await app.listen({
    host: config.daemon.host,
    port: config.daemon.port
  });
  return app;
}

function isAnthropicRequest(url: string) {
  const pathname = url.split("?", 1)[0];
  return pathname === "/v1/messages" || pathname === "/v1/complete" || pathname === "/v1/messages/count_tokens";
}
