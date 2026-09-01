import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { backendRequest, SESSION_COOKIE } from "@/lib/backend";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token)
    return NextResponse.json(
      { error: { message: "Sign in required." } },
      { status: 401 },
    );
  const response = await backendRequest("/admin/auth/session", {}, token);
  const body = await response.json();
  const result = NextResponse.json(body, { status: response.status });
  if (!response.ok) result.cookies.delete(SESSION_COOKIE);
  return result;
}
