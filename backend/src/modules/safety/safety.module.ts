import { Global, Module } from "@nestjs/common";

import { EngagementService } from "./engagement.service";
import { UserBlocksService } from "./user-blocks.service";

/** Global so every module enforces blocks through the same check. */
@Global()
@Module({
  providers: [EngagementService, UserBlocksService],
  exports: [EngagementService, UserBlocksService],
})
export class SafetyModule {}
