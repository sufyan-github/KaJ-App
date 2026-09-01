import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { backendRequest, SESSION_COOKIE } from "@/lib/backend";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token)
    await backendRequest("/admin/auth/logout", { method: "POST" }, token);
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
