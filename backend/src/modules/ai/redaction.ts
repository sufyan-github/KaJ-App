/**
 * PII redaction for anything sent to the model (P4 privacy rule). Covers
 * phone numbers, email addresses, NID / long identity numbers, exact
 * addresses (house / road / flat / plot numbers, postcodes) and map
 * coordinates, in English and Bangla, with ASCII or Bangla digits.
 * Area names (Boalia, Shaheb Bazar) are kept: they are not exact.
 *
 * Names are NOT detected: the prompts never include other people's names
 * (only the requesting user's own text), and the system prompts tell the
 * model not to repeat personal details.
 */

const D = "[0-9০-৯]";
const NOT_D_BEFORE = "(?<![0-9০-৯])";
const NOT_D_AFTER = "(?![0-9০-৯])";
const LETTER = "A-Za-z\\u0980-\\u09FF";

const ADDRESS_WORDS = [
  "house",
  "holding",
  "flat",
  "apartment",
  "apt",
  "plot",
  "road",
  "rd",
  "lane",
  "block",
  "sector",
  "বাড়ি",
  "বাসা",
  "হোল্ডিং",
  "ফ্ল্যাট",
  "প্লট",
  "রোড",
  "সড়ক",
  "লেন",
  "গলি",
  "ব্লক",
  "সেক্টর",
].join("|");
const NUMBER_WORD = "(?:no\\.?|number|#|নং|নম্বর)";

interface Rule {
  label: string;
  pattern: RegExp;
}

// Order matters: specific rules first, the generic long-number rule last.
const RULES: Rule[] = [
  {
    label: "[EMAIL]",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    label: "[LOCATION]",
    pattern: /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g,
  },
  {
    label: "[NID]",
    pattern: new RegExp(
      `(?:\\bN\\.?I\\.?D\\b|national\\s+id(?:entity)?(?:\\s+card)?|এনআইডি|জাতীয়\\s*পরিচয়\\s*পত্র)(?:\\s*${NUMBER_WORD})?\\s*[:#-]?\\s*${D}(?:[\\s-]?${D}){5,}`,
      "giu",
    ),
  },
  {
    // Bangladeshi mobile numbers: 01[3-9]XXXXXXXX, optional +88 / 0088.
    label: "[PHONE]",
    pattern: new RegExp(
      `${NOT_D_BEFORE}(?:(?:\\+|00)?(?:88|৮৮)[\\s.-]?)?[0০]?[1১][3-9৩-৯](?:[\\s.-]?${D}){8}${NOT_D_AFTER}`,
      "gu",
    ),
  },
  {
    // "House 12", "Road no. 5/A", "বাড়ি নং ১২", "রোড-৩".
    label: "[ADDRESS]",
    pattern: new RegExp(
      `(?<![${LETTER}])(?:${ADDRESS_WORDS})\\.?\\s*${NUMBER_WORD}?\\s*[:#-]?\\s*${D}+(?:\\s*[/-]\\s*[0-9০-৯A-Za-z]+)?`,
      "giu",
    ),
  },
  {
    // "১২ নং রোড", "12 no. road".
    label: "[ADDRESS]",
    pattern: new RegExp(
      `${NOT_D_BEFORE}${D}+\\s*${NUMBER_WORD}\\s*(?:${ADDRESS_WORDS})`,
      "giu",
    ),
  },
  {
    label: "[ADDRESS]",
    pattern: new RegExp(
      `(?:post\\s*code|postcode|zip|পোস্ট\\s*কোড)\\s*[:#-]?\\s*${D}{4}`,
      "giu",
    ),
  },
  {
    // "Dhaka-1207", "রাজশাহী-৬০০০".
    label: "[ADDRESS]",
    pattern: new RegExp(`(?<=[${LETTER}])\\s*-\\s*${D}{4}${NOT_D_AFTER}`, "gu"),
  },
  {
    // Any other run of 10+ digits (NID, birth registration, bank account).
    label: "[ID_NUMBER]",
    pattern: new RegExp(
      `${NOT_D_BEFORE}${D}(?:-?${D}){9,}${NOT_D_AFTER}`,
      "gu",
    ),
  },
];

export interface Redacted {
  text: string;
  redactions: number;
}

export function redact(input: string | null | undefined): Redacted {
  let text = (input ?? "").replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
    "",
  );
  let redactions = 0;
  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match) => {
      redactions += 1;
      // "Dhaka-1207" keeps the city: only the dash and code are replaced.
      return rule.label === "[ADDRESS]" && /^\s*-/.test(match)
        ? ` ${rule.label}`
        : rule.label;
    });
  }
  return { text: text.trim(), redactions };
}

/** Redacts and returns only the text (null stays null). */
export function redactText(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  return redact(input).text;
}
