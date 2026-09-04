import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { RiskAdminController } from "./risk-admin.controller";
import { RiskScanRunner } from "./risk-scan.runner";
import { RiskService } from "./risk.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [RiskAdminController],
  providers: [RiskScanRunner, RiskService],
  exports: [RiskService],
})
export class RiskModule {}
