import type { ApiError } from "@aninir/lab-core";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** An error with a stable machine-readable code, rendered as `{ error: { code, message } }`. */
export class ApiFailure extends HTTPException {
  readonly code: string;
  readonly details: string[] | undefined;

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: string[]) {
    super(status, { message });
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string) => new ApiFailure(404, "not_found", `${what} not found`);
export const conflict = (message: string) => new ApiFailure(409, "conflict", message);
export const badRequest = (message: string, details?: string[]) =>
  new ApiFailure(400, "bad_request", message, details);

export function renderError(err: Error, c: Context): Response {
  if (err instanceof ApiFailure) {
    return c.json<ApiError>(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      err.status,
    );
  }
  if (err instanceof HTTPException) {
    return c.json<ApiError>({ error: { code: "http_error", message: err.message } }, err.status);
  }
  console.error(err);
  return c.json<ApiError>({ error: { code: "internal", message: "internal error" } }, 500);
}
