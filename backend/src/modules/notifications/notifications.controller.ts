import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { NotificationPreferenceDto } from "./dto/notification-preference.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Policy(Policies.authenticated())
  list(@CurrentUser() claims: AccessTokenClaims) {
    return this.notifications.list(claims.sub);
  }

  @Post(":id/read")
  @Policy(Policies.authenticated())
  markRead(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.notifications.markRead(claims.sub, id);
  }

  @Post("read-all")
  @Policy(Policies.authenticated())
  markAllRead(@CurrentUser() claims: AccessTokenClaims) {
    return this.notifications.markAllRead(claims.sub);
  }

  @Get("preferences")
  @Policy(Policies.authenticated())
  preferences(@CurrentUser() claims: AccessTokenClaims) {
    return this.notifications.preferences(claims.sub);
  }

  @Put("preferences")
  @Policy(Policies.authenticated())
  setPreference(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() input: NotificationPreferenceDto,
  ) {
    return this.notifications.setPreference(claims.sub, input);
  }
}
