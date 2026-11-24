/** An API refusal with the envelope's code and details kept for the UI. */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: Array<{ field?: string; rules?: string[] }>;
  readonly field: string | null;

  constructor(
    message: string,
    status: number,
    code: string | null,
    details: Array<{ field?: string; rules?: string[] }>,
    field: string | null,
  ) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.field = field;
  }
}

export async function adminApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/admin/ops/${path}`, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error ?? {};
    throw new AdminApiError(
      typeof error.message === "string" ? error.message : "Operation failed.",
      response.status,
      typeof error.code === "string" ? error.code : null,
      Array.isArray(error.details) ? error.details : [],
      typeof error.field === "string" ? error.field : null,
    );
  }
  return body.data as T;
}

export function json(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
): RequestInit {
  return { method, body: JSON.stringify(body) };
}
