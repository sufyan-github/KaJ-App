import { expect, Page, test } from "@playwright/test";

const envelope = (data: unknown) => ({
  data,
  meta: { requestId: "e2e", serverTime: new Date().toISOString() },
});

async function signInAs(page: Page, role: string) {
  await page.route("**/api/admin/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          email: `${role.toLowerCase()}@kaj.test`,
          role,
          userId: "a",
        }),
      ),
    }),
  );
  // Any list a view asks for comes back empty.
  await page.route("**/api/admin/ops/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({ items: [], total: 0, nextCursor: null, counts: {} }),
      ),
    }),
  );
  await page.goto("/");
}

const nav = (page: Page) => page.getByRole("navigation");

test("FINANCE sees money modules and no safety queues", async ({ page }) => {
  await signInAs(page, "FINANCE");
  await expect(
    nav(page).getByRole("button", { name: "Configuration" }),
  ).toBeVisible();
  await expect(
    nav(page).getByRole("button", { name: "Subscriptions" }),
  ).toBeVisible();
  for (const hidden of [
    "Safety reports",
    "Risk review",
    "Verification",
    "Learn",
    "Community",
    "Notifications",
  ])
    await expect(nav(page).getByRole("button", { name: hidden })).toHaveCount(
      0,
    );
});

test("MODERATOR moderates users but cannot reset sessions", async ({
  page,
}) => {
  await signInAs(page, "MODERATOR");
  await page.route("**/api/admin/ops/users?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          total: 1,
          nextCursor: null,
          items: [
            {
              id: "user-1",
              name: "Worker One",
              phone: "+8801700000000",
              email: null,
              roles: ["WORKER"],
              trustLevel: "PHONE",
              status: "ACTIVE",
              moderationLevel: "NONE",
              reverificationRequired: false,
            },
          ],
        }),
      ),
    }),
  );
  await expect(
    nav(page).getByRole("button", { name: "Configuration" }),
  ).toHaveCount(0);
  await nav(page).getByRole("button", { name: "Users" }).click();
  await expect(page.getByRole("button", { name: "Next: Warn" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reset sessions" }),
  ).toHaveCount(0);
});

test("SUPPORT can dry-run a campaign but has no send button", async ({
  page,
}) => {
  await signInAs(page, "SUPPORT");
  await page.route("**/api/admin/ops/notifications/campaign/dry-run", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({ audienceCount: 3, preview: { title: "T", body: "B" } }),
      ),
    }),
  );
  await nav(page).getByRole("button", { name: "Notifications" }).click();
  await page.getByRole("button", { name: "Run dry-run" }).click();
  await expect(page.getByText("3 recipients match this segment")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send campaign" })).toHaveCount(
    0,
  );
});

test("Learn shows only the tabs the role can open", async ({ page }) => {
  await signInAs(page, "MODERATOR");
  await nav(page).getByRole("button", { name: "Learn" }).click();
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "New course" })).toHaveCount(0);
});
