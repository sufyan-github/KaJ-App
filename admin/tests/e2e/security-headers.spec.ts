import { expect, test } from "@playwright/test";

test("the console sends security headers and runs under its CSP", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/iu.test(message.text()))
      violations.push(message.text());
  });
  page.on("pageerror", (error) => violations.push(error.message));
  await page.route("**/api/admin/session", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  const response = await page.goto("/");
  const headers = response!.headers();
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/u);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  // `next start` runs in production mode.
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-powered-by"]).toBeUndefined();
  // The sign-in form rendered, i.e. scripts and styles ran with the nonce.
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue securely" }),
  ).toBeEnabled();
  expect(violations).toEqual([]);

  // A fresh nonce on every request.
  const again = await page.request.get("/");
  expect(again.headers()["content-security-policy"]).not.toBe(csp);

  const api = await page.request.get("/api/admin/session");
  expect(api.headers()["content-security-policy"]).toBe(
    "default-src 'none'; frame-ancestors 'none'",
  );
});
