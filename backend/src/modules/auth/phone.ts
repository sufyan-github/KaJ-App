export function normalizeBangladeshPhone(phone: string): string | null {
  const compact = phone.replace(/[\s()-]/g, "");
  let national: string;

  if (compact.startsWith("+880")) national = `0${compact.slice(4)}`;
  else if (compact.startsWith("880")) national = `0${compact.slice(3)}`;
  else national = compact;

  if (!/^01[3-9]\d{8}$/.test(national)) return null;
  return `+88${national}`;
}
