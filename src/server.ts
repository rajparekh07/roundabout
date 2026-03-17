import Fastify from "fastify";
import type { FastifyInstance, FastifyReply } from "fastify";

import { buildAppContainer } from "./bootstrap/build-app.js";
import type { ServerDependencies } from "./core/contracts.js";
import type { DebugLogger } from "./debug.js";
import { toAnthropicError, toOpenAiError } from "./errors.js";
import type { FetchLike } from "./providers/base.js";
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
  return createServerWithDependencies(buildAppContainer(config, fetcher, logger));
}

export function createServerWithDependencies(dependencies: ServerDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const { config, logger } = dependencies;

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

    const auth = dependencies.authTokenService.validate({
      authorization: request.headers.authorization,
      "x-api-key": normalizeHeader(request.headers["x-api-key"])
    });
    if (auth) {
      return;
    }

    if (isAnthropicRequest(request.url)) {
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
      return reply;
    }

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
    return reply;
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
    logger.log("request.body", { url: request.url, body });
    try {
      if (body.stream) {
        await sendOpenAiStream(reply, request.url, logger, dependencies.chatService.stream(body));
        return reply;
      }

      const response = await dependencies.chatService.execute(body);
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
    logger.log("request.body", { url: request.url, body });
    try {
      const response = await dependencies.embeddingService.execute(body);
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
    logger.log("request.body", { url: request.url, body });
    try {
      if (body.stream) {
        await sendAnthropicStream(reply, request.url, logger, dependencies.anthropicMessagesService.stream(body));
        return reply;
      }

      const response = await dependencies.anthropicMessagesService.execute(body);
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
    logger.log("request.body", { url: request.url, body });
    try {
      if (body.stream) {
        await sendAnthropicStream(
          reply,
          request.url,
          logger,
          dependencies.anthropicCompletionsService.stream(body)
        );
        return reply;
      }

      const response = await dependencies.anthropicCompletionsService.execute(body);
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
    logger.log("request.body", { url: request.url, body });
    try {
      const response = await dependencies.tokenCountService.execute(body);
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
  return startServerWithDependencies(buildAppContainer(config, fetcher, logger));
}

export async function startServerWithDependencies(dependencies: ServerDependencies) {
  const app = createServerWithDependencies(dependencies);
  await app.listen({
    host: dependencies.config.daemon.host,
    port: dependencies.config.daemon.port
  });
  return app;
}

async function sendOpenAiStream(
  reply: FastifyReply,
  url: string,
  logger: DebugLogger,
  stream: AsyncGenerator<unknown>
) {
  let headersSent = false;

  try {
    const first = await stream.next();
    if (first.done) {
      reply.raw.writeHead(200, openAiSseHeaders());
      headersSent = true;
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return;
    }

    reply.raw.writeHead(200, openAiSseHeaders());
    headersSent = true;
    logger.log("response.stream.chunk", {
      url,
      chunk: first.value
    });
    reply.raw.write(`data: ${JSON.stringify(first.value)}\n\n`);

    for await (const chunk of stream) {
      logger.log("response.stream.chunk", {
        url,
        chunk
      });
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    reply.raw.write("data: [DONE]\n\n");
  } catch (error) {
    logger.log("response.error", {
      url,
      body: toOpenAiError(error).body
    });
    if (!headersSent) {
      throw error;
    }
  } finally {
    if (headersSent && !reply.raw.writableEnded) {
      reply.raw.end();
    }
  }
}

async function sendAnthropicStream(
  reply: FastifyReply,
  url: string,
  logger: DebugLogger,
  stream: AsyncGenerator<{ type: string }>
) {
  let headersSent = false;

  try {
    const first = await stream.next();
    if (first.done) {
      reply.raw.writeHead(200, anthropicSseHeaders());
      headersSent = true;
      reply.raw.end();
      return;
    }

    reply.raw.writeHead(200, anthropicSseHeaders());
    headersSent = true;
    logger.log("response.stream.chunk", {
      url,
      chunk: first.value
    });
    reply.raw.write(`event: ${first.value.type}\n`);
    reply.raw.write(`data: ${JSON.stringify(first.value)}\n\n`);

    for await (const event of stream) {
      logger.log("response.stream.chunk", {
        url,
        chunk: event
      });
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (error) {
    logger.log("response.error", {
      url,
      body: toAnthropicError(error).body
    });
    if (!headersSent) {
      throw error;
    }
  } finally {
    if (headersSent && !reply.raw.writableEnded) {
      reply.raw.end();
    }
  }
}

function normalizeHeader(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function openAiSseHeaders() {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive"
  };
}

function anthropicSseHeaders() {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive"
  };
}

function isAnthropicRequest(url: string) {
  const pathname = url.split("?", 1)[0];
  return pathname === "/v1/messages" || pathname === "/v1/complete" || pathname === "/v1/messages/count_tokens";
}
