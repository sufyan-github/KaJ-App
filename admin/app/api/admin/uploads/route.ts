import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/backend";
import { storageOrigins } from "@/lib/security-headers.ts";
import { STEP_IMAGE_MAX_BYTES, STEP_IMAGE_TYPES } from "@/lib/step-image.ts";

/** Headers a signed upload may require; anything else is dropped. */
const FORWARDED =
  /^(content-type|content-length|cache-control|x-amz-[a-z0-9-]+)$/u;

const refuse = (status: number, message: string) =>
  NextResponse.json({ error: { message } }, { status });

/**
 * Relays a step picture to the signed storage URL from
 * POST /admin/training/step-images/sign. The browser cannot PUT to storage
 * itself: the console's CSP allows connect-src 'self' only and the bucket
 * need not allow this origin. The URL must point at a configured storage
 * origin (KAJ_STORAGE_ORIGINS, or the local S3_ENDPOINT), so this is not a
 * general proxy; the API checks the stored bytes on "complete".
 */
export async function POST(request: Request) {
  if (!(await cookies()).get(SESSION_COOKIE)?.value)
    return refuse(401, "Sign in required.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return refuse(403, "Cross-site upload refused.");

  let target: URL;
  try {
    target = new URL(request.headers.get("x-kaj-upload-url") ?? "");
  } catch {
    return refuse(400, "Missing upload URL.");
  }
  if (!storageOrigins(process.env).includes(target.origin))
    return refuse(400, "The upload URL is not the configured storage.");

  const contentType = request.headers.get("content-type") ?? "";
  if (!STEP_IMAGE_TYPES.includes(contentType))
    return refuse(400, "Use a JPEG, PNG or WebP picture.");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > STEP_IMAGE_MAX_BYTES)
    return refuse(413, "The picture must be at most 300 KB.");

  const headers = new Headers();
  try {
    const required = JSON.parse(
      request.headers.get("x-kaj-upload-headers") ?? "{}",
    ) as Record<string, unknown>;
    for (const [name, value] of Object.entries(required))
      if (FORWARDED.test(name.toLowerCase()) && typeof value === "string")
        headers.set(name, value);
  } catch {
    return refuse(400, "Invalid upload headers.");
  }
  if (!headers.has("content-type")) headers.set("content-type", contentType);

  const stored = await fetch(target, {
    method: "PUT",
    body,
    headers,
    cache: "no-store",
    redirect: "error",
  }).catch(() => null);
  if (!stored?.ok)
    return refuse(502, "Storage refused the picture. Try again.");
  return NextResponse.json({ data: { uploaded: true } });
}
