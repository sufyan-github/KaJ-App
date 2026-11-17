import { expect, Page, test } from "@playwright/test";

const envelope = (data: unknown) => ({
  data,
  meta: { requestId: "e2e", serverTime: new Date().toISOString() },
});

async function respond(page: Page, path: string, data: unknown) {
  await page.route(`**/api/admin/ops/${path}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(data)),
    }),
  );
}

/** Records the JSON body of the write request to `path`. */
async function capture(page: Page, path: string, data: unknown = {}) {
  const seen: { body: Record<string, unknown> | null } = { body: null };
  await page.route(`**/api/admin/ops/${path}`, async (route) => {
    // Only writes: a list reload (GET) on the same path must not erase it.
    if (route.request().method() !== "GET")
      seen.body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(data)),
    });
  });
  return seen;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/admin/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({ email: "ops@kaj.test", role: "ADMIN", userId: "admin-1" }),
      ),
    }),
  );
  await respond(page, "dashboard", { counts: {}, stuckJobs: [] });
});

async function openModule(page: Page, name: RegExp) {
  await page.goto("/");
  await page.getByRole("button", { name }).first().click();
}

test("verifies a registered business, showing its licence", async ({
  page,
}) => {
  await respond(page, "verification-requests?kind=BUSINESS&limit=100", {
    items: [
      {
        id: "request-b1",
        kind: "BUSINESS",
        status: "PENDING",
        user: { name: "Monira Sultana", trustLevel: "IDENTITY" },
        documents: [],
        business: {
          id: "business-1",
          name: "Padma Agro Traders",
          stage: "REGISTERED",
          tradeLicenceNo: "RAJ-2026-04567",
          address: null,
        },
      },
    ],
  });
  const decision = await capture(
    page,
    "verification-requests/request-b1/decision",
  );
  await openModule(page, /^\d+ Business$/);
  const row = page.getByRole("row", { name: /Monira Sultana/ });
  await expect(row).toContainText("Padma Agro Traders");
  await expect(row).toContainText("RAJ-2026-04567");
  await row.getByRole("button", { name: "Approve" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Trade licence matches the city corporation register.");
  await page.getByRole("button", { name: "Confirm Approved" }).click();
  await expect.poll(() => decision.body).toMatchObject({ status: "APPROVED" });
});

test("adds a sub-sector to the taxonomy", async ({ page }) => {
  await respond(page, "business-categories", {
    items: [
      {
        id: "sector-1",
        parentId: null,
        slug: "agriculture",
        nameEn: "Agriculture and farming",
        nameBn: "কৃষি ও খামার",
        icon: "agriculture",
        sortOrder: 0,
        isActive: true,
      },
    ],
  });
  await openModule(page, /^\d+ Business$/);
  await page.getByRole("tab", { name: "Sectors" }).click();
  await expect(
    page.getByRole("row", { name: /Agriculture and farming/ }),
  ).toContainText("agriculture");
  const created = await capture(page, "business-categories", { id: "x" });
  await page.getByRole("button", { name: "Add sector" }).click();
  await page.getByLabel("Slug").fill("fisheries");
  await page.getByLabel("Name (English)").fill("Fisheries");
  await page.getByLabel("Name (Bangla)").fill("মৎস্য");
  await page.getByLabel("Parent sector").selectOption("sector-1");
  await page.getByRole("button", { name: "Save sector" }).click();
  await expect
    .poll(() => created.body)
    .toMatchObject({
      slug: "fisheries",
      nameEn: "Fisheries",
      nameBn: "মৎস্য",
      parentId: "sector-1",
      isActive: true,
    });
});

test("hides a reported idea without touching the account, and restores it", async ({
  page,
}) => {
  await respond(page, "reports?limit=100", {
    total: 2,
    items: [
      {
        id: "report-1",
        targetType: "IDEA",
        targetId: "idea-1",
        content: { title: "Investment club", status: "VISIBLE" },
        reasonCode: "SCAM",
        description: "Promises to double money monthly.",
        status: "UNDER_REVIEW",
        createdAt: new Date().toISOString(),
        reporter: { id: "user-2", name: "Reporter" },
        subject: {
          id: "user-1",
          name: "Owner",
          status: "ACTIVE",
          moderationLevel: "NONE",
          reverificationRequired: false,
        },
      },
      {
        id: "report-2",
        targetType: "BUSINESS",
        targetId: "business-9",
        content: { title: "Too Good Traders", status: "HIDDEN" },
        reasonCode: "SCAM",
        description: "Already handled.",
        status: "ACTIONED",
        createdAt: new Date().toISOString(),
        reporter: { id: "user-2", name: "Reporter" },
        subject: null,
      },
    ],
  });
  const decision = await capture(page, "reports/report-1/decision");
  const restore = await capture(page, "content/BUSINESS/business-9/restore");
  await openModule(page, /^\d+ Safety reports$/);
  const ideaRow = page.getByRole("row", { name: /Promises to double/ });
  await expect(ideaRow).toContainText("Investment club");
  await ideaRow.getByRole("button", { name: "Decide" }).click();
  await expect(page.getByLabel("Hide the reported content")).toBeChecked();
  await expect(
    page.getByLabel("Also apply a moderation step to the person"),
  ).not.toBeChecked();
  await page
    .getByLabel("Required decision reason")
    .fill("Advance-fee scam pattern confirmed.");
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect
    .poll(() => decision.body)
    .toEqual({
      status: "ACTIONED",
      reason: "Advance-fee scam pattern confirmed.",
      hideContent: true,
    });

  const hiddenRow = page.getByRole("row", { name: /Already handled/ });
  await hiddenRow.getByRole("button", { name: "Restore content" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Owner corrected the listing.");
  await page.getByRole("button", { name: "Restore content" }).last().click();
  await expect
    .poll(() => restore.body)
    .toEqual({ reason: "Owner corrected the listing." });
});

test("shows the priority safety queue with time to first action", async ({
  page,
}) => {
  const created = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const item = (id: string, extra: object) => ({
    id,
    targetType: "USER",
    targetId: `user-${id}`,
    content: null,
    reasonCode: "SEXUAL_HARASSMENT",
    description: `Report ${id}`,
    status: "OPEN",
    createdAt: created,
    reporter: { id: "reporter", name: "Reporter" },
    subject: null,
    priority: 2,
    ageMinutes: 120,
    firstActionDueAt: new Date(Date.now() - 3_600_000).toISOString(),
    firstActionAt: null,
    timeToFirstActionMinutes: null,
    overdue: true,
    ...extra,
  });
  await respond(page, "reports?limit=100", {
    total: 1,
    items: [
      item("all-1", { priority: 0, reasonCode: "OTHER", overdue: false }),
    ],
  });
  await respond(page, "reports?limit=100&minPriority=1", {
    total: 1,
    items: [item("urgent-1", {})],
  });
  await openModule(page, /^\d+ Safety reports$/);
  await expect(page.getByRole("row", { name: /Report all-1/ })).toBeVisible();
  await page.getByLabel("Priority safety queue only").check();
  const row = page.getByRole("row", { name: /Report urgent-1/ });
  await expect(row).toContainText(/urgent/i);
  await expect(row).toContainText("Waiting 2 h");
  await expect(row).toContainText("Overdue");
});

test("community admin: hides a group, shows sessions, removes an ambassador", async ({
  page,
}) => {
  await respond(page, "community/groups?limit=100", {
    items: [
      {
        id: "group-1",
        name: "Boalia electricians",
        visibility: "PUBLIC",
        womenOnly: false,
        memberCount: 42,
        moderators: [{ userId: "u1", name: "Rehana Parvin" }],
        ambassadors: [{ userId: "u2", name: "Tuhin Ahmed" }],
        openReports: 2,
        status: "ACTIVE",
        hiddenReason: null,
      },
    ],
  });
  await respond(page, "sessions?limit=100", {
    items: [
      {
        id: "session-1",
        kind: "EVENT",
        title: "Tailors' meetup",
        status: "SCHEDULED",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        mode: "IN_PERSON",
        capacity: 20,
        accepted: 20,
        waitlisted: 3,
        attended: 0,
        womenOnly: false,
        host: { userId: "u1", name: "Rehana Parvin" },
        group: { id: "group-1", name: "Boalia electricians" },
        openReports: 0,
        visibility: "VISIBLE",
        hiddenReason: null,
      },
    ],
  });
  await respond(page, "community/ambassadors", {
    items: [
      {
        userId: "u2",
        name: "Tuhin Ahmed",
        groups: [{ id: "group-1", name: "Boalia electricians", hidden: false }],
      },
    ],
  });
  const hide = await capture(page, "content/GROUP/group-1/hide");
  const role = await capture(page, "community/groups/group-1/members/u2/role");
  await openModule(page, /^\d+ Community$/);
  const row = page.getByRole("row", { name: /Boalia electricians/ });
  await expect(row).toContainText("Rehana Parvin");
  await expect(row).toContainText("Tuhin Ahmed");
  await row.getByRole("button", { name: "Hide content" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Fee collection outside KAAJ.");
  await page.getByRole("button", { name: "Hide content" }).last().click();
  await expect
    .poll(() => hide.body)
    .toEqual({ reason: "Fee collection outside KAAJ." });

  await page.getByRole("tab", { name: "Sessions and events" }).click();
  const session = page.getByRole("row", { name: /Tailors' meetup/ });
  await expect(session).toContainText("20/20");
  await expect(session).toContainText("Waitlist: 3");

  await page.getByRole("tab", { name: "Ambassadors" }).click();
  await page.getByRole("button", { name: "Remove ambassador role" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Stepped down from organising.");
  await page
    .getByRole("button", { name: "Remove ambassador role" })
    .last()
    .click();
  await expect
    .poll(() => role.body)
    .toEqual({ role: "MEMBER", reason: "Stepped down from organising." });
});
