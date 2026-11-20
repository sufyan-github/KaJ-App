import { expect, Page, test } from "@playwright/test";

const envelope = (data: unknown) => ({
  data,
  meta: { requestId: "e2e", serverTime: new Date().toISOString() },
});

const staff = [
  {
    userId: "admin-1",
    email: "ops@kaj.test",
    name: "Ops Lead",
    role: "ADMIN",
    active: true,
    userStatus: "ACTIVE",
    createdAt: "2026-11-01T08:00:00.000Z",
    lastActiveAt: "2026-11-19T08:00:00.000Z",
  },
  {
    userId: "staff-2",
    email: "mod@kaj.test",
    name: "Moderator Two",
    role: "MODERATOR",
    active: true,
    userStatus: "ACTIVE",
    createdAt: "2026-11-02T08:00:00.000Z",
    lastActiveAt: null,
  },
];

async function open(page: Page) {
  await page.route("**/api/admin/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({ email: "ops@kaj.test", role: "ADMIN", userId: "admin-1" }),
      ),
    }),
  );
  await page.route("**/api/admin/ops/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({ counts: {}, stuckJobs: [] })),
    }),
  );
  await page.route("**/api/admin/ops/staff", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(envelope({ items: staff })),
        })
      : route.fallback(),
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Staff" })
    .click();
}

test("invites staff and shows the sign-in details once", async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/admin/ops/staff", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          staff: { userId: "staff-3", role: "SUPPORT", active: true },
          credentials: {
            temporaryPassword: "temp-password-123456",
            totpSecret: "ABCDEFGHIJKLMNOP",
            otpauthUri:
              "otpauth://totp/KAAJ:new@kaj.test?secret=ABCDEFGHIJKLMNOP",
          },
        }),
      ),
    });
  });
  await open(page);
  await page.getByRole("button", { name: "Invite staff" }).click();
  await page.getByLabel("Email address").fill("New@Kaj.test");
  await page.getByLabel("Name", { exact: true }).fill("New Support");
  await page
    .getByRole("dialog")
    .locator('select[name="role"]')
    .selectOption("SUPPORT");
  await page
    .getByLabel("Required operational reason")
    .fill("New support hire starting Monday.");
  await page
    .getByRole("button", { name: "Invite and show sign-in details" })
    .click();
  await expect
    .poll(() => body)
    .toMatchObject({
      email: "new@kaj.test",
      role: "SUPPORT",
      displayName: "New Support",
    });
  const dialog = page.getByRole("dialog", { name: "One-time sign-in details" });
  await expect(dialog).toContainText("temp-password-123456");
  await expect(dialog).toContainText("ABCDEFGHIJKLMNOP");
  await page.getByRole("button", { name: "I have handed these over" }).click();
  await expect(page.getByText("temp-password-123456")).toHaveCount(0);
});

test("deactivating needs a reason; own account has no actions", async ({
  page,
}) => {
  let body: Record<string, unknown> | null = null;
  await page.route(
    "**/api/admin/ops/staff/staff-2/deactivate",
    async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(envelope({ userId: "staff-2", active: false })),
      });
    },
  );
  await open(page);
  const own = page.getByRole("row", { name: /ops@kaj\.test/ });
  await expect(own.getByRole("button")).toHaveCount(0);
  await expect(own).toContainText("You");
  const other = page.getByRole("row", { name: /mod@kaj\.test/ });
  await other.getByRole("button", { name: "Deactivate" }).click();
  await page.getByLabel("Required operational reason").fill("Left the team.");
  await page.getByRole("button", { name: "Deactivate and sign out" }).click();
  await expect.poll(() => body).toMatchObject({ reason: "Left the team." });
});

test("changing a role asks for a reason before sending", async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/admin/ops/staff/staff-2/role", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({ userId: "staff-2", role: "SUPPORT" })),
    });
  });
  await open(page);
  await page.getByLabel("Role for mod@kaj.test").selectOption("SUPPORT");
  expect(body).toBeNull();
  await page
    .getByLabel("Required operational reason")
    .fill("Moved to the support desk.");
  await page.getByRole("button", { name: "Change role" }).click();
  await expect
    .poll(() => body)
    .toMatchObject({ role: "SUPPORT", reason: "Moved to the support desk." });
});
