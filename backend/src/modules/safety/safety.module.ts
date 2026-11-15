import { Global, Module } from "@nestjs/common";

import { UserBlocksService } from "./user-blocks.service";

/** Global so every module enforces blocks through the same check. */
@Global()
@Module({
  providers: [UserBlocksService],
  exports: [UserBlocksService],
})
export class SafetyModule {}
