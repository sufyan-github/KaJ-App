import { Module } from "@nestjs/common";

import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminOpsController } from "./admin-ops.controller";
import { AdminOpsService } from "./admin-ops.service";

@Module({
  controllers: [AdminOpsController],
  imports: [AdminAuthModule, PrismaModule],
  providers: [AdminOpsService],
})
export class AdminOpsModule {}
