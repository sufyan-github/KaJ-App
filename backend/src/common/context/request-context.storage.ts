import { AsyncLocalStorage } from "node:async_hooks";

import { Injectable } from "@nestjs/common";

interface RequestContext {
  requestId: string;
}

@Injectable()
export class RequestContextStorage {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run(requestId: string, callback: () => void): void {
    this.storage.run({ requestId }, callback);
  }

  getRequestId(): string {
    return this.storage.getStore()?.requestId ?? "request-context-unavailable";
  }
}
