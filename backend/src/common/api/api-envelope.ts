export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    serverTime: string;
  };
}

export interface ApiErrorAction {
  target?: string;
  type: string;
}

export interface ApiErrorDescriptor {
  action: ApiErrorAction | null;
  code: string;
  details: unknown[];
  field: string | null;
  message: string;
  messageKey: string;
  retryable: boolean;
}

export interface ApiErrorEnvelope {
  error: ApiErrorDescriptor & { requestId: string };
}
