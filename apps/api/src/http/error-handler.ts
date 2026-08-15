import type { ErrorRequestHandler } from "express";
import { ApiError } from "./api-error.js";

type BodyParserError = Error & {
  status?: number;
  type?: string;
};

function isBodyParserError(error: unknown): error is BodyParserError {
  return error instanceof Error;
}

function toApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  if (isBodyParserError(error) && error.type === "entity.parse.failed") {
    return new ApiError({
      status: 400,
      code: "INVALID_JSON",
      message: "Request body must be valid JSON",
    });
  }

  if (isBodyParserError(error) && error.type === "entity.too.large") {
    return new ApiError({
      status: 413,
      code: "REQUEST_BODY_TOO_LARGE",
      message: "Request body is too large",
    });
  }

  return new ApiError({
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
  });
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const apiError = toApiError(error);

  if (apiError.status >= 500) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  }

  response
    .set("Cache-Control", "no-store")
    .status(apiError.status)
    .json({
      error: {
        code: apiError.code,
        message: apiError.message,
      },
    });
};
