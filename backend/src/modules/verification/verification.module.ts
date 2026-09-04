import { Module } from "@nestjs/common";

import { VerificationController } from "./verification.controller";
import { VerificationPurgeRunner } from "./verification-purge.runner";
import { VerificationService } from "./verification.service";

@Module({
  controllers: [VerificationController],
  providers: [VerificationPurgeRunner, VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
