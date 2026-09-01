import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { backendRequest, SESSION_COOKIE } from "@/lib/backend";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token)
    return NextResponse.json(
      { error: { message: "Sign in required." } },
      { status: 401 },
    );
  const { path } = await context.params;
  const query = new URL(request.url).search;
  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.text();
  const response = await backendRequest(
    `/admin/${path.map(encodeURIComponent).join("/")}${query}`,
    { method, body: body || undefined },
    token,
  );
  const payload = await response.json().catch(() => null);
  const result = NextResponse.json(payload, { status: response.status });
  if (response.status === 401) result.cookies.delete(SESSION_COOKIE);
  return result;
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
