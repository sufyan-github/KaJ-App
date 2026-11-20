import { expect, Page, test } from "@playwright/test";

const envelope = (data: unknown) => ({
  data,
  meta: { requestId: "e2e", serverTime: new Date().toISOString() },
});

const usage = {
  window: { days: 14, since: "2026-11-06T18:00:00.000Z" },
  settings: {
    enabled: true,
    model: "claude-sonnet-5-5",
    globalDailyLimit: 2000,
    globalUsedToday: 500,
    resetsAt: "2026-11-20T18:00:00.000Z",
    perUserDailyLimits: {
      IDEA_ANALYSIS: 3,
      OPPORTUNITY_SUGGESTIONS: 10,
      BUSINESS_GROWTH_TIPS: 5,
    },
  },
  totals: {
    calls: 3,
    costUsdMicros: 12000,
    refused: 1,
    invalidOutput: 0,
    errors: 0,
    modelFallbacks: 1,
  },
  daily: [
    {
      day: "2026-11-20",
      feature: "IDEA_ANALYSIS",
      calls: 2,
      costUsdMicros: 8000,
      inputTokens: 2000,
      outputTokens: 400,
      refused: 1,
      invalidOutput: 0,
      errors: 0,
      modelFallbacks: 1,
    },
    {
      day: "2026-11-20",
      feature: "BUSINESS_GROWTH_TIPS",
      calls: 1,
      costUsdMicros: 4000,
      inputTokens: 1000,
      outputTokens: 200,
      refused: 0,
      invalidOutput: 0,
      errors: 0,
      modelFallbacks: 0,
    },
  ],
  topUsers: [
    {
      userId: "u-1",
      name: "Heavy user",
      calls: 3,
      costUsdMicros: 12000,
      refused: 1,
    },
  ],
};

async function signIn(page: Page, role: string) {
  await page.route("**/api/admin/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({ email: "ops@kaj.test", role, userId: "admin-1" }),
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
  await page.goto("/");
}

test("ADMIN sees AI calls, cost, outcomes and the global cap", async ({
  page,
}) => {
  const requested: string[] = [];
  await page.route("**/api/admin/ops/ai/usage?*", (route) => {
    requested.push(new URL(route.request().url()).search);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(usage)),
    });
  });
  await signIn(page, "ADMIN");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "AI usage" })
    .click();
  await expect(page.getByText("500 / 2,000")).toBeVisible();
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuenow", "25");
  await expect(
    page.getByRole("cell", { name: "Heavy user u-1" }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /2026-11-20/ })).toContainText(
    "1 / 0 / 0",
  );
  await expect(page.getByText("Fallback model answered")).toBeVisible();
  expect(requested[0]).toBe("?days=14");
  await page.getByLabel("Period").selectOption("30");
  await expect.poll(() => requested.at(-1)).toBe("?days=30");
});

test("other roles do not see AI usage", async ({ page }) => {
  await signIn(page, "MODERATOR");
  await expect(page.getByRole("button", { name: "AI usage" })).toHaveCount(0);
});
