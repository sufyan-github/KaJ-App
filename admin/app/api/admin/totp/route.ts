import { NextResponse } from "next/server";

import { backendRequest, SESSION_COOKIE } from "@/lib/backend";

export async function POST(request: Request) {
  const response = await backendRequest("/admin/auth/totp", {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
  const body = await response.json();
  if (!response.ok) return NextResponse.json(body, { status: response.status });

  const result = NextResponse.json({ data: body.data.user });
  result.cookies.set(SESSION_COOKIE, body.data.sessionToken, {
    httpOnly: true,
    maxAge: body.data.expiresIn,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return result;
}
