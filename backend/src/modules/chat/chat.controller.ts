import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { ChatService } from "./chat.service";
import {
  MessagePageQueryDto,
  OpenConversationDto,
  ReportConversationDto,
  SendMessageDto,
} from "./dto/chat.dto";

@ApiTags("chat")
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get("conversations")
  @Policy(Policies.authenticated())
  list(@CurrentUser() claims: AccessTokenClaims) {
    return this.chat.list(claims.sub);
  }

  @Post("jobs/:jobId/conversations")
  @Policy(Policies.authenticated())
  open(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("jobId", new ParseUUIDPipe()) jobId: string,
    @Body() body: OpenConversationDto,
  ) {
    return this.chat.open(claims.sub, jobId, body.participantUserId);
  }

  @Get("conversations/:id/messages")
  @Policy(Policies.authenticated())
  messages(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: MessagePageQueryDto,
  ) {
    return this.chat.messages(claims.sub, id, query);
  }

  @Post("conversations/:id/messages")
  @Policy(Policies.authenticated())
  send(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.chat.send(claims.sub, id, body);
  }

  @Post("conversations/:id/read")
  @Policy(Policies.authenticated())
  read(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.chat.markRead(claims.sub, id);
  }

  @Delete("messages/:id")
  @Policy(Policies.authenticated())
  removeMessage(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.chat.removeMessage(claims.sub, id);
  }

  @Post("users/:id/block")
  @Policy(Policies.authenticated())
  block(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.chat.block(claims.sub, id);
  }

  @Delete("users/:id/block")
  @Policy(Policies.authenticated())
  unblock(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.chat.unblock(claims.sub, id);
  }

  @Post("conversations/:id/report")
  @Policy(Policies.authenticated())
  report(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ReportConversationDto,
  ) {
    return this.chat.report(claims.sub, id, body.description);
  }
}
