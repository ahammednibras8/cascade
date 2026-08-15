import type { Request, Response } from "express";

export function getAuthOrRespond(request: Request, response: Response) {
  const auth = request.auth;

  if (!auth) {
    response.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing API authentication context",
      },
    });
    return undefined;
  }

  return auth;
}
