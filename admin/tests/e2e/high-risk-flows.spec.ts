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
        allowedTransitions: ["APPLICATIONS_OPEN", "SUSPENDED"],
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
  // Only the states the server allows are offered.
  await expect(page.getByLabel("Target status").locator("option")).toHaveText([
    "APPLICATIONS_OPEN",
    "SUSPENDED",
  ]);
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

test("risk signals require a human decision and never request moderation", async ({
  page,
}) => {
  let scanBody: Record<string, unknown> | null = null;
  let decisionBody: Record<string, unknown> | null = null;
  await fulfill(page, "risk/items?limit=100", {
    total: 1,
    metrics: {
      adjudicatedCount: 4,
      observedPrecisionBps: 7500,
      observedFalsePositiveRateBps: 2500,
    },
    items: [
      {
        id: "risk-1",
        score: 55,
        severity: "MEDIUM",
        signals: [{ type: "DUPLICATE_DEVICE", score: 55, evidence: {} }],
        status: "UNDER_REVIEW",
        lastDetectedAt: new Date().toISOString(),
        subject: {
          id: "user-1",
          name: "Observed worker",
          status: "ACTIVE",
          moderationLevel: "NONE",
        },
      },
    ],
  });
  await page.route("**/api/admin/ops/risk/scan", async (route) => {
    scanBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({ detectedAccounts: 1, automaticActions: 0 }),
      ),
    });
  });
  await page.route(
    "**/api/admin/ops/risk/items/risk-1/decision",
    async (route) => {
      decisionBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            id: "risk-1",
            status: "ESCALATED",
            automaticModerationAction: null,
          }),
        ),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Risk review" }).click();
  await expect(page.getByText("75.0%")).toBeVisible();
  await page.getByRole("button", { name: "Run reviewed scan" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Daily operations review of deterministic risk signals.");
  await page.getByRole("button", { name: "Run scan" }).click();
  await expect
    .poll(() => scanBody)
    .toMatchObject({
      reason: "Daily operations review of deterministic risk signals.",
    });
  await page.getByRole("button", { name: "Decide" }).click();
  await page
    .getByLabel("Required decision reason")
    .fill("Shared device evidence needs separate moderation review.");
  await page.getByRole("button", { name: "Confirm risk decision" }).click();
  await expect
    .poll(() => decisionBody)
    .toEqual({
      status: "ESCALATED",
      reason: "Shared device evidence needs separate moderation review.",
    });
  expect(decisionBody).not.toHaveProperty("action");
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

test("campaign send asks for confirmation and shows batch progress", async ({
  page,
}) => {
  let sendBody: Record<string, unknown> | null = null;
  let campaigns: unknown[] = [];
  await page.route(
    "**/api/admin/ops/notifications/campaigns?limit=20",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope({ items: campaigns, nextCursor: null })),
      }),
  );
  await fulfill(page, "notifications/campaign/dry-run", {
    audienceCount: 250,
    preview: { title: "KAAJ update", body: "Update" },
  });
  await page.route(
    "**/api/admin/ops/notifications/campaign/send",
    async (route) => {
      sendBody = route.request().postDataJSON();
      campaigns = [
        {
          id: "c-1",
          name: "Pilot update",
          title: "KAAJ update",
          audienceCount: 250,
          sentCount: 100,
          throttlePerMinute: 100,
          status: "SENDING",
          createdBy: "ops@kaj.test",
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            id: "c-1",
            audienceCount: 250,
            sentCount: 100,
            status: "SENDING",
          }),
        ),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Nothing to show")).toBeVisible();
  await page.getByRole("button", { name: "Run dry-run" }).click();
  await page.getByRole("button", { name: "Send campaign" }).click();
  // Nothing is sent until the operator confirms the audience size.
  await expect(page.getByRole("dialog")).toContainText("250 people");
  expect(sendBody).toBeNull();
  await page.getByRole("button", { name: "Confirm send" }).click();
  await expect
    .poll(() => sendBody)
    .toMatchObject({ name: "Pilot update", throttlePerMinute: 100 });
  await expect(page.getByText("Sent to 100 of 250")).toBeVisible();
  await expect(page.getByText("100 / 250")).toBeVisible();
  await expect(page.getByText("Sending", { exact: true })).toBeVisible();
});

test("audit trail filters, shows details and exports CSV", async ({ page }) => {
  const requested: string[] = [];
  let exported: string | null = null;
  await page.route("**/api/admin/ops/audit-logs?*", (route) => {
    requested.push(new URL(route.request().url()).search);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          nextCursor: null,
          items: [
            {
              id: "log-1",
              action: "ADMIN_STAFF_ROLE_CHANGED",
              entity: "ADMIN_STAFF",
              entity_id: "staff-2",
              created_at: "2026-11-19T08:00:00.000Z",
              ip: "203.0.113.5",
              ua: "Chrome",
              before_json: { role: "MODERATOR" },
              after_json: { role: "SUPPORT" },
              actor: { email: "ops@kaj.test" },
            },
          ],
        }),
      ),
    });
  });
  await page.route("**/api/admin/ops/audit-logs/export?*", (route) => {
    exported = new URL(route.request().url()).search;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          filename: "kaaj-audit.csv",
          rowCount: 1,
          truncated: false,
          csv: "created_at,action\r\n",
        }),
      ),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Audit trail" }).click();
  await expect(page.getByText("ADMIN_STAFF_ROLE_CHANGED")).toBeVisible();
  expect(requested[0]).toContain("changesOnly=true");
  await page.getByLabel("Action").fill("admin_staff_role_changed");
  await page.getByLabel("Actor email").fill("ops@kaj.test");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect
    .poll(() => requested.at(-1))
    .toContain("action=ADMIN_STAFF_ROLE_CHANGED");
  expect(requested.at(-1)).toContain("actorEmail=ops%40kaj.test");
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText('"role": "SUPPORT"');
  await expect(page.getByRole("dialog")).toContainText("203.0.113.5");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe("kaaj-audit.csv");
  expect(exported).toContain("action=ADMIN_STAFF_ROLE_CHANGED");
  await expect(page.getByText("Exported 1 rows.")).toBeVisible();
});

test("users: search and status filter reach the API, load more appends", async ({
  page,
}) => {
  const requested: string[] = [];
  const user = (id: string, name: string) => ({
    id,
    name,
    phone: "+8801700000000",
    email: null,
    roles: ["WORKER"],
    trustLevel: "PHONE",
    status: "ACTIVE",
    moderationLevel: "NONE",
    reverificationRequired: false,
  });
  await page.route("**/api/admin/ops/users?*", (route) => {
    const url = new URL(route.request().url());
    requested.push(url.search);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope(
          url.searchParams.get("cursor")
            ? { total: 2, items: [user("u-2", "Second")], nextCursor: null }
            : { total: 2, items: [user("u-1", "First")], nextCursor: "u-1" },
        ),
      ),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Users" }).click();
  await expect(page.getByText("Showing 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Second")).toBeVisible();
  await page.getByRole("searchbox").fill("rahim");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Status").selectOption("SUSPENDED");
  await expect.poll(() => requested.at(-1)).toContain("status=SUSPENDED");
  expect(requested.at(-1)).toContain("search=rahim");
});
