import { Module } from "@nestjs/common";

import { VerificationModule } from "../verification/verification.module";
import { MentorsController } from "./mentors.controller";
import { MentorsService } from "./mentors.service";

@Module({
  imports: [VerificationModule],
  controllers: [MentorsController],
  providers: [MentorsService],
  exports: [MentorsService],
})
export class MentorsModule {}
