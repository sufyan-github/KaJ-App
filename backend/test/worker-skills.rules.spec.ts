import {
  MAX_WORKER_SKILLS,
  validateWorkerSkillIds,
} from "../src/modules/users/worker-skills.rules";

describe("worker skill rules", () => {
  it("accepts up to fifteen unique skills", () => {
    expect(() =>
      validateWorkerSkillIds(
        Array.from(
          { length: MAX_WORKER_SKILLS },
          (_, index) => `skill-${index}`,
        ),
      ),
    ).not.toThrow();
  });

  it("rejects more than fifteen skills", () => {
    expect(() =>
      validateWorkerSkillIds(
        Array.from(
          { length: MAX_WORKER_SKILLS + 1 },
          (_, index) => `skill-${index}`,
        ),
      ),
    ).toThrow("at most 15");
  });

  it("rejects duplicate skills", () => {
    expect(() => validateWorkerSkillIds(["skill-a", "skill-a"])).toThrow(
      "more than once",
    );
  });
});
