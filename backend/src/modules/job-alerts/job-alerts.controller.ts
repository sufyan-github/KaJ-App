import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { CreateJobAlertDto } from "./dto/job-alert.dto";
import { JobAlertsService } from "./job-alerts.service";

@ApiTags("job-alerts")
@Controller("me/job-alerts")
export class JobAlertsController {
  constructor(private readonly alerts: JobAlertsService) {}

  @Get()
  @Policy(Policies.authenticated())
  list(@CurrentUser() claims: AccessTokenClaims) {
    return this.alerts.list(claims.sub);
  }

  @Post()
  @Policy(Policies.authenticated())
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateJobAlertDto,
  ) {
    return this.alerts.create(claims.sub, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy(Policies.authenticated())
  async remove(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.alerts.remove(claims.sub, id);
  }
}
