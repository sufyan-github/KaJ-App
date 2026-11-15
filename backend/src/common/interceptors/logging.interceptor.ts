import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Observable, tap } from "rxjs";

import { pathOnly } from "../../config/logger.config";
import { RequestContextStorage } from "../context/request-context.storage";
import { CLOCK, Clock } from "../time/clock";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(LoggingInterceptor.name)
    private readonly logger: PinoLogger,
    private readonly requestContext: RequestContextStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = this.clock.now().getTime();

    // Failed requests are logged once by HttpExceptionFilter, which also sees
    // errors thrown by guards (they run before interceptors).
    return next.handle().pipe(
      tap({
        next: () => {
          this.writeLog(request, response.statusCode, startedAt, "info");
        },
      }),
    );
  }

  private writeLog(
    request: Request,
    statusCode: number,
    startedAt: number,
    level: "info",
  ): void {
    const entry = {
      durationMs: Math.max(0, this.clock.now().getTime() - startedAt),
      method: request.method,
      path: pathOnly(request.originalUrl),
      requestId: this.requestContext.getRequestId(),
      statusCode,
    };

    this.logger[level](entry, "request completed");
  }
}
