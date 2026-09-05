import { SmsPort } from "./sms.port";

export function selectSmsAdapter(
  provider: string,
  consoleAdapter: SmsPort,
  disabledAdapter: SmsPort,
  bdappsAdapter?: SmsPort,
): SmsPort {
  if (provider === "console") return consoleAdapter;
  if (provider === "disabled") return disabledAdapter;
  if (provider === "bdapps" && bdappsAdapter) return bdappsAdapter;
  throw new Error(`Unsupported SMS provider: ${provider}`);
}
