export class ProxyError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly retriable: boolean;
  public readonly type: string;

  constructor(
    message: string,
    options: {
      statusCode: number;
      code: string;
      retriable?: boolean;
      type?: string;
    }
  ) {
    super(message);
    this.name = "ProxyError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.retriable = options.retriable ?? false;
    this.type = options.type ?? "proxy_error";
  }
}

export function toOpenAiError(error: unknown) {
  if (error instanceof ProxyError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          message: error.message,
          type: error.type,
          code: error.code
        }
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        message: "Unexpected proxy error",
        type: "internal_server_error",
        code: "internal_error"
      }
    }
  };
}

export function toAnthropicError(error: unknown) {
  if (error instanceof ProxyError) {
    return {
      statusCode: error.statusCode,
      body: {
        type: "error",
        error: {
          type: error.type,
          message: error.message
        }
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      type: "error",
      error: {
        type: "internal_server_error",
        message: "Unexpected proxy error"
      }
    }
  };
}
