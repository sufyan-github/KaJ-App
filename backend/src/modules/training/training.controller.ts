import { createHash } from "node:crypto";

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AUTH_RATE_LIMITER, AuthRateLimiter } from "../auth/auth-rate-limiter";
import { AccessTokenClaims } from "../auth/auth-token.service";
import {
  CourseListQueryDto,
  SubmitCheckpointDto,
  SubmitTrainingAttemptDto,
} from "./dto/training.dto";
import { TrainingAttemptsService } from "./training-attempts.service";
import { TrainingCheckpointsService } from "./training-checkpoints.service";
import { TrainingCertificatesService } from "./training-certificates.service";
import { TrainingCoursesService } from "./training-courses.service";
import { certificateLookupRateLimitError } from "./training.errors";

const CERTIFICATE_LOOKUPS_PER_IP = 60;
const CERTIFICATE_LOOKUP_WINDOW_SECONDS = 60;

@ApiTags("training")
@Controller()
export class TrainingController {
  constructor(
    private readonly courses: TrainingCoursesService,
    private readonly attempts: TrainingAttemptsService,
    private readonly certificates: TrainingCertificatesService,
    private readonly checkpoints: TrainingCheckpointsService,
    @Inject(AUTH_RATE_LIMITER) private readonly rateLimiter: AuthRateLimiter,
  ) {}

  @Get("training/courses")
  @Policy(Policies.authenticated())
  listCourses(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: CourseListQueryDto,
  ) {
    return this.courses.list(claims.sub, query.scope ?? "mine");
  }

  @Get("training/courses/:id")
  @Policy(Policies.authenticated())
  course(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.courses.detail(claims.sub, id);
  }

  @Post("training/lessons/:id/open")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy(Policies.authenticated())
  async openLesson(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.courses.openLesson(claims.sub, id);
  }

  /** A lesson's checkpoint questions (no answers). */
  @Get("training/lessons/:id/checkpoint")
  @Policy(Policies.authenticated())
  checkpoint(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.checkpoints.get(claims.sub, id);
  }

  /** Both right to pass; unlimited tries; never part of the certificate. */
  @Post("training/lessons/:id/checkpoint")
  @Policy(Policies.authenticated())
  answerCheckpoint(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: SubmitCheckpointDto,
  ) {
    return this.checkpoints.submit(claims.sub, id, body.answers);
  }

  @Post("training/courses/:id/attempts")
  @Policy(Policies.authenticated())
  startAttempt(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.attempts.start(claims.sub, id);
  }

  @Post("training/attempts/:id/submit")
  @Policy(Policies.authenticated())
  submitAttempt(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: SubmitTrainingAttemptDto,
  ) {
    return this.attempts.submit(claims.sub, id, body.answers);
  }

  @Get("me/certificates")
  @Policy(Policies.authenticated())
  myCertificates(@CurrentUser() claims: AccessTokenClaims) {
    return this.certificates.listMine(claims.sub);
  }

  @Get("certificates/:code")
  @Policy(Policies.public())
  async verifyCertificate(
    @Param("code") code: string,
    @Req() request: Request,
  ) {
    const ip = request.ip || request.socket.remoteAddress || "unknown";
    const limit = await this.rateLimiter.consume({
      key: createHash("sha256").update(ip).digest("hex"),
      limit: CERTIFICATE_LOOKUPS_PER_IP,
      scope: "certificate-ip",
      windowSeconds: CERTIFICATE_LOOKUP_WINDOW_SECONDS,
    });
    if (!limit.allowed) {
      throw certificateLookupRateLimitError(limit.retryAfterSeconds);
    }
    return this.certificates.verify(code);
  }
}
