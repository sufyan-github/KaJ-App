import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";

export interface ChatEvent {
  conversationId: string;
  participantUserIds: string[];
  message: Record<string, unknown>;
}

@Injectable()
export class ChatEvents {
  readonly messages = new Subject<ChatEvent>();
}
