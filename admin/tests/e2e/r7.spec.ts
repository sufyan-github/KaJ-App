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

async function open(page: Page, module: string) {
  await page.route("**/api/admin/session", (route) =>
    route.fulfill(ok({ email: "ops@kaj.test", role: "ADMIN", userId: "a" })),
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

test("a category safety toggle asks for a reason and sends it", async ({
  page,
}) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/admin/ops/categories", (route) =>
    route.fulfill(
      ok({
        items: [
          {
            id: "cat-1",
            slug: "electrical",
            nameEn: "Electrical",
            nameBn: "বৈদ্যুতিক",
            sortOrder: 0,
            isActive: true,
            requiresManualApproval: false,
            minAge: 18,
            requiresCertificate: false,
            requiresIdentity: false,
            requiresPosterIdentity: false,
            requiresReferences: 0,
            requiresLicence: false,
            unsafeForStudents: false,
          },
        ],
      }),
    ),
  );
  await page.route("**/api/admin/ops/categories/cat-1", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill(ok({ id: "cat-1" }));
  });
  await open(page, "Categories");
  await page.getByRole("button", { name: "Manual approval" }).click();
  expect(body).toBeNull();
  await page
    .getByLabel("Required operational reason")
    .fill("Electrical work needs a manual check.");
  await page.getByRole("button", { name: "Save change" }).click();
  await expect
    .poll(() => body)
    .toMatchObject({
      requiresManualApproval: true,
      reason: "Electrical work needs a manual check.",
    });
});

test("a new location sends coordinates and a reason, and shows the API's refusal", async ({
  page,
}) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/admin/ops/locations", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill(
        ok({
          items: [
            {
              id: "thana-1",
              type: "THANA",
              nameEn: "Boalia",
              nameBn: "বোয়ালিয়া",
              isActive: true,
            },
          ],
        }),
      );
    body = route.request().postDataJSON();
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "LOCATION_INVALID",
          field: "lat",
          message: "The coordinates are outside Bangladesh.",
        },
      }),
    });
  });
  await open(page, "Locations");
  await page.getByRole("button", { name: "Add location" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('select[name="type"]').selectOption("AREA");
  await dialog.locator('select[name="parentId"]').selectOption("thana-1");
  await dialog.getByLabel("English name").fill("Shaheb Bazar");
  await dialog.getByLabel("Bangla name").fill("সাহেব বাজার");
  await dialog.getByLabel("Latitude (optional)").fill("24.37");
  await dialog.getByLabel("Longitude (optional)").fill("88.6");
  await dialog
    .getByLabel("Required operational reason")
    .fill("New pilot area in Rajshahi.");
  await dialog.getByRole("button", { name: "Create location" }).click();
  await expect
    .poll(() => body)
    .toMatchObject({
      type: "AREA",
      parentId: "thana-1",
      lat: 24.37,
      lng: 88.6,
      reason: "New pilot area in Rajshahi.",
    });
  await expect(dialog.getByRole("alert")).toContainText("outside Bangladesh");
});

test("subscribers can be found by phone", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/api/admin/ops/subscriptions/overview", (route) =>
    route.fulfill(
      ok({
        subscriptions: {},
        payments: {},
        operators: {},
        plans: [],
        accessRules: [],
      }),
    ),
  );
  await page.route("**/api/admin/ops/subscriptions?*", (route) => {
    requested.push(new URL(route.request().url()).search);
    return route.fulfill(ok({ items: [], nextCursor: null }));
  });
  await open(page, "Subscriptions");
  await page.getByRole("searchbox").fill("01612348080");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => requested.at(-1)).toContain("search=01612348080");
});
