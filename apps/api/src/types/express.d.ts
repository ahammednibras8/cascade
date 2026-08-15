import type { ApiAuthContext } from "../auth/api-key.js";

declare global {
  namespace Express {
    interface Request {
      auth?: ApiAuthContext;
    }
  }
}
