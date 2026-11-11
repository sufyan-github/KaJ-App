export type CarrierSubscriptionStatus =
  "REGISTERED" | "UNREGISTERED" | "CHARGE_PENDING";

const unregisteredStatuses = new Set([
  "UNREGISTERED",
  "UNSUBSCRIBED",
  "NOT REGISTERED",
  "EXPIRED",
  "CANCELLED",
]);
const chargePendingStatuses = new Set([
  "PENDING",
  "CHARGE",
  "PENDING CHARGE",
  "CHARGE PENDING",
]);

/**
 * Normalizes BDApps `subscriptionStatus` values (getStatus, verify, notification,
 * gateway-forwarded events). Unknown values return null so callers can fail closed.
 */
export function normalizeCarrierStatus(
  value: unknown,
): CarrierSubscriptionStatus | null {
  if (typeof value !== "string") return null;
  const status = value
    .trim()
    .toUpperCase()
    .replace(/\.+$/u, "")
    .replace(/[_\s]+/gu, " ");
  if (status === "REGISTERED") return "REGISTERED";
  if (unregisteredStatuses.has(status)) return "UNREGISTERED";
  if (chargePendingStatuses.has(status)) return "CHARGE_PENDING";
  return null;
}
