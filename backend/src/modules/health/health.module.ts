import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { ReadinessService } from "./readiness.service";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { RedisModule } from "../../infra/redis/redis.module";

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}
