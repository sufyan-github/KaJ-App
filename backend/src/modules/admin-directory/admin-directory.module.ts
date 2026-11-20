import { Module } from "@nestjs/common";

import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminDirectoryController } from "./admin-directory.controller";
import { AdminDirectoryService } from "./admin-directory.service";

@Module({
  controllers: [AdminDirectoryController],
  imports: [AdminAuthModule, PrismaModule],
  providers: [AdminDirectoryService],
})
export class AdminDirectoryModule {}
