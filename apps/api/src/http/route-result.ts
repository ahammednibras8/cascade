import type { Request, RequestHandler, Response } from "express";
import type { ApiAuthContext } from "../auth/api-key.js";
import { getAuthOrRespond } from "../routes/route-auth.js";
import { asyncHandler } from "./async-handler.js";

export type AuthenticatedRouteInput = {
  auth: ApiAuthContext;
  request: Request;
  response: Response;
};

export type RouteErrorResult = {
  ok: false;
  status: number;
  error: unknown;
};

export type RouteSuccessResult = {
  ok: true;
  status: number;
};

export type RouteJsonResult<TSuccess extends RouteSuccessResult> = TSuccess | RouteErrorResult;

type WriteJsonResultOptions = {
  headers?: Record<string, string>;
};

export function authenticatedRoute(
  handler: (input: AuthenticatedRouteInput) => Promise<void>,
): RequestHandler {
  return asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    await handler({ auth, request, response });
  });
}

export function writeErrorResult(response: Response, result: RouteErrorResult) {
  response.status(result.status).json({
    error: result.error,
  });
}

export function writeJsonResult<TResult extends RouteJsonResult<RouteSuccessResult>>(
  response: Response,
  result: TResult,
  body: (result: Extract<TResult, { ok: true }>) => unknown,
  options: WriteJsonResultOptions = {},
) {
  if (!result.ok) {
    writeErrorResult(response, result);
    return;
  }

  const writer = response.status(result.status);

  for (const [name, value] of Object.entries(options.headers ?? {})) {
    writer.set(name, value);
  }

  writer.json(body(result as Extract<TResult, { ok: true }>));
}

export function writeEmptyResult(response: Response, result: RouteJsonResult<RouteSuccessResult>) {
  if (!result.ok) {
    writeErrorResult(response, result);
    return;
  }

  response.status(result.status).send();
}
