import { SmsPort } from "./sms.port";

export function selectSmsAdapter(
  provider: string,
  consoleAdapter: SmsPort,
  disabledAdapter?: SmsPort,
): SmsPort {
  if (provider === "console") return consoleAdapter;
  if (provider === "disabled" && disabledAdapter) return disabledAdapter;
  throw new Error(`Unsupported SMS provider: ${provider}`);
}
