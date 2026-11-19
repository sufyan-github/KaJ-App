/**
 * Security headers for the console (ADM-1). Pages get a per-request nonce CSP
 * from proxy.ts; everything gets the static headers from next.config.ts.
 */

export type Header = { key: string; value: string };

/** Origins documents are served from (signed storage URLs), space separated. */
export function storageOrigins(env: Record<string, string | undefined>) {
  const explicit = env.KAJ_STORAGE_ORIGINS?.trim();
  if (explicit) return explicit.split(/\s+/u).filter(validOrigin);
  // Local development: the API's S3 endpoint (MinIO), when it is known.
  try {
    return env.S3_ENDPOINT ? [new URL(env.S3_ENDPOINT).origin] : [];
  } catch {
    return [];
  }
}

function validOrigin(value: string) {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

/** The page CSP. `dev` adds 'unsafe-eval', which React needs in development. */
export function pageCsp(options: {
  nonce: string;
  dev: boolean;
  storage: readonly string[];
}): string {
  const storage = options.storage.join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${options.nonce}'`,
    `img-src 'self' blob: data: ${storage}`.trim(),
    "font-src 'self'",
    "connect-src 'self'",
    `frame-src ${storage || "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** API responses are JSON only: nothing may load or frame them. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

export function staticHeaders(production: boolean): Header[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Signed document URLs and session-bearing pages never leak in a Referer.
    { key: "Referrer-Policy", value: "no-referrer" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(production
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ]
      : []),
  ];
}
