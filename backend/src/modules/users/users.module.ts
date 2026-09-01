import { Module } from "@nestjs/common";

import { ProfilesController } from "./profiles.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [ProfilesController, UsersController],
  providers: [UsersService],
})
export class UsersModule {}
