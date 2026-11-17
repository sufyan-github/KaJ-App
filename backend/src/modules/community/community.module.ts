import { Module } from "@nestjs/common";

import { ChatModule } from "../chat/chat.module";
import { ExpertsModule } from "../experts/experts.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

/** P3: KAAJ Community — groups, group sessions, announcements. */
@Module({
  imports: [ChatModule, ExpertsModule, NotificationsModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class CommunityModule {}
