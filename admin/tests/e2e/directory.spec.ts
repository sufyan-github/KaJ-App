import { expect, Page, test } from "@playwright/test";

const envelope = (data: unknown) => ({
  data,
  meta: { requestId: "e2e", serverTime: new Date().toISOString() },
});
const ok = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(envelope(data)),
});

async function open(page: Page, module: string, role = "ADMIN") {
  await page.route("**/api/admin/session", (route) =>
    route.fulfill(ok({ email: "ops@kaj.test", role, userId: "admin-1" })),
  );
  await page.route("**/api/admin/ops/dashboard", (route) =>
    route.fulfill(ok({ counts: {}, stuckJobs: [] })),
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: module })
    .click();
}

test("skills: lists by category and adds a skill", async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  await page.route("**/api/admin/ops/categories", (route) =>
    route.fulfill(
      ok({ items: [{ id: "cat-1", nameEn: "Cleaning", nameBn: "পরিষ্কার" }] }),
    ),
  );
  await page.route("**/api/admin/ops/skills", async (route) => {
    if (route.request().method() === "POST") {
      created = route.request().postDataJSON();
      return route.fulfill(ok({ id: "skill-2" }, 201));
    }
    return route.fulfill(
      ok({
        items: [
          {
            id: "skill-1",
            categoryId: "cat-1",
            slug: "deep-clean",
            nameEn: "Deep clean",
            nameBn: "গভীর পরিষ্কার",
            isActive: true,
          },
        ],
      }),
    );
  });
  await open(page, "Skills");
  await expect(page.getByRole("cell", { name: /Deep clean/ })).toBeVisible();
  await page.getByRole("button", { name: "Add skill" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('select[name="categoryId"]').selectOption("cat-1");
  await dialog.getByLabel("Slug").fill("window-clean");
  await dialog.getByLabel("English name").fill("Window cleaning");
  await dialog.getByLabel("Bangla name").fill("জানালা পরিষ্কার");
  await dialog.getByRole("button", { name: "Save skill" }).click();
  await expect
    .poll(() => created)
    .toMatchObject({
      categoryId: "cat-1",
      slug: "window-clean",
      isActive: true,
    });
});

test("attendance: a check-in override needs a reason and an idempotency key", async ({
  page,
}) => {
  let sent: { body: unknown; key: string | undefined } | null = null;
  await page.route("**/api/admin/ops/attendance?*", (route) =>
    route.fulfill(
      ok({
        nextCursor: null,
        items: [
          {
            id: "asg-1",
            job: { id: "job-1", title: "Fix the gate", status: "CONFIRMED" },
            worker: { userId: "w-1", name: "Karim" },
            startsAt: new Date(Date.now() - 600_000).toISOString(),
            endsAt: new Date(Date.now() + 3_000_000).toISOString(),
            checkinAt: null,
            checkoutAt: null,
            overriddenAt: null,
            overrideReason: null,
          },
        ],
      }),
    ),
  );
  await page.route(
    "**/api/admin/ops/assignments/asg-1/checkin-override",
    async (route) => {
      sent = {
        body: route.request().postDataJSON(),
        key: route.request().headers()["idempotency-key"],
      };
      await route.fulfill(ok({ id: "asg-1" }, 201));
    },
  );
  await open(page, "Attendance");
  await page.getByRole("button", { name: "Record check-in" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("No GPS signal at the site gate.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record check-in" })
    .click();
  await expect
    .poll(() => sent?.body)
    .toMatchObject({
      reason: "No GPS signal at the site gate.",
    });
  expect(sent!.key).toMatch(/^[0-9a-f-]{36}$/u);
});

test("businesses: search, load more and hide with a reason", async ({
  page,
}) => {
  const requested: string[] = [];
  let hidden: unknown = null;
  const business = (id: string, name: string) => ({
    id,
    name,
    owner: { userId: "u", name: "Owner" },
    stage: "INFORMAL",
    verificationStatus: "APPROVED",
    isPublic: true,
    location: null,
    offerings: 2,
    hidden: false,
    hiddenReason: null,
    createdAt: new Date().toISOString(),
  });
  await page.route("**/api/admin/ops/businesses?*", (route) => {
    const url = new URL(route.request().url());
    requested.push(url.search);
    return route.fulfill(
      ok(
        url.searchParams.get("cursor")
          ? { items: [business("b-2", "Second shop")], nextCursor: null }
          : { items: [business("b-1", "First shop")], nextCursor: "b-1" },
      ),
    );
  });
  await page.route(
    "**/api/admin/ops/content/BUSINESS/b-1/hide",
    async (route) => {
      hidden = route.request().postDataJSON();
      await route.fulfill(ok({}, 201));
    },
  );
  await open(page, "Business");
  await page.getByRole("tab", { name: "Businesses" }).click();
  await expect(page.getByText("First shop")).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Second shop")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await page.getByRole("searchbox").fill("tailor");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => requested.at(-1)).toContain("search=tailor");
  await page.getByRole("button", { name: "Hide content" }).first().click();
  await page
    .getByLabel("Required operational reason")
    .fill("Fake licence number.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hide content" })
    .click();
  await expect
    .poll(() => hidden)
    .toMatchObject({ reason: "Fake licence number." });
});

test("mentors: a mentor without opportunities can be suspended", async ({
  page,
}) => {
  let suspended: unknown = null;
  await page.route("**/api/admin/ops/mentors?*", (route) =>
    route.fulfill(
      ok({
        nextCursor: null,
        items: [
          {
            id: "p-1",
            userId: "m-1",
            name: "Rahima",
            status: "APPROVED",
            accepting: true,
            yearsExperience: 4,
            appliedAt: null,
            approvedAt: new Date().toISOString(),
            opportunities: 0,
          },
        ],
      }),
    ),
  );
  await page.route("**/api/admin/ops/mentors/m-1/suspend", async (route) => {
    suspended = route.request().postDataJSON();
    await route.fulfill(ok({}, 201));
  });
  await page.route("**/api/admin/ops/verification-requests?*", (route) =>
    route.fulfill(ok({ items: [], nextCursor: null })),
  );
  await open(page, "Learn");
  await page.getByRole("tab", { name: "Mentors" }).click();
  await page.getByRole("button", { name: "Suspend mentor" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Complaints from learners.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Suspend mentor" })
    .click();
  await expect
    .poll(() => suspended)
    .toMatchObject({
      reason: "Complaints from learners.",
    });
});

test("ideas and introductions: hidden from SUPPORT", async ({ page }) => {
  await page.route("**/api/admin/ops/**", (route) =>
    route.fulfill(ok({ items: [], nextCursor: null, counts: {} })),
  );
  await open(page, "Dashboard", "SUPPORT");
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Ideas and introductions" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation").getByRole("button", { name: "Attendance" }),
  ).toBeVisible();
});
