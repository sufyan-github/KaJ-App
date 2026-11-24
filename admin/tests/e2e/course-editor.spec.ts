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

/** A 4×2 px PNG: valid, landscape, tiny. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEUlEQVR4nGP8z8DwnwEJMCEzABwgAgNnAYktAAAAAElFTkSuQmCC",
  "base64",
);

const question = (n: number, lesson: number | null) => ({
  promptEn: `Question ${n}?`,
  promptBn: `প্রশ্ন ${n}?`,
  options: [
    { id: "a", en: "Right", bn: "সঠিক" },
    { id: "b", en: "Wrong", bn: "ভুল" },
  ],
  correctOptionId: "a",
  explanationEn: `Because of rule ${n}.`,
  explanationBn: `নিয়ম ${n}।`,
  lesson,
});

const courseDocument = () => ({
  slug: "safe-ladders",
  skillSlug: null,
  titleEn: "Safe ladder use",
  titleBn: "নিরাপদে মই ব্যবহার",
  summaryEn: "Ladders",
  summaryBn: "মই",
  minutes: 10,
  estDataMb: 5,
  passMarkPct: 70,
  questionCount: 3,
  isSafetyCritical: true,
  sortOrder: 0,
  lessons: [
    {
      titleEn: "Setting up",
      titleBn: "মই বসানো",
      summaryEn: "Angle and footing.",
      summaryBn: "কোণ ও ভিত্তি।",
      youtubeVideoId: null,
      durationS: 120,
      isSafety: true,
      steps: [
        {
          kind: "LEARN",
          en: "How to place a ladder",
          bn: "মই রাখা",
          image: null,
        },
        { kind: "STEP", en: "Find firm ground", bn: "শক্ত মাটি", image: null },
      ],
    },
    {
      titleEn: "Climbing",
      titleBn: "ওঠা",
      summaryEn: "Three points of contact.",
      summaryBn: "তিন বিন্দু।",
      youtubeVideoId: null,
      durationS: 90,
      isSafety: true,
      steps: [
        {
          kind: "STEP",
          en: "Face the ladder",
          bn: "মইয়ের দিকে মুখ",
          image: null,
        },
      ],
    },
  ],
  questions: [question(1, 1), question(2, 1), question(3, null)],
});

async function open(page: Page, role = "ADMIN") {
  await page.route("**/api/admin/session", (route) =>
    route.fulfill(ok({ email: "ops@kaj.test", role, userId: "a" })),
  );
  await page.route("**/api/admin/ops/dashboard", (route) =>
    route.fulfill(ok({ counts: {}, stuckJobs: [] })),
  );
  await page.route("**/api/admin/ops/verification-requests?*", (route) =>
    route.fulfill(ok({ items: [], nextCursor: null })),
  );
  await page.route("**/api/admin/ops/training/courses", (route) =>
    route.fulfill(
      ok({
        items: [
          {
            id: "course-1",
            slug: "safe-ladders",
            titleEn: "Safe ladder use",
            titleBn: "নিরাপদে মই ব্যবহার",
            isPublished: false,
            version: 1,
            lessons: 2,
            activeQuestions: 3,
          },
        ],
      }),
    ),
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Learn" })
    .click();
  await page.getByRole("tab", { name: "Courses" }).click();
}

async function serveCourse(page: Page, onSave?: (body: any) => void) {
  await page.route(
    "**/api/admin/ops/training/courses/course-1",
    async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill(
          ok({
            id: "course-1",
            version: 1,
            isPublished: false,
            document: courseDocument(),
          }),
        );
      onSave?.(route.request().postDataJSON());
      return route.fulfill(ok({ outcome: "versionBumped", version: 2 }));
    },
  );
}

test("edits cards and checkpoints and saves them with a reason", async ({
  page,
}) => {
  let saved: any = null;
  await open(page);
  await serveCourse(page, (body) => (saved = body));
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Card 2 English text")).toHaveValue(
    "Find firm ground",
  );

  // Lesson 1 has 2 of 2; lesson 2 has none, so publishing would be refused.
  await expect(
    dialog.getByRole("navigation", { name: "Lessons" }),
  ).toContainText("Checkpoint 2 of 2 ✓");
  await expect(dialog.getByRole("status")).toContainText(
    "Lesson 2 does not have exactly 2 checkpoint questions",
  );

  // Add a hazard card, write it, move it above card 2.
  await dialog.getByRole("button", { name: "Add hazard card" }).click();
  await dialog.getByLabel("Card 3 English text").fill("Watch for power lines");
  await dialog.getByLabel("Card 3 Bangla text").fill("বিদ্যুতের তার দেখুন");
  await dialog.getByRole("button", { name: "Card 3: move up" }).click();
  await expect(dialog.getByLabel("Card 2 kind")).toHaveValue("HAZARD");
  // Delete the learn card.
  await dialog.getByRole("button", { name: "Card 1: delete" }).click();
  await expect(dialog.getByLabel("Card 1 kind")).toHaveValue("HAZARD");

  // Make question 3 a checkpoint for lesson 2.
  await dialog.getByRole("tab", { name: "Questions and checkpoints" }).click();
  await dialog.getByLabel("Question 3 checkpoint lesson").selectOption("2");
  await expect(
    dialog.getByRole("list", { name: "Checkpoints per lesson" }),
  ).toContainText("Lesson 2: Climbing — Checkpoint 1 of 2");

  await expect(
    dialog.getByRole("button", { name: "Save course" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Required operational reason")
    .fill("Add the power line hazard.");
  await dialog.getByRole("button", { name: "Save course" }).click();
  await expect.poll(() => saved?.reason).toBe("Add the power line hazard.");
  expect(saved.document.lessons[0].steps).toEqual([
    {
      kind: "HAZARD",
      en: "Watch for power lines",
      bn: "বিদ্যুতের তার দেখুন",
      image: null,
      altEn: null,
      altBn: null,
    },
    {
      kind: "STEP",
      en: "Find firm ground",
      bn: "শক্ত মাটি",
      image: null,
      altEn: null,
      altBn: null,
    },
  ]);
  expect(saved.document.questions.map((q: any) => q.lesson)).toEqual([1, 1, 2]);
  await expect(
    page.getByRole("status").filter({ hasText: "v2" }),
  ).toContainText("v2 (Version bumped)");
});

test("uploads a step picture through sign, relay and complete", async ({
  page,
}) => {
  const calls: string[] = [];
  let relayHeaders: Record<string, string> = {};
  let saved: any = null;
  await open(page);
  await serveCourse(page, (body) => (saved = body));
  await page.route(
    "**/api/admin/ops/training/step-images/sign",
    async (route) => {
      calls.push(`sign ${JSON.stringify(route.request().postDataJSON())}`);
      await route.fulfill(
        ok({
          uploadUrl:
            "http://127.0.0.1:9000/kaj-local/private/pending/step.png?sig=1",
          requiredHeaders: { "content-type": "image/png" },
          key: "private/pending/step.png",
          expiresAt: new Date().toISOString(),
          expiresIn: 300,
        }),
      );
    },
  );
  await page.route("**/api/admin/uploads", async (route) => {
    calls.push("relay");
    relayHeaders = route.request().headers();
    await route.fulfill(ok({ uploaded: true }));
  });
  await page.route(
    "**/api/admin/ops/training/step-images/complete",
    async (route) => {
      calls.push(`complete ${route.request().postDataJSON().key}`);
      await route.fulfill(
        ok({
          imageKey: "training/steps/abc.webp",
          previewUrl: `data:image/png;base64,${PNG.toString("base64")}`,
          width: 4,
          height: 2,
        }),
      );
    },
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  // The rules sit next to the upload.
  await expect(
    dialog.getByRole("list", { name: "Picture rules" }).first(),
  ).toContainText("No faces without the person's consent.");
  await dialog
    .getByLabel("Card 2 picture")
    .setInputFiles({ name: "step.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.locator(".picture-box img")).toHaveCount(1);
  expect(calls).toEqual([
    `sign {"mime":"image/png","sizeBytes":${PNG.length}}`,
    "relay",
    "complete private/pending/step.png",
  ]);
  expect(relayHeaders["x-kaj-upload-url"]).toContain(
    "/private/pending/step.png",
  );

  // A picture needs a description in both languages before saving.
  await dialog
    .getByLabel("Required operational reason")
    .fill("Add the ground picture.");
  await expect(
    dialog.getByRole("list", { name: "Before saving" }),
  ).toContainText(
    "Lesson 1, card 2: describe the picture in English and Bangla.",
  );
  await expect(
    dialog.getByRole("button", { name: "Save course" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Card 2 picture description in English")
    .fill("Ladder on firm ground");
  await dialog
    .getByLabel("Card 2 picture description in Bangla")
    .fill("শক্ত মাটিতে মই");
  await dialog.getByRole("button", { name: "Save course" }).click();
  await expect
    .poll(() => saved?.document?.lessons[0].steps[1])
    .toEqual({
      kind: "STEP",
      en: "Find firm ground",
      bn: "শক্ত মাটি",
      image: "training/steps/abc.webp",
      altEn: "Ladder on firm ground",
      altBn: "শক্ত মাটিতে মই",
    });
});

test("refuses an oversized picture before uploading", async ({ page }) => {
  let signed = false;
  await open(page);
  await serveCourse(page);
  await page.route("**/api/admin/ops/training/step-images/sign", (route) => {
    signed = true;
    return route.fulfill(ok({}));
  });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Card 1 picture")
    .setInputFiles({
      name: "big.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(400_000, 1),
    });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "the limit is 300 KB",
  );
  expect(signed).toBe(false);
});

test("publishing names the lessons that are short of checkpoint questions", async ({
  page,
}) => {
  await open(page);
  await page.route(
    "**/api/admin/ops/training/courses/course-1/publish",
    (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "COURSE_CHECKPOINTS_INCOMPLETE",
            message: "Checkpoints incomplete.",
            details: [
              { field: "lessons.2", rules: ["checkpoint_count"] },
              { field: "lessons.1", rules: ["checkpoint_count"] },
            ],
          },
        }),
      }),
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByLabel("Required operational reason")
    .fill("Ready for learners.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Publish" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Lessons 2 and 3 need exactly 2 checkpoint questions before",
  );
});

test("the preview shows the cards, the hazard box and the checkpoint", async ({
  page,
}) => {
  await open(page);
  await serveCourse(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Add hazard card" }).click();
  await dialog.getByLabel("Card 3 English text").fill("Power lines overhead");
  await dialog.getByLabel("Card 3 Bangla text").fill("মাথার উপরে তার");
  await dialog.getByRole("tab", { name: "Preview" }).click();
  const preview = dialog.getByRole("region", { name: "Learner preview" });
  await preview.getByRole("button", { name: "EN" }).click();
  await expect(preview.locator(".learner-card").nth(0)).toContainText(
    "You will learn",
  );
  await expect(preview.locator(".learner-card").nth(1)).toContainText("Step 1");
  await expect(preview.locator(".card-hazard")).toContainText("Hazard");
  await expect(preview.locator(".card-hazard")).toContainText(
    "Power lines overhead",
  );
  // Checkpoint: a wrong answer shows the explanation.
  await preview.getByRole("radio", { name: "Wrong" }).first().check();
  await preview.getByRole("button", { name: "Check answers" }).click();
  await expect(preview).toContainText("Because of rule 1.");
});

test("MODERATOR can view a course but not change it", async ({ page }) => {
  await open(page, "MODERATOR");
  await serveCourse(page);
  await page.getByRole("button", { name: "View", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "View course" });
  await expect(dialog.getByLabel("Card 1 English text")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Save course" })).toHaveCount(
    0,
  );
  await expect(dialog.getByLabel("Card 1 picture")).toHaveCount(0);
  await expect(dialog).toContainText(
    "Your role can read this course but not change it.",
  );
  await expect(page.getByRole("button", { name: "New course" })).toHaveCount(0);
});

test("the JSON tab refuses invalid JSON", async ({ page }) => {
  await open(page);
  await serveCourse(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "JSON" }).click();
  await dialog.getByLabel("Course document (JSON)").fill("{ not json");
  await dialog.getByRole("button", { name: "Apply JSON" }).click();
  await expect(dialog.getByRole("alert")).toContainText("not valid JSON");
});

test("the upload relay needs a session and only reaches the storage origin", async ({
  request,
}) => {
  const png = { "content-type": "image/png" };
  const signedOut = await request.post("/api/admin/uploads", {
    headers: { ...png, "x-kaj-upload-url": "http://127.0.0.1:9000/x" },
    data: PNG,
  });
  expect(signedOut.status()).toBe(401);
  // With a session cookie, a URL outside KAJ_STORAGE_ORIGINS / S3_ENDPOINT is
  // refused before anything is fetched (no general proxy).
  const elsewhere = await request.post("/api/admin/uploads", {
    headers: {
      ...png,
      cookie: "kaj_admin_session=test",
      "x-kaj-upload-url": "http://169.254.169.254/latest/meta-data",
    },
    data: PNG,
  });
  expect(elsewhere.status()).toBe(400);
  expect((await elsewhere.json()).error.message).toContain(
    "configured storage",
  );
});
