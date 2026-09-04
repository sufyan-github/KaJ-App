import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AttendanceAdminController } from "./attendance-admin.controller";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  imports: [AdminAuthModule, NotificationsModule],
  controllers: [AttendanceController, AttendanceAdminController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
