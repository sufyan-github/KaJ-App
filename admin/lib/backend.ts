import { NextResponse } from "next/server";

export const SESSION_COOKIE = "kaj_admin_session";
const API_URL = process.env.KAJ_API_URL ?? "http://127.0.0.1:3100";

export async function backendRequest(
  path: string,
  init: RequestInit = {},
  token?: string,
  client?: Request,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (client) {
    // Without these the API's audit log and login limits saw this server,
    // not the operator. The API trusts them only up to TRUST_PROXY_HOPS.
    const forwardedFor = client.headers.get("x-forwarded-for");
    if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
    const userAgent = client.headers.get("user-agent");
    if (userAgent) headers.set("user-agent", userAgent);
  }
  return fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });
}

export async function proxyJson(response: Response): Promise<NextResponse> {
  const body = await response.json().catch(() => ({
    error: { message: "The admin service returned an invalid response." },
  }));
  return NextResponse.json(body, { status: response.status });
}
