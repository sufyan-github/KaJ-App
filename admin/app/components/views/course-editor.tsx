"use client";
import { ChangeEvent, useState } from "react";
import { adminApi, json } from "@/lib/admin-api";
import { friendlyAdminError, tr } from "@/lib/admin-i18n";
import {
  CHECKPOINT_QUESTIONS_PER_LESSON,
  type CourseDocument,
  type CourseLesson,
  type CourseQuestion,
  type CourseStep,
  STEP_KINDS,
  type StepKind,
  checkpointCounts,
  checkpointRefusal,
  lessonList,
  documentForSave,
  documentProblems,
  emptyStep,
  incompleteCheckpointLessons,
  move,
  moveLesson,
  removeLesson,
} from "@/lib/course-document.ts";
import {
  STEP_IMAGE_RULES,
  STEP_IMAGE_TYPES,
  checkStepImage,
} from "@/lib/step-image.ts";
import { Can, Dialog, useCan } from "../ui";

type Tab = "details" | "lessons" | "questions" | "preview" | "json";
const TABS: Array<[Tab, string]> = [
  ["details", "Course"],
  ["lessons", "Lessons and cards"],
  ["questions", "Questions and checkpoints"],
  ["preview", "Preview"],
  ["json", "JSON"],
];

/**
 * The course editor: course details, lessons with ordered step cards and
 * pictures, questions with their checkpoint lesson, a learner preview and
 * the raw JSON. Read-only for roles that may read but not save a course.
 */
export function CourseEditor({
  courseId,
  initial,
  onClose,
  onSaved,
}: {
  courseId: string | null;
  initial: CourseDocument;
  onClose: () => void;
  onSaved: (result: { version: number; outcome?: string }) => Promise<void>;
}) {
  const can = useCan();
  const canSave = courseId
    ? can("PUT training/courses/:id")
    : can("POST training/courses");
  const [document, setDocument] = useState<CourseDocument>(initial);
  const [tab, setTab] = useState<Tab>("lessons");
  const [lessonIndex, setLessonIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const counts = checkpointCounts(document);
  const short = incompleteCheckpointLessons(document);
  const problems = documentProblems(document);

  function update(change: (current: CourseDocument) => CourseDocument) {
    setDocument((current) => change(current));
  }
  function updateLesson(index: number, change: Partial<CourseLesson>) {
    update((current) => ({
      ...current,
      lessons: current.lessons.map((lesson, i) =>
        i === index ? { ...lesson, ...change } : lesson,
      ),
    }));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = {
        document: documentForSave(document),
        reason: reason.trim(),
      };
      const result = courseId
        ? await adminApi<{ version: number; outcome?: string }>(
            `training/courses/${courseId}`,
            json("PUT", body),
          )
        : await adminApi<{ version: number }>(
            "training/courses",
            json("POST", body),
          );
      await onSaved(result);
    } catch (caught) {
      const refusal = checkpointRefusal(caught);
      setError(refusal ? tr(refusal) : friendlyAdminError(caught));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={
        canSave ? (courseId ? "Edit course" : "New course") : "View course"
      }
      onClose={onClose}
      wide
    >
      <div
        className="learn-tabs"
        role="tablist"
        aria-label={tr("Course editor")}
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {tr(label)}
          </button>
        ))}
      </div>
      <fieldset className="course-editor" disabled={!canSave || busy}>
        <div role="tabpanel">
          {tab === "details" && (
            <DetailsTab document={document} update={update} />
          )}
          {tab === "lessons" && (
            <LessonsTab
              document={document}
              counts={counts}
              lessonIndex={lessonIndex}
              setLessonIndex={setLessonIndex}
              update={update}
              updateLesson={updateLesson}
            />
          )}
          {tab === "questions" && (
            <QuestionsTab document={document} counts={counts} update={update} />
          )}
          {tab === "json" && (
            <JsonTab document={document} setDocument={setDocument} />
          )}
        </div>
      </fieldset>
      {tab === "preview" && (
        <LessonPreview
          document={document}
          lessonIndex={lessonIndex}
          setLessonIndex={setLessonIndex}
        />
      )}
      <section className="editor-footer" aria-label={tr("Save")}>
        {document.isSafetyCritical && short.length > 0 && (
          <p className="notice-warning" role="status">
            {tr(
              `Safety-critical course: ${lessonList(short)} ${short.length === 1 ? "does" : "do"} not have exactly ${CHECKPOINT_QUESTIONS_PER_LESSON} checkpoint questions, so publishing will be refused.`,
            )}
          </p>
        )}
        {problems.length > 0 && (
          <ul className="problems" aria-label={tr("Before saving")}>
            {problems.map((problem) => (
              <li key={problem}>{tr(problem)}</li>
            ))}
          </ul>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {canSave ? (
          <>
            <label>
              {tr("Required operational reason")}
              <textarea
                value={reason}
                minLength={8}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button
              className="primary"
              type="button"
              disabled={busy || reason.trim().length < 8 || problems.length > 0}
              onClick={() => void save()}
            >
              {tr(busy ? "Applying…" : "Save course")}
            </button>
          </>
        ) : (
          <p className="muted">
            {tr("Your role can read this course but not change it.")}
          </p>
        )}
      </section>
    </Dialog>
  );
}

function DetailsTab({
  document,
  update,
}: {
  document: CourseDocument;
  update: (change: (current: CourseDocument) => CourseDocument) => void;
}) {
  const field =
    (key: string) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      update((current) => ({ ...current, [key]: event.target.value }));
  return (
    <div className="editor-grid">
      <label>
        {tr("Slug")}
        <input value={document.slug} onChange={field("slug")} />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={document.isSafetyCritical}
          onChange={(event) =>
            update((current) => ({
              ...current,
              isSafetyCritical: event.target.checked,
            }))
          }
        />
        {tr(
          "Safety-critical: lessons open in order, each after its checkpoint",
        )}
      </label>
      <label>
        {tr("Title (English)")}
        <input value={document.titleEn} onChange={field("titleEn")} />
      </label>
      <label>
        {tr("Title (Bangla)")}
        <input value={document.titleBn} onChange={field("titleBn")} />
      </label>
      <label>
        {tr("Summary (English)")}
        <textarea
          value={String(document.summaryEn ?? "")}
          onChange={field("summaryEn")}
        />
      </label>
      <label>
        {tr("Summary (Bangla)")}
        <textarea
          value={String(document.summaryBn ?? "")}
          onChange={field("summaryBn")}
        />
      </label>
    </div>
  );
}

function LessonsTab({
  document,
  counts,
  lessonIndex,
  setLessonIndex,
  update,
  updateLesson,
}: {
  document: CourseDocument;
  counts: number[];
  lessonIndex: number;
  setLessonIndex: (index: number) => void;
  update: (change: (current: CourseDocument) => CourseDocument) => void;
  updateLesson: (index: number, change: Partial<CourseLesson>) => void;
}) {
  const lesson = document.lessons[lessonIndex];
  const steps = lesson?.steps ?? [];
  const setSteps = (next: CourseStep[]) =>
    updateLesson(lessonIndex, { steps: next });
  return (
    <div className="lesson-layout">
      <nav aria-label={tr("Lessons")} className="lesson-list">
        <ol>
          {document.lessons.map((item, index) => (
            <li key={index}>
              <button
                type="button"
                className={index === lessonIndex ? "active" : ""}
                aria-current={index === lessonIndex ? "true" : undefined}
                onClick={() => setLessonIndex(index)}
              >
                <strong>
                  {index + 1}. {item.titleEn || tr("Untitled lesson")}
                </strong>
                <small>
                  {(item.steps ?? []).length} {tr("cards")} ·{" "}
                  <CheckpointBadge
                    count={counts[index] ?? 0}
                    required={document.isSafetyCritical}
                  />
                </small>
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => {
            update((current) => ({
              ...current,
              lessons: [
                ...current.lessons,
                {
                  titleEn: "",
                  titleBn: "",
                  summaryEn: "",
                  summaryBn: "",
                  youtubeVideoId: null,
                  durationS: 0,
                  isSafety: false,
                  steps: [emptyStep("LEARN")],
                },
              ],
            }));
            setLessonIndex(document.lessons.length);
          }}
        >
          {tr("Add lesson")}
        </button>
      </nav>
      {lesson ? (
        <section className="lesson-detail" aria-label={tr("Lesson")}>
          <div className="editor-grid">
            <label>
              {tr("Lesson title (English)")}
              <input
                value={lesson.titleEn}
                onChange={(event) =>
                  updateLesson(lessonIndex, { titleEn: event.target.value })
                }
              />
            </label>
            <label>
              {tr("Lesson title (Bangla)")}
              <input
                value={lesson.titleBn}
                onChange={(event) =>
                  updateLesson(lessonIndex, { titleBn: event.target.value })
                }
              />
            </label>
            <label>
              {tr("Summary for older app versions (English)")}
              <textarea
                value={lesson.summaryEn}
                onChange={(event) =>
                  updateLesson(lessonIndex, { summaryEn: event.target.value })
                }
              />
            </label>
            <label>
              {tr("Summary for older app versions (Bangla)")}
              <textarea
                value={lesson.summaryBn}
                onChange={(event) =>
                  updateLesson(lessonIndex, { summaryBn: event.target.value })
                }
              />
            </label>
          </div>
          <div className="actions">
            <button
              type="button"
              disabled={lessonIndex === 0}
              onClick={() => {
                update((current) =>
                  moveLesson(current, lessonIndex, lessonIndex - 1),
                );
                setLessonIndex(lessonIndex - 1);
              }}
            >
              {tr("Move lesson up")}
            </button>
            <button
              type="button"
              disabled={lessonIndex === document.lessons.length - 1}
              onClick={() => {
                update((current) =>
                  moveLesson(current, lessonIndex, lessonIndex + 1),
                );
                setLessonIndex(lessonIndex + 1);
              }}
            >
              {tr("Move lesson down")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    tr(
                      "Delete this lesson? Its checkpoint questions stay as ordinary questions.",
                    ),
                  )
                )
                  return;
                update((current) => removeLesson(current, lessonIndex));
                setLessonIndex(Math.max(0, lessonIndex - 1));
              }}
            >
              {tr("Delete lesson")}
            </button>
          </div>
          <h3>{tr("Cards")}</h3>
          <p className="muted">
            {tr(
              "Learners see these cards in order, then the lesson's checkpoint questions. Step cards are numbered by the app; don't write \"Step 1:\".",
            )}
          </p>
          <ol className="step-list">
            {steps.map((step, index) => (
              <StepEditor
                key={index}
                step={step}
                index={index}
                count={steps.length}
                onChange={(next) =>
                  setSteps(steps.map((item, i) => (i === index ? next : item)))
                }
                onMove={(to) => setSteps(move(steps, index, to))}
                onDelete={() => setSteps(steps.filter((_, i) => i !== index))}
              />
            ))}
          </ol>
          <div className="actions">
            {STEP_KINDS.map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => setSteps([...steps, emptyStep(kind)])}
              >
                {tr(`Add ${label.toLowerCase()} card`)}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="muted">{tr("Add a lesson to start.")}</p>
      )}
    </div>
  );
}

function CheckpointBadge({
  count,
  required,
}: {
  count: number;
  required: boolean;
}) {
  const ok = count === CHECKPOINT_QUESTIONS_PER_LESSON;
  return (
    <span className={`checkpoint-count ${ok ? "ok" : required ? "short" : ""}`}>
      {tr("Checkpoint")} {count} {tr("of")} {CHECKPOINT_QUESTIONS_PER_LESSON}
      {ok ? " ✓" : required ? " ⚠" : ""}
    </span>
  );
}

function StepEditor({
  step,
  index,
  count,
  onChange,
  onMove,
  onDelete,
}: {
  step: CourseStep;
  index: number;
  count: number;
  onChange: (step: CourseStep) => void;
  onMove: (to: number) => void;
  onDelete: () => void;
}) {
  const label = `${tr("Card")} ${index + 1}`;
  return (
    <li className={`step-editor step-${step.kind.toLowerCase()}`}>
      <div className="step-head">
        <strong>{label}</strong>
        <label>
          {tr("Kind")}
          <select
            aria-label={`${label} ${tr("kind")}`}
            value={step.kind}
            onChange={(event) =>
              onChange({ ...step, kind: event.target.value as StepKind })
            }
          >
            {STEP_KINDS.map(([kind, name]) => (
              <option key={kind} value={kind}>
                {tr(name)}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button
            type="button"
            aria-label={`${label}: ${tr("move up")}`}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`${label}: ${tr("move down")}`}
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`${label}: ${tr("delete")}`}
            onClick={onDelete}
          >
            {tr("Delete")}
          </button>
        </div>
      </div>
      <div className="editor-grid">
        <label>
          {tr("Text (English)")}
          <textarea
            aria-label={`${label} ${tr("English text")}`}
            value={step.en}
            onChange={(event) => onChange({ ...step, en: event.target.value })}
          />
        </label>
        <label>
          {tr("Text (Bangla)")}
          <textarea
            aria-label={`${label} ${tr("Bangla text")}`}
            value={step.bn}
            onChange={(event) => onChange({ ...step, bn: event.target.value })}
          />
        </label>
      </div>
      <StepPicture step={step} label={label} onChange={onChange} />
    </li>
  );
}

/** Reads a picture's pixel size in the browser before uploading it. */
async function imageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

function StepPicture({
  step,
  label,
  onChange,
}: {
  step: CourseStep;
  label: string;
  onChange: (step: CourseStep) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  async function upload(file: File) {
    setError("");
    setWarnings([]);
    const size = await imageSize(file);
    const check = checkStepImage({
      mime: file.type,
      sizeBytes: file.size,
      width: size?.width,
      height: size?.height,
    });
    if (check.errors.length) {
      setError(check.errors.map((item) => tr(item)).join(" "));
      return;
    }
    setWarnings(check.warnings);
    setBusy(true);
    try {
      const signed = await adminApi<{
        uploadUrl: string;
        requiredHeaders: Record<string, string>;
        key: string;
      }>(
        "training/step-images/sign",
        json("POST", { mime: file.type, sizeBytes: file.size }),
      );
      const relayed = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: {
          "content-type": file.type,
          "x-kaj-upload-url": signed.uploadUrl,
          "x-kaj-upload-headers": JSON.stringify(signed.requiredHeaders ?? {}),
        },
        body: file,
      });
      if (!relayed.ok) {
        const body = await relayed.json().catch(() => null);
        throw new Error(body?.error?.message ?? "The upload failed.");
      }
      const done = await adminApi<{
        imageKey: string;
        previewUrl: string;
      }>(
        "training/step-images/complete",
        json("POST", {
          key: signed.key,
          mime: file.type,
          sizeBytes: file.size,
        }),
      );
      onChange({
        ...step,
        image: done.imageKey,
        imagePreviewUrl: done.previewUrl,
      });
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="step-picture">
      <div className="picture-box">
        {step.image && step.imagePreviewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={step.imagePreviewUrl}
            alt={step.altEn ?? ""}
            referrerPolicy="no-referrer"
          />
        ) : step.image ? (
          <span className="muted">
            {tr("Picture saved (preview after reload).")}
          </span>
        ) : (
          <span className="muted">{tr("No picture: a text-only card.")}</span>
        )}
      </div>
      <div className="picture-controls">
        <Can
          route={[
            "POST training/step-images/sign",
            "POST training/step-images/complete",
          ]}
        >
          <label className="upload">
            {tr(step.image ? "Replace picture" : "Add picture")}
            <input
              type="file"
              accept={STEP_IMAGE_TYPES.join(",")}
              aria-label={`${label} ${tr("picture")}`}
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
        </Can>
        {step.image && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...step,
                image: null,
                imagePreviewUrl: null,
                altEn: null,
                altBn: null,
              })
            }
          >
            {tr("Remove picture")}
          </button>
        )}
        {busy && <span role="status">{tr("Uploading…")}</span>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {warnings.map((warning) => (
          <p className="notice-warning" key={warning}>
            {tr(warning)}
          </p>
        ))}
        <ul className="picture-rules" aria-label={tr("Picture rules")}>
          {STEP_IMAGE_RULES.map((rule) => (
            <li key={rule}>{tr(rule)}</li>
          ))}
        </ul>
        {step.image && (
          <div className="editor-grid">
            <label>
              {tr("Picture description (English)")}
              <input
                aria-label={`${label} ${tr("picture description in English")}`}
                value={step.altEn ?? ""}
                onChange={(event) =>
                  onChange({ ...step, altEn: event.target.value })
                }
              />
            </label>
            <label>
              {tr("Picture description (Bangla)")}
              <input
                aria-label={`${label} ${tr("picture description in Bangla")}`}
                value={step.altBn ?? ""}
                onChange={(event) =>
                  onChange({ ...step, altBn: event.target.value })
                }
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionsTab({
  document,
  counts,
  update,
}: {
  document: CourseDocument;
  counts: number[];
  update: (change: (current: CourseDocument) => CourseDocument) => void;
}) {
  const setQuestion = (index: number, change: Partial<CourseQuestion>) =>
    update((current) => ({
      ...current,
      questions: current.questions.map((question, i) =>
        i === index ? { ...question, ...change } : question,
      ),
    }));
  return (
    <>
      <ul
        className="checkpoint-summary"
        aria-label={tr("Checkpoints per lesson")}
      >
        {document.lessons.map((lesson, index) => (
          <li key={index}>
            {tr("Lesson")} {index + 1}:{" "}
            {lesson.titleEn || tr("Untitled lesson")} —{" "}
            <CheckpointBadge
              count={counts[index] ?? 0}
              required={document.isSafetyCritical}
            />
          </li>
        ))}
      </ul>
      <p className="muted">
        {tr(
          "A checkpoint question is asked at the end of its lesson and stays in the final test. Both checkpoint questions must be answered correctly to finish the lesson; tries are unlimited.",
        )}
      </p>
      <ol className="question-list">
        {document.questions.map((question, index) => (
          <li key={index} className="question-editor">
            <div className="step-head">
              <strong>
                {tr("Question")} {index + 1}
              </strong>
              <label>
                {tr("Checkpoint for")}
                <select
                  aria-label={`${tr("Question")} ${index + 1} ${tr("checkpoint lesson")}`}
                  value={question.lesson ?? ""}
                  onChange={(event) =>
                    setQuestion(index, {
                      lesson: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">{tr("Final test only")}</option>
                  {document.lessons.map((lesson, lessonIndex) => (
                    <option key={lessonIndex} value={lessonIndex + 1}>
                      {tr("Lesson")} {lessonIndex + 1} (
                      {counts[lessonIndex] ?? 0}/
                      {CHECKPOINT_QUESTIONS_PER_LESSON})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    questions: current.questions.filter((_, i) => i !== index),
                  }))
                }
              >
                {tr("Delete")}
              </button>
            </div>
            <div className="editor-grid">
              <label>
                {tr("Question (English)")}
                <textarea
                  value={question.promptEn}
                  onChange={(event) =>
                    setQuestion(index, { promptEn: event.target.value })
                  }
                />
              </label>
              <label>
                {tr("Question (Bangla)")}
                <textarea
                  value={question.promptBn}
                  onChange={(event) =>
                    setQuestion(index, { promptBn: event.target.value })
                  }
                />
              </label>
            </div>
            <fieldset className="options">
              <legend>{tr("Answers (select the correct one)")}</legend>
              {question.options.map((option, optionIndex) => (
                <div className="option-row" key={option.id}>
                  <input
                    type="radio"
                    name={`correct-${index}`}
                    aria-label={`${tr("Correct answer")} ${option.id}`}
                    checked={question.correctOptionId === option.id}
                    onChange={() =>
                      setQuestion(index, { correctOptionId: option.id })
                    }
                  />
                  <input
                    aria-label={`${tr("Answer")} ${option.id} ${tr("English")}`}
                    value={option.en}
                    onChange={(event) =>
                      setQuestion(index, {
                        options: question.options.map((item, i) =>
                          i === optionIndex
                            ? { ...item, en: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label={`${tr("Answer")} ${option.id} ${tr("Bangla")}`}
                    value={option.bn}
                    onChange={(event) =>
                      setQuestion(index, {
                        options: question.options.map((item, i) =>
                          i === optionIndex
                            ? { ...item, bn: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </fieldset>
            <div className="editor-grid">
              <label>
                {tr("Explanation after a wrong answer (English)")}
                <textarea
                  value={question.explanationEn ?? ""}
                  onChange={(event) =>
                    setQuestion(index, { explanationEn: event.target.value })
                  }
                />
              </label>
              <label>
                {tr("Explanation after a wrong answer (Bangla)")}
                <textarea
                  value={question.explanationBn ?? ""}
                  onChange={(event) =>
                    setQuestion(index, { explanationBn: event.target.value })
                  }
                />
              </label>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() =>
          update((current) => ({
            ...current,
            questions: [
              ...current.questions,
              {
                promptEn: "",
                promptBn: "",
                options: ["a", "b", "c"].map((id) => ({ id, en: "", bn: "" })),
                correctOptionId: "a",
                explanationEn: "",
                explanationBn: "",
                lesson: null,
              },
            ],
          }))
        }
      >
        {tr("Add question")}
      </button>
    </>
  );
}

function JsonTab({
  document,
  setDocument,
}: {
  document: CourseDocument;
  setDocument: (document: CourseDocument) => void;
}) {
  const [text, setText] = useState(JSON.stringify(document, null, 2));
  const [error, setError] = useState("");
  return (
    <>
      <p className="muted">
        {tr(
          "The whole course document. Apply to load your changes into the editor.",
        )}
      </p>
      <label>
        {tr("Course document (JSON)")}
        <textarea
          className="code-editor"
          rows={20}
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          try {
            const parsed = JSON.parse(text) as CourseDocument;
            if (
              !Array.isArray(parsed.lessons) ||
              !Array.isArray(parsed.questions)
            )
              throw new Error("lessons and questions must be lists");
            setDocument(parsed);
            setError("");
          } catch {
            setError(tr("The course document is not valid JSON."));
          }
        }}
      >
        {tr("Apply JSON")}
      </button>
    </>
  );
}

const PREVIEW_LABELS: Record<StepKind, { en: string; bn: string }> = {
  LEARN: { en: "You will learn", bn: "আপনি শিখবেন" },
  STEP: { en: "Step", bn: "ধাপ" },
  HAZARD: { en: "Hazard", bn: "ঝুঁকি" },
  REMEMBER: { en: "Remember", bn: "মনে রাখুন" },
};

/** The lesson as a learner sees it: its cards in order, then the checkpoint. */
function LessonPreview({
  document,
  lessonIndex,
  setLessonIndex,
}: {
  document: CourseDocument;
  lessonIndex: number;
  setLessonIndex: (index: number) => void;
}) {
  const [language, setLanguage] = useState<"en" | "bn">("bn");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const lesson = document.lessons[lessonIndex];
  const questions = document.questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.lesson === lessonIndex + 1);
  if (!lesson)
    return <p className="muted">{tr("Add a lesson to preview it.")}</p>;
  let stepNumber = 0;
  const text = (en: string, bn: string) =>
    language === "bn" ? bn || en : en || bn;
  return (
    <section className="lesson-preview" aria-label={tr("Learner preview")}>
      <div className="toolbar">
        <label>
          {tr("Lesson")}{" "}
          <select
            value={lessonIndex}
            onChange={(event) => {
              setLessonIndex(Number(event.target.value));
              setAnswers({});
              setChecked(false);
            }}
          >
            {document.lessons.map((item, index) => (
              <option key={index} value={index}>
                {index + 1}. {item.titleEn || tr("Untitled lesson")}
              </option>
            ))}
          </select>
        </label>
        <div className="locale-switch" aria-label={tr("Preview language")}>
          <button
            type="button"
            className={language === "bn" ? "active" : ""}
            onClick={() => setLanguage("bn")}
          >
            বাংলা
          </button>
          <button
            type="button"
            className={language === "en" ? "active" : ""}
            onClick={() => setLanguage("en")}
          >
            EN
          </button>
        </div>
      </div>
      <div className="phone-frame">
        <h3>{text(lesson.titleEn, lesson.titleBn)}</h3>
        {(lesson.steps ?? []).map((step, index) => {
          if (step.kind === "STEP") stepNumber += 1;
          const label =
            PREVIEW_LABELS[step.kind][language] +
            (step.kind === "STEP" ? ` ${stepNumber}` : "");
          return (
            <article
              key={index}
              className={`learner-card card-${step.kind.toLowerCase()}`}
            >
              <header>
                {step.kind === "HAZARD" && (
                  <span aria-hidden="true" className="hazard-icon">
                    ⚠
                  </span>
                )}
                <strong>{label}</strong>
              </header>
              {step.image && step.imagePreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={step.imagePreviewUrl}
                  alt={text(step.altEn ?? "", step.altBn ?? "")}
                  referrerPolicy="no-referrer"
                />
              )}
              <p>{text(step.en, step.bn)}</p>
            </article>
          );
        })}
        <article className="learner-card card-checkpoint">
          <header>
            <strong>
              {language === "bn" ? "পাঠের প্রশ্ন" : "Lesson check"}
            </strong>
          </header>
          {questions.length === 0 ? (
            <p className="muted">
              {tr(
                document.isSafetyCritical
                  ? "No checkpoint questions yet: this safety-critical lesson cannot be finished."
                  : "No checkpoint: the lesson is done once opened.",
              )}
            </p>
          ) : (
            questions.map(({ question, index }) => {
              const chosen = answers[index];
              const right = chosen === question.correctOptionId;
              return (
                <fieldset key={index} className="preview-question">
                  <legend>{text(question.promptEn, question.promptBn)}</legend>
                  {question.options.map((option) => (
                    <label key={option.id} className="checkbox">
                      <input
                        type="radio"
                        name={`preview-${index}`}
                        checked={chosen === option.id}
                        onChange={() => {
                          setAnswers({ ...answers, [index]: option.id });
                          setChecked(false);
                        }}
                      />
                      {text(option.en, option.bn)}
                    </label>
                  ))}
                  {checked && chosen && (
                    <p className={right ? "success" : "error"}>
                      {right
                        ? language === "bn"
                          ? "সঠিক"
                          : "Correct"
                        : text(
                            question.explanationEn ?? "",
                            question.explanationBn ?? "",
                          )}
                    </p>
                  )}
                </fieldset>
              );
            })
          )}
          {questions.length > 0 && (
            <button type="button" onClick={() => setChecked(true)}>
              {language === "bn" ? "উত্তর যাচাই করুন" : "Check answers"}
            </button>
          )}
        </article>
      </div>
    </section>
  );
}
