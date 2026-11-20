const BD_PHONE_PATTERN = /(?:880|00880|0)?1[3-9]\d{8}/;
const PAYMENT_PATTERN =
  /(?:বিকাশ|নগদ|রকেট|bkash|nagad|rocket)[^\n]{0,32}\d{8,14}/i;

export function needsPaymentSafetyWarning(body: string): boolean {
  return (
    BD_PHONE_PATTERN.test(body.replace(/[+\s()-]/g, "")) ||
    PAYMENT_PATTERN.test(body)
  );
}

/** What replaces a contact detail before a request is accepted. */
export const CONTACT_HIDDEN = "[যোগাযোগ লুকানো / contact hidden]";

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
// A Bangladeshi mobile number, with or without +88, written with spaces,
// dots, dashes or brackets between the digits.
const PHONE_IN_TEXT =
  /(?<!\d)(?:\+?\s*88[\s.()-]*)?0?\s*1[3-9](?:[\s.()-]?\d){8}(?!\d)/g;
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const LINK_IN_TEXT =
  /(?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com|t\.me|telegram\.me|m\.me|facebook\.com|fb\.com|instagram\.com|imo\.im)\/\S*/gi;
const HANDLE_IN_TEXT = /(?<![\w.@])@[A-Za-z0-9_.]{3,}/g;

/**
 * API-8: first-contact text (introductions, collaboration requests) shows no
 * phone number, e-mail, messenger link or @handle to the other person until
 * they accept. The stored text is unchanged; only what is shown is masked.
 */
export function maskContactDetails(text: string): string {
  // Bangla digits map one to one onto ASCII, so positions stay the same.
  const ascii = text.replace(/[০-৯]/g, (digit) =>
    String(BANGLA_DIGITS.indexOf(digit)),
  );
  const spans: Array<[number, number]> = [];
  for (const pattern of [
    LINK_IN_TEXT,
    EMAIL_IN_TEXT,
    PHONE_IN_TEXT,
    HANDLE_IN_TEXT,
  ])
    for (const match of ascii.matchAll(pattern))
      spans.push([match.index!, match.index! + match[0].length]);
  if (!spans.length) return text;
  spans.sort((first, second) => first[0] - second[0]);
  let result = "";
  let at = 0;
  for (const [start, end] of spans) {
    if (end <= at) continue;
    result += text.slice(at, Math.max(at, start));
    if (start >= at) result += CONTACT_HIDDEN;
    at = end;
  }
  return result + text.slice(at);
}
