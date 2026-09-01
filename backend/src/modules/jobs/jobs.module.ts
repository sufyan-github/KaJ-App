import { Module } from "@nestjs/common";

import { AvailabilityModule } from "../availability/availability.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [AvailabilityModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
