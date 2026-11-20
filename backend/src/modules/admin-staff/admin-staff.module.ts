import { Module } from "@nestjs/common";

import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminStaffController } from "./admin-staff.controller";
import { AdminStaffService } from "./admin-staff.service";

@Module({
  controllers: [AdminStaffController],
  imports: [AdminAuthModule, PrismaModule],
  providers: [AdminStaffService],
})
export class AdminStaffModule {}
