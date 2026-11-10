import {
  attemptAllowance,
  CERTIFICATE_CODE_ALPHABET,
  CERTIFICATE_CODE_LENGTH,
  generateCertificateCode,
  generateUniqueCertificateCode,
  gradeAttempt,
  normalizeCertificateCode,
  sampleQuestionIds,
  shuffleOptionsForAttempt,
  TrainingAnswerError,
  type GradableQuestion,
} from "../src/modules/training/training.rules";

function question(id: string, correctOptionId = "a"): GradableQuestion {
  return {
    id,
    correctOptionId,
    explanationEn: `why ${id}`,
    explanationBn: `কেন ${id}`,
    options: ["a", "b", "c"].map((option) => ({
      id: option,
      en: option,
      bn: option,
    })),
  };
}

describe("training grading", () => {
  const served = [question("q1"), question("q2", "b"), question("q3", "c")];

  it("scores against the served questions and rounds the percentage", () => {
    const graded = gradeAttempt(
      served,
      [
        { questionId: "q1", optionId: "a" },
        { questionId: "q2", optionId: "b" },
        { questionId: "q3", optionId: "a" },
      ],
      70,
    );
    expect(graded.correctCount).toBe(2);
    expect(graded.scorePct).toBe(67);
    expect(graded.passed).toBe(false);
    expect(graded.results).toEqual([
      expect.objectContaining({ questionId: "q1", correct: true }),
      expect.objectContaining({
        questionId: "q2",
        correct: true,
        correctOptionId: "b",
      }),
      expect.objectContaining({
        questionId: "q3",
        correct: false,
        correctOptionId: "c",
        explanationEn: "why q3",
        explanationBn: "কেন q3",
      }),
    ]);
  });

  it("passes exactly at the pass mark and counts unanswered as wrong", () => {
    const four = [question("1"), question("2"), question("3"), question("4")];
    const graded = gradeAttempt(
      four,
      ["1", "2", "3"].map((id) => ({ questionId: id, optionId: "a" })),
      75,
    );
    expect(graded.scorePct).toBe(75);
    expect(graded.passed).toBe(true);
    expect(gradeAttempt(four, [], 75)).toMatchObject({
      scorePct: 0,
      passed: false,
    });
  });

  it.each([
    [[{ questionId: "other", optionId: "a" }], "unknown question"],
    [
      [
        { questionId: "q1", optionId: "a" },
        { questionId: "q1", optionId: "b" },
      ],
      "only once",
    ],
    [[{ questionId: "q1", optionId: "z" }], "unknown option"],
  ])("rejects invalid answers %#", (answers, message) => {
    expect(() => gradeAttempt(served, answers, 70)).toThrow(
      TrainingAnswerError,
    );
    expect(() => gradeAttempt(served, answers, 70)).toThrow(message);
  });

  it("never passes an empty question set", () => {
    expect(gradeAttempt([], [], 1).passed).toBe(false);
  });
});

describe("training attempt limit", () => {
  const now = new Date("2026-11-11T12:00:00.000Z");
  const hoursAgo = (hours: number) =>
    new Date(now.getTime() - hours * 3_600_000);

  it("allows three failures per rolling day", () => {
    expect(attemptAllowance([], now)).toEqual({
      attemptsLeftToday: 3,
      nextAttemptAt: null,
    });
    expect(attemptAllowance([hoursAgo(1), hoursAgo(2)], now)).toEqual({
      attemptsLeftToday: 1,
      nextAttemptAt: null,
    });
  });

  it("blocks after three failures until the oldest relevant one is a day old", () => {
    const allowance = attemptAllowance(
      [hoursAgo(1), hoursAgo(5), hoursAgo(20)],
      now,
    );
    expect(allowance.attemptsLeftToday).toBe(0);
    expect(allowance.nextAttemptAt?.toISOString()).toBe(
      "2026-11-11T16:00:00.000Z",
    );
  });

  it("ignores failures older than the window and uses the third most recent", () => {
    expect(
      attemptAllowance([hoursAgo(30), hoursAgo(2), hoursAgo(3)], now),
    ).toEqual({ attemptsLeftToday: 1, nextAttemptAt: null });
    const allowance = attemptAllowance(
      [hoursAgo(23), hoursAgo(1), hoursAgo(2), hoursAgo(3)],
      now,
    );
    expect(allowance.nextAttemptAt?.toISOString()).toBe(
      "2026-11-12T09:00:00.000Z",
    );
  });
});

describe("certificate public codes", () => {
  it("uses the unambiguous alphabet and fixed length", () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generateCertificateCode();
      expect(code).toHaveLength(CERTIFICATE_CODE_LENGTH);
      expect(
        [...code].every((char) => CERTIFICATE_CODE_ALPHABET.includes(char)),
      ).toBe(true);
    }
    expect(CERTIFICATE_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it("discards biased random bytes instead of wrapping them", () => {
    let call = 0;
    const bytes = (size: number) => Buffer.alloc(size, call++ === 0 ? 255 : 0);
    expect(generateCertificateCode(bytes)).toBe(
      CERTIFICATE_CODE_ALPHABET[0]!.repeat(CERTIFICATE_CODE_LENGTH),
    );
    expect(call).toBe(2);
  });

  it("retries on a collision and gives up after the limit", async () => {
    const codes = ["AAAAAAAAAA", "BBBBBBBBBB"];
    const taken = new Set(["AAAAAAAAAA"]);
    await expect(
      generateUniqueCertificateCode(
        async (code) => taken.has(code),
        () => codes.shift()!,
      ),
    ).resolves.toBe("BBBBBBBBBB");
    await expect(
      generateUniqueCertificateCode(
        async () => true,
        () => "CCCCCCCCCC",
        3,
      ),
    ).rejects.toThrow("unique certificate code");
  });

  it("normalizes lookups and rejects anything outside the code format", () => {
    expect(normalizeCertificateCode(" abcdefghjk ")).toBe("ABCDEFGHJK");
    expect(normalizeCertificateCode("ABCDEFGHJ0")).toBeNull();
    expect(normalizeCertificateCode("SHORT")).toBeNull();
  });
});

describe("question selection", () => {
  it("samples without replacement and never more than the bank", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `q${index}`);
    const picked = sampleQuestionIds(ids, 10);
    expect(picked).toHaveLength(10);
    expect(new Set(picked).size).toBe(10);
    expect(sampleQuestionIds(ids.slice(0, 3), 10)).toHaveLength(3);
  });

  it("shuffles options stably within an attempt", () => {
    const options = ["a", "b", "c", "d"].map((id) => ({ id }));
    const first = shuffleOptionsForAttempt(options, "attempt-1", "q1");
    expect(shuffleOptionsForAttempt(options, "attempt-1", "q1")).toEqual(first);
    expect(first.map((option) => option.id).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    const orders = new Set(
      Array.from({ length: 20 }, (_, index) =>
        shuffleOptionsForAttempt(options, `attempt-${index}`, "q1")
          .map((option) => option.id)
          .join(""),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
