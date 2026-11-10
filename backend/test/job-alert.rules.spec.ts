import {
  alertMatchesJob,
  normalizeAlertFilters,
  sameAlertFilters,
} from "../src/modules/job-alerts/job-alert.rules";

const job = {
  category_id: "cat",
  subcategory_id: "sub",
  location_id: "loc",
  skills: [{ skill_id: "s1" }, { skill_id: "s2" }],
};

describe("job alert matching", () => {
  it("matches only when every set filter matches", () => {
    expect(alertMatchesJob({ categoryId: "cat" }, job)).toBe(true);
    expect(alertMatchesJob({ categoryId: "sub" }, job)).toBe(true);
    expect(alertMatchesJob({ skillId: "s2", locationId: "loc" }, job)).toBe(
      true,
    );
    expect(
      alertMatchesJob(
        { categoryId: "cat", skillId: "s1", locationId: "loc" },
        job,
      ),
    ).toBe(true);
    expect(alertMatchesJob({ categoryId: "cat", locationId: "x" }, job)).toBe(
      false,
    );
    expect(alertMatchesJob({ skillId: "s3" }, job)).toBe(false);
    expect(alertMatchesJob({ categoryId: "other" }, job)).toBe(false);
  });

  it("never matches an alert without filters", () => {
    expect(alertMatchesJob({}, job)).toBe(false);
  });

  it("normalizes stored JSON and compares filters exactly", () => {
    expect(
      normalizeAlertFilters({ skillId: "s1", extra: 1, locationId: "" }),
    ).toEqual({ skillId: "s1" });
    expect(normalizeAlertFilters(null)).toEqual({});
    expect(normalizeAlertFilters(["x"])).toEqual({});
    expect(
      sameAlertFilters(
        { skillId: "s1" },
        normalizeAlertFilters({ skillId: "s1" }),
      ),
    ).toBe(true);
    expect(
      sameAlertFilters({ skillId: "s1" }, { skillId: "s1", locationId: "l" }),
    ).toBe(false);
  });
});
