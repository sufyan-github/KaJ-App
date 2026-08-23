export const PUSH_PORT = Symbol("PUSH_PORT");

export interface PushMessage {
  bodyKey: string;
  data: Readonly<Record<string, string>>;
  dedupeKey: string;
  titleKey: string;
  userId: string;
}

export interface PushDelivery {
  accepted: boolean;
  messageId?: string;
}

export interface PushPort {
  send(message: PushMessage): Promise<PushDelivery>;
}
