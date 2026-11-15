import { Module } from "@nestjs/common";

import {
  ACCOUNT_MODERATION_READER,
  PrismaAccountModerationReader,
} from "../../common/guards/account-moderation.reader";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ChatController } from "./chat.controller";
import { ChatEvents } from "./chat.events";
import { ChatGateway } from "./chat.gateway";
import { ChatService } from "./chat.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ChatController],
  providers: [
    ChatEvents,
    ChatGateway,
    ChatService,
    PrismaAccountModerationReader,
    {
      provide: ACCOUNT_MODERATION_READER,
      useExisting: PrismaAccountModerationReader,
    },
  ],
  exports: [ChatService],
})
export class ChatModule {}
