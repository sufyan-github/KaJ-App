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

/** Records the JSON body of the first request to `path`. */
async function capture(page: Page, path: string, data: unknown = {}) {
  const seen: { body: Record<string, unknown> | null } = { body: null };
  await page.route(`**/api/admin/ops/${path}`, async (route) => {
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

/** Opens the Learn module once a test has set up its routes. */
async function openLearn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Learn" }).click();
}

test("approves a mentor application showing what they will teach", async ({
  page,
}) => {
  await respond(page, "verification-requests?kind=MENTOR&limit=100", {
    items: [
      {
        id: "request-1",
        kind: "MENTOR",
        status: "PENDING",
        user: { name: "Karim Mia", trustLevel: "IDENTITY" },
        documents: [],
        mentorApplication: {
          bio: "Ten years repairing phones.",
          yearsExperience: 10,
          skills: [
            {
              skillId: "skill-1",
              nameEn: "Phone repair",
              nameBn: "ফোন মেরামত",
              level: "EXPERT",
            },
          ],
        },
      },
    ],
  });
  const decision = await capture(
    page,
    "verification-requests/request-1/decision",
  );
  await openLearn(page);
  await expect(page.getByRole("row", { name: /Karim Mia/ })).toContainText(
    "Phone repair (Expert)",
  );
  await page.getByRole("button", { name: "Approve" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Evidence of ten years of repairs checked.");
  await page.getByRole("button", { name: "Confirm Approved" }).click();
  await expect.poll(() => decision.body).toMatchObject({ status: "APPROVED" });
});

test("suspends a learning opportunity with a reason", async ({ page }) => {
  await respond(page, "learning-opportunities?limit=100", {
    items: [
      {
        id: "opportunity-1",
        title: "Tailoring apprenticeship",
        opportunityType: "APPRENTICESHIP",
        status: "APPLICATIONS_OPEN",
        termsText: { en: "Stipend: ৳2000", bn: "ভাতা: ৳২০০০" },
        seats: 2,
        seatsFilled: 1,
        applications: 3,
        mentor: {
          userId: "mentor-1",
          name: "Rokeya",
          mentorStatus: "APPROVED",
        },
        actions: ["suspend"],
      },
    ],
  });
  const suspend = await capture(
    page,
    "learning-opportunities/opportunity-1/suspend",
  );
  await openLearn(page);
  await page.getByRole("tab", { name: "Learning opportunities" }).click();
  const row = page.getByRole("row", { name: /Tailoring apprenticeship/ });
  await expect(row).toContainText("Stipend: ৳2000");
  await row.getByRole("button", { name: "Suspend", exact: true }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Reported for misleading stipend terms.");
  await page
    .getByRole("button", { name: "Suspend", exact: true })
    .last()
    .click();
  await expect
    .poll(() => suspend.body)
    .toMatchObject({ reason: "Reported for misleading stipend terms." });
});

test("edits a course document and reports the new version", async ({
  page,
}) => {
  await respond(page, "training/courses", {
    items: [
      {
        id: "course-1",
        slug: "safe-ladders",
        titleEn: "Safe ladder use",
        titleBn: "নিরাপদে মই ব্যবহার",
        isPublished: true,
        version: 1,
        lessons: 1,
        activeQuestions: 1,
      },
    ],
  });
  await page.route(
    "**/api/admin/ops/training/courses/course-1",
    async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            envelope({
              id: "course-1",
              version: 1,
              isPublished: true,
              document: { slug: "safe-ladders", titleEn: "Safe ladder use" },
            }),
          ),
        });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({ outcome: "versionBumped", version: 2, document: {} }),
        ),
      });
    },
  );
  await openLearn(page);
  await page.getByRole("tab", { name: "Courses" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByLabel("Course document (JSON)");
  await expect(editor).toHaveValue(/safe-ladders/);
  await editor.fill("{ not json");
  await page.getByRole("button", { name: "Save course" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "not valid JSON" }),
  ).toBeVisible();
  await editor.fill('{"slug":"safe-ladders","titleEn":"Using a ladder"}');
  await page.getByRole("button", { name: "Save course" }).click();
  await expect(page.getByRole("status")).toContainText("v2 (Version bumped)");
});

test("revokes a completion record", async ({ page }) => {
  await respond(page, "certificates?limit=100", {
    items: [
      {
        id: "certificate-1",
        kind: "PRACTICAL",
        code: "ABCDEFGHJK",
        title: "Blouse tailoring",
        holder: { name: "Rina Das" },
        issuedBy: { name: "Karim Mia" },
        status: "VALID",
      },
    ],
  });
  const revoke = await capture(page, "certificates/certificate-1/revoke");
  await openLearn(page);
  await page.getByRole("tab", { name: "Completion records" }).click();
  await expect(page.getByRole("row", { name: /ABCDEFGHJK/ })).toContainText(
    "Checked by Karim Mia",
  );
  await page.getByRole("button", { name: "Revoke" }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Issued to the wrong learner.");
  await page.getByRole("button", { name: "Revoke" }).last().click();
  await expect
    .poll(() => revoke.body)
    .toMatchObject({ reason: "Issued to the wrong learner." });
});
