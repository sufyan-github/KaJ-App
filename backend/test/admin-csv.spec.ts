import { csvCell } from "../src/modules/admin-ops/admin-ops.service";

describe("audit export CSV cells", () => {
  it("leaves plain text alone and empties null", () => {
    expect(csvCell("ADMIN_LOGIN_SUCCEEDED")).toBe("ADMIN_LOGIN_SUCCEEDED");
    expect(csvCell(null)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it("defuses spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});
