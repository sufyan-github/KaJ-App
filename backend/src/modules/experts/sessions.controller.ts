import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserRateLimit } from "../../common/rate-limit/user-rate-limit";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AttendanceLocationDto } from "../attendance/dto/attendance.dto";
import { AccessTokenClaims } from "../auth/auth-token.service";
import {
  BookConsultationDto,
  CancelSessionDto,
  CreateSessionDto,
  ExpertSlotsQueryDto,
  InviteSessionDto,
  RespondSessionDto,
  SessionAttendanceDto,
  SessionCashDto,
  SessionListQueryDto,
  UpdateSessionDto,
} from "./dto/session.dto";
import { SessionsService } from "./sessions.service";
import { Idempotent } from "../../common/idempotency/idempotency";

const uuid = () => new ParseUUIDPipe();

/** P3.2: sessions. Anyone not hosting or on a session gets 404. */
@ApiTags("experts")
@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get("experts/:userId/slots")
  @Policy(Policies.authenticated())
  slots(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("userId", uuid()) userId: string,
    @Query() query: ExpertSlotsQueryDto,
  ) {
    return this.sessions.expertSlots(claims.sub, userId, query.from, query.to);
  }

  @Post("sessions/consultations")
  @Idempotent("consultation-book")
  @UserRateLimit("consultation-hold")
  @Policy(Policies.authenticated())
  book(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: BookConsultationDto,
  ) {
    return this.sessions.bookConsultation(claims.sub, body);
  }

  @Post("sessions")
  @Policy(Policies.authenticated())
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateSessionDto,
  ) {
    return this.sessions.create(claims.sub, body);
  }

  @Get("sessions")
  @Policy(Policies.authenticated())
  list(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: SessionListQueryDto,
  ) {
    return this.sessions.list(claims.sub, query);
  }

  @Get("sessions/:id")
  @Policy(Policies.authenticated())
  get(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.sessions.get(claims.sub, id);
  }

  @Patch("sessions/:id")
  @Policy(Policies.authenticated())
  update(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: UpdateSessionDto,
  ) {
    return this.sessions.update(claims.sub, id, body);
  }

  /** P3.3: the session chat (group conversation): returns its id. */
  @Post("sessions/:id/chat")
  @Policy(Policies.authenticated())
  chat(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.sessions.chatRoom(claims.sub, id);
  }

  /** P3.5: RSVP to a group session (a place, or the waitlist). */
  @Post("sessions/:id/rsvp")
  @Policy(Policies.authenticated())
  rsvp(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.sessions.rsvp(claims.sub, id);
  }

  /** P3.5: location check-in at an in-person session (explicit consent). */
  @Post("sessions/:id/check-in")
  @Policy(Policies.authenticated())
  checkIn(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: AttendanceLocationDto,
  ) {
    return this.sessions.checkIn(claims.sub, id, body);
  }

  @Post("sessions/:id/publish")
  @Policy(Policies.authenticated())
  publish(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.sessions.publish(claims.sub, id);
  }

  @Post("sessions/:id/invite")
  @UserRateLimit("invite")
  @Policy(Policies.authenticated())
  invite(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: InviteSessionDto,
  ) {
    return this.sessions.invite(claims.sub, id, body);
  }

  @Post("sessions/:id/respond")
  @Policy(Policies.authenticated())
  respond(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: RespondSessionDto,
  ) {
    return this.sessions.respond(claims.sub, id, body);
  }

  @Post("sessions/:id/leave")
  @Policy(Policies.authenticated())
  leave(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.sessions.leave(claims.sub, id);
  }

  @Post("sessions/:id/cancel")
  @Policy(Policies.authenticated())
  cancel(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: CancelSessionDto,
  ) {
    return this.sessions.cancel(claims.sub, id, body);
  }

  @Post("sessions/:id/complete")
  @Policy(Policies.authenticated())
  complete(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.sessions.complete(claims.sub, id);
  }

  @Post("sessions/:id/attendance")
  @Policy(Policies.authenticated())
  attendance(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: SessionAttendanceDto,
  ) {
    return this.sessions.attendance(claims.sub, id, body);
  }

  @Post("sessions/:id/cash")
  @Policy(Policies.authenticated())
  cash(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: SessionCashDto,
  ) {
    return this.sessions.recordCash(claims.sub, id, body);
  }
}
