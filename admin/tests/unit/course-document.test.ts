import assert from "node:assert/strict";
import { test } from "node:test";

import { AdminApiError } from "../../lib/admin-api.ts";
import {
  type CourseDocument,
  checkpointCounts,
  checkpointRefusal,
  documentForSave,
  documentProblems,
  incompleteCheckpointLessons,
  lessonsFromCheckpointError,
  move,
  moveLesson,
  removeLesson,
} from "../../lib/course-document.ts";
import { STEP_IMAGE_RULES, checkStepImage } from "../../lib/step-image.ts";

const lesson = (title: string) => ({
  titleEn: title,
  titleBn: title,
  summaryEn: "s",
  summaryBn: "s",
  steps: [{ kind: "STEP" as const, en: "Do it", bn: "করুন" }],
});
const question = (lesson: number | null) => ({
  promptEn: "Q",
  promptBn: "প্র",
  options: [
    { id: "a", en: "A", bn: "ক" },
    { id: "b", en: "B", bn: "খ" },
  ],
  correctOptionId: "a",
  lesson,
});
const course = (
  isSafetyCritical: boolean,
  lessons: (number | null)[],
): CourseDocument => ({
  slug: "c",
  titleEn: "C",
  titleBn: "সি",
  isSafetyCritical,
  lessons: [lesson("one"), lesson("two"), lesson("three")],
  questions: lessons.map(question),
});

test("counts checkpoint questions per lesson", () => {
  assert.deepEqual(
    checkpointCounts(course(true, [1, 1, 2, null, 9])),
    [2, 1, 0],
  );
});

test("a safety-critical course names every lesson without exactly 2", () => {
  assert.deepEqual(
    incompleteCheckpointLessons(course(true, [1, 1, 2, 3, 3, 3])),
    [2, 3],
  );
  assert.deepEqual(
    incompleteCheckpointLessons(course(true, [1, 1, 2, 2, 3, 3])),
    [],
  );
  // Other courses: checkpoints are practice, nothing blocks publishing.
  assert.deepEqual(incompleteCheckpointLessons(course(false, [])), []);
});

test("the publish refusal names the short lessons", () => {
  const error = new AdminApiError(
    "x",
    409,
    "COURSE_CHECKPOINTS_INCOMPLETE",
    [
      { field: "lessons.3", rules: ["checkpoint_count"] },
      { field: "lessons.1", rules: ["checkpoint_count"] },
    ],
    null,
  );
  assert.deepEqual(lessonsFromCheckpointError(error.details), [2, 4]);
  assert.match(checkpointRefusal(error)!, /^Lessons 2 and 4 need exactly 2/u);
  const one = new AdminApiError(
    "x",
    409,
    "COURSE_CHECKPOINTS_INCOMPLETE",
    [{ field: "lessons.2", rules: ["checkpoint_count"] }],
    null,
  );
  assert.match(checkpointRefusal(one)!, /^Lesson 3 needs exactly 2/u);
  assert.equal(checkpointRefusal(new Error("other")), null);
  assert.equal(
    checkpointRefusal(new AdminApiError("x", 409, "CONFLICT", [], null)),
    null,
  );
});

test("moving and removing lessons keeps checkpoints with their lesson", () => {
  const moved = moveLesson(course(true, [1, 2, 3]), 0, 2);
  assert.deepEqual(
    moved.lessons.map((item) => item.titleEn),
    ["two", "three", "one"],
  );
  assert.deepEqual(
    moved.questions.map((item) => item.lesson),
    [3, 1, 2],
  );
  const removed = removeLesson(course(true, [1, 2, 3]), 1);
  assert.deepEqual(
    removed.questions.map((item) => item.lesson),
    [1, null, 2],
  );
  assert.deepEqual(move(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(move(["a", "b"], 0, 9), ["b", "a"]);
});

test("saving drops preview URLs, nulls unused alt text, omits unset lessons", () => {
  const document = course(false, [null, 2]);
  document.lessons[0]!.steps = [
    {
      kind: "HAZARD",
      en: " Live wire ",
      bn: "তার",
      image: "img-1",
      imagePreviewUrl: "https://signed/1",
      altEn: "A live wire",
      altBn: "তার",
    },
    { kind: "STEP", en: "Turn off", bn: "বন্ধ", image: null, altEn: "x" },
  ];
  const saved = documentForSave(document);
  assert.deepEqual(saved.lessons[0]!.steps, [
    {
      kind: "HAZARD",
      en: "Live wire",
      bn: "তার",
      image: "img-1",
      altEn: "A live wire",
      altBn: "তার",
    },
    {
      kind: "STEP",
      en: "Turn off",
      bn: "বন্ধ",
      image: null,
      altEn: null,
      altBn: null,
    },
  ]);
  assert.equal("lesson" in saved.questions[0]!, false);
  assert.equal(saved.questions[1]!.lesson, 2);
});

test("a card needs both languages, a picture needs a description", () => {
  const document = course(false, []);
  document.lessons[1]!.steps = [
    { kind: "STEP", en: "", bn: "ধাপ" },
    { kind: "STEP", en: "x", bn: "y", image: "img", altEn: "", altBn: "" },
  ];
  assert.deepEqual(documentProblems(document), [
    "Lesson 2, card 1: write the text in English and Bangla.",
    "Lesson 2, card 2: describe the picture in English and Bangla.",
  ]);
});

test("picture checks: type, 300 KB, 1600 px, landscape", () => {
  assert.deepEqual(
    checkStepImage({
      mime: "image/webp",
      sizeBytes: 200_000,
      width: 1600,
      height: 900,
    }),
    { errors: [], warnings: [] },
  );
  const bad = checkStepImage({
    mime: "image/gif",
    sizeBytes: 400_000,
    width: 2000,
    height: 3000,
  });
  assert.equal(bad.errors.length, 3);
  assert.deepEqual(bad.warnings, [
    "Use a landscape picture (wider than tall).",
  ]);
  assert.equal(STEP_IMAGE_RULES.length, 5);
});
