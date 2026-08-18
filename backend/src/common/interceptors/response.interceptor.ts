import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

import { ApiSuccessEnvelope } from "../api/api-envelope";
import { RequestContextStorage } from "../context/request-context.storage";
import { CLOCK, Clock } from "../time/clock";

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessEnvelope<T>
> {
  constructor(
    private readonly requestContext: RequestContextStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessEnvelope<T>> {
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          requestId: this.requestContext.getRequestId(),
          serverTime: this.clock.now().toISOString(),
        },
      })),
    );
  }
}
