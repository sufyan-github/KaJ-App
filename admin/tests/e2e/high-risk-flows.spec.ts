import { expect, Page, test } from "@playwright/test";

const envelope = (data: unknown) => ({
  data,
  meta: { requestId: "e2e", serverTime: new Date().toISOString() },
});

async function fulfill(page: Page, path: string, data: unknown) {
  await page.route(`**/api/admin/ops/${path}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(data)),
    }),
  );
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
  await fulfill(page, "dashboard", {
    counts: { users: 4, jobs: 3, stuckJobs: 1 },
    stuckJobs: [],
  });
});

test("progressive moderation requires a reason and submits only the next step", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | null = null;
  await fulfill(page, "users?limit=100", {
    total: 1,
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
  });
  await page.route(
    "**/api/admin/ops/users/user-1/moderation",
    async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({ id: "user-1", moderationLevel: "WARN" }),
        ),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Users" }).click();
  await page.getByRole("button", { name: "Next: Warn" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Repeated marketplace safety violation.");
  await page.getByRole("button", { name: "Confirm Warn" }).click();
  await expect
    .poll(() => requestBody)
    .toMatchObject({
      action: "WARN",
      reason: "Repeated marketplace safety violation.",
    });
});

test("force-transition a stuck job requires target and reason", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | null = null;
  await fulfill(page, "jobs?limit=100", {
    total: 1,
    items: [
      {
        id: "job-1",
        title: "Stuck plumbing job",
        status: "CONFIRMATION_PENDING",
        isFeatured: false,
        poster: { name: "Customer" },
        applicationsCount: 2,
        assignmentsCount: 1,
      },
    ],
  });
  await page.route(
    "**/api/admin/ops/jobs/job-1/force-transition",
    async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({ id: "job-1", status: "APPLICATIONS_OPEN" }),
        ),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Jobs" }).click();
  await page.getByRole("button", { name: "Force transition" }).click();
  await page.getByLabel("Target status").selectOption("APPLICATIONS_OPEN");
  await page
    .getByLabel("Required operational reason")
    .fill("Selected worker confirmation window expired.");
  await page.getByRole("button", { name: "Apply forced transition" }).click();
  await expect
    .poll(() => requestBody)
    .toMatchObject({ toStatus: "APPLICATIONS_OPEN" });
});

test("safety report resolution enforces the next human moderation step", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | null = null;
  await fulfill(page, "reports?limit=100", {
    total: 1,
    items: [
      {
        id: "report-1",
        targetType: "USER",
        targetId: "user-1",
        reasonCode: "HARASSMENT",
        description: "Repeated abusive messages in a job conversation.",
        status: "UNDER_REVIEW",
        createdAt: new Date().toISOString(),
        reporter: { id: "reporter-1", name: "Reporter" },
        subject: {
          id: "user-1",
          name: "Reported worker",
          status: "ACTIVE",
          moderationLevel: "NONE",
          reverificationRequired: false,
        },
      },
    ],
  });
  await page.route(
    "**/api/admin/ops/reports/report-1/decision",
    async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({ id: "user-1", moderationLevel: "WARN" }),
        ),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Safety reports" }).click();
  await page.getByRole("button", { name: "Decide" }).click();
  await page
    .getByLabel("Required decision reason")
    .fill("Evidence supports a formal first warning.");
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect
    .poll(() => requestBody)
    .toMatchObject({
      status: "ACTIONED",
      action: "WARN",
    });
});

test("approve verification records an explicit decision reason", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | null = null;
  await fulfill(page, "verification-requests?limit=100", {
    items: [
      {
        id: "verification-1",
        kind: "IDENTITY",
        status: "PENDING",
        user: { name: "Worker One", trustLevel: "PHONE" },
        documents: [{ id: "document-1", kind: "IDENTITY", mime: "image/webp" }],
      },
    ],
  });
  await page.route(
    "**/api/admin/ops/verification-requests/verification-1/decision",
    async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({ id: "verification-1", status: "APPROVED" }),
        ),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Verification" }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Government identity document matched the profile.");
  await page.getByRole("button", { name: "Confirm Approved" }).click();
  await expect.poll(() => requestBody).toMatchObject({ status: "APPROVED" });
});

test("resolve dispute captures resolution, refund and final job state", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | null = null;
  await fulfill(page, "disputes?limit=100", {
    items: [
      {
        id: "dispute-1",
        reason_code: "WORK_NOT_COMPLETE",
        description: "Work stopped early",
        status: "UNDER_REVIEW",
        evidence: [{}],
        job: { title: "House painting" },
      },
    ],
  });
  await page.route(
    "**/api/admin/ops/disputes/dispute-1/resolve",
    async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope({ id: "dispute-1", status: "RESOLVED" })),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Disputes" }).click();
  await page.getByRole("button", { name: "Resolve" }).click();
  await page
    .getByLabel("Resolution")
    .fill("Customer and worker agreed to close the job.");
  await page
    .getByLabel("Decision reason")
    .fill("Evidence confirms partial completion and cash refund.");
  await page.getByLabel("Cash refund to record (poisha)").fill("5000");
  await page.getByRole("button", { name: "Confirm resolution" }).click();
  await expect
    .poll(() => requestBody)
    .toMatchObject({ refundPoisha: 5000, jobStatus: "COMPLETED" });
});

test("platform fee change requires diff preview and confirmation", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | null = null;
  await fulfill(page, "config", {
    items: [
      {
        key: "platform.fees",
        value: { feeBps: 800, payer: "worker" },
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
    ],
    revisions: [],
  });
  await page.route("**/api/admin/ops/config/platform.fees/preview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({ changedFields: ["feeBps"], requiresConfirmation: true }),
      ),
    }),
  );
  await page.route("**/api/admin/ops/config/platform.fees", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({ key: "platform.fees", revisionId: "revision-1" }),
      ),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Configuration" }).click();
  await page.getByLabel("JSON value").fill('{"feeBps":900,"payer":"worker"}');
  await page.getByRole("button", { name: "Preview diff" }).click();
  await expect(page.getByText("feeBps", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect
    .poll(() => requestBody)
    .toMatchObject({ confirm: true, value: { feeBps: 900 } });
});

test("notification dry-run previews audience without sending", async ({
  page,
}) => {
  let dryRunCalls = 0;
  await page.route(
    "**/api/admin/ops/notifications/campaign/dry-run",
    async (route) => {
      dryRunCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            audienceCount: 42,
            preview: {
              title: "KAAJ update",
              body: "A marketplace update is available.",
            },
          }),
        ),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Notifications" }).click();
  await page.getByRole("button", { name: "Run dry-run" }).click();
  await expect(
    page.getByText("42 recipients match this segment"),
  ).toBeVisible();
  expect(dryRunCalls).toBe(1);
});
