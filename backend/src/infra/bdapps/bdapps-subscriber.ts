export function toBdappsSubscriberId(phoneE164: string): string {
  if (!/^\+8801[3-9]\d{8}$/.test(phoneE164)) {
    throw new Error("A valid Bangladesh mobile number is required.");
  }
  return `tel:${phoneE164.slice(1)}`;
}

export function fromBdappsSubscriberId(subscriberId: string): string | null {
  if (!/^tel:8801[3-9]\d{8}$/.test(subscriberId)) return null;
  return `+${subscriberId.slice(4)}`;
}
