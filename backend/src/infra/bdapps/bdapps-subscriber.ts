const REAL_SUBSCRIBER_PATTERN = /^tel:8801[3-9]\d{8}$/;
// BDApps may return a masked subscriber id (for example `tel:B%3C4ZyPUKdG...==`)
// depending on how the application is provisioned. Both forms are opaque here.
const SUBSCRIBER_PATTERN = /^tel:[A-Za-z0-9%+/=._-]{8,160}$/;

export function toBdappsSubscriberId(phoneE164: string): string {
  if (!/^\+8801[3-9]\d{8}$/.test(phoneE164)) {
    throw new Error("A valid Bangladesh mobile number is required.");
  }
  return `tel:${phoneE164.slice(1)}`;
}

export function fromBdappsSubscriberId(subscriberId: string): string | null {
  if (!REAL_SUBSCRIBER_PATTERN.test(subscriberId)) return null;
  return `+${subscriberId.slice(4)}`;
}

export function isBdappsSubscriberId(value: unknown): value is string {
  return typeof value === "string" && SUBSCRIBER_PATTERN.test(value);
}

/** Uses the carrier-issued (possibly masked) id when stored, else `tel:<msisdn>`. */
export function subscriberIdFor(
  phoneE164: string,
  storedSubscriberId: string | null | undefined,
): string {
  return isBdappsSubscriberId(storedSubscriberId)
    ? storedSubscriberId
    : toBdappsSubscriberId(phoneE164);
}
