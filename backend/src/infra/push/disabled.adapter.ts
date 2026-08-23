import { Injectable } from "@nestjs/common";

import { PushDelivery, PushMessage, PushPort } from "./push.port";

@Injectable()
export class DisabledPushAdapter implements PushPort {
  async send(_message: PushMessage): Promise<PushDelivery> {
    throw new Error("Push delivery is not configured");
  }
}
