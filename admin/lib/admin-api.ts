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
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? "Operation failed.");
  return body.data as T;
}

export function json(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
): RequestInit {
  return { method, body: JSON.stringify(body) };
}
