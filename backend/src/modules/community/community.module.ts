import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { ChatModule } from "../chat/chat.module";
import { ExpertsModule } from "../experts/experts.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CommunityAdminController } from "./community-admin.controller";
import { CommunityAdminService } from "./community-admin.service";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

/** P3: KAAJ Community — groups, group sessions, announcements. */
@Module({
  imports: [AdminAuthModule, ChatModule, ExpertsModule, NotificationsModule],
  controllers: [GroupsController, CommunityAdminController],
  providers: [GroupsService, CommunityAdminService],
  exports: [GroupsService],
})
export class CommunityModule {}
