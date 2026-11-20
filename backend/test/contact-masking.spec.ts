import {
  CONTACT_HIDDEN,
  maskContactDetails,
} from "../src/modules/chat/chat-safety";

/** API-8: contact details are masked in first-contact text. */
describe("maskContactDetails", () => {
  it.each([
    ["Call me 01812349012", `Call me ${CONTACT_HIDDEN}`],
    ["WhatsApp +8801812349012 please", `WhatsApp ${CONTACT_HIDDEN} please`],
    ["ফোন ০১৮১২-৩৪৯০১২ দিন", `ফোন ${CONTACT_HIDDEN} দিন`],
    ["018 1234 9012", CONTACT_HIDDEN],
    ["mail c@example.com.", `mail ${CONTACT_HIDDEN}.`],
    ["wa.me/8801812349012", CONTACT_HIDDEN],
    ["https://facebook.com/someone ok", `${CONTACT_HIDDEN} ok`],
    ["telegram @rahima_k", `telegram ${CONTACT_HIDDEN}`],
  ])("masks %p", (input, expected) => {
    expect(maskContactDetails(input)).toBe(expected);
  });

  it.each([
    "I want to learn pricing for 3 months, starting 2026-11-20 10:00.",
    "Budget 15000 taka for 12 pieces.",
    "Nakshi kantha, 2 metres.",
  ])("leaves ordinary text alone: %p", (input) => {
    expect(maskContactDetails(input)).toBe(input);
  });
});
