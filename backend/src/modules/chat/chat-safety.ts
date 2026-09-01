const BD_PHONE_PATTERN = /(?:880|00880|0)?1[3-9]\d{8}/;
const PAYMENT_PATTERN =
  /(?:বিকাশ|নগদ|রকেট|bkash|nagad|rocket)[^\n]{0,32}\d{8,14}/i;

export function needsPaymentSafetyWarning(body: string): boolean {
  return (
    BD_PHONE_PATTERN.test(body.replace(/[+\s()-]/g, "")) ||
    PAYMENT_PATTERN.test(body)
  );
}
