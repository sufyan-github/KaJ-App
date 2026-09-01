import { needsPaymentSafetyWarning } from "../src/modules/chat/chat-safety";

describe("chat payment safety heuristic", () => {
  it.each([
    "+8801712345678",
    "01712-345-678",
    "বিকাশ করুন 01712345678",
    "send to bkash 1712345678",
  ])("warns for a Bangladesh phone or payment-number pattern: %s", (body) => {
    expect(needsPaymentSafetyWarning(body)).toBe(true);
  });

  it("does not warn for ordinary job discussion", () => {
    expect(needsPaymentSafetyWarning("আগামীকাল সকাল ৯টায় আসব।")).toBe(false);
  });
});
