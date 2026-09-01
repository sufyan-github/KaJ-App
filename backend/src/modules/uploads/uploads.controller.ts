import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { CompleteUploadDto, SignUploadDto } from "./dto/upload.dto";
import { UploadsService } from "./uploads.service";

@ApiTags("uploads")
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("sign")
  @Policy(Policies.authenticated())
  sign(@CurrentUser() claims: AccessTokenClaims, @Body() body: SignUploadDto) {
    return this.uploads.sign(claims.sub, body);
  }

  @Post("complete")
  @Policy(Policies.authenticated())
  complete(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CompleteUploadDto,
  ) {
    return this.uploads.complete(claims.sub, body);
  }

  @Get("documents/:id/download")
  @Policy(Policies.authenticated())
  downloadDocument(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.uploads.createDocumentDownload(claims.sub, id);
  }
}
