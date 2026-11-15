import { ArgumentsHost, Catch, HttpException, Logger } from "@nestjs/common";
import { BaseWsExceptionFilter, WsException } from "@nestjs/websockets";

import { describeException } from "../../common/filters/http-exception.filter";

/**
 * Gives socket clients the same error descriptor (code, message, messageKey,
 * field, retryable) the HTTP API returns. Without it, any exception a service
 * throws inside a gateway handler — not found, blocked, conflict — reached
 * the client as a bare "Internal server error". Emitted as the standard
 * `exception` event.
 */
@Catch()
export class ChatWsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(ChatWsExceptionFilter.name);

  override catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof WsException) return super.catch(exception, host);
    const { status, descriptor } = describeException(exception);
    if (!(exception instanceof HttpException) && status >= 500) {
      const error =
        exception instanceof Error ? exception : new Error(String(exception));
      // Only the error itself; never the message payload or the token.
      this.logger.error(
        { err: { name: error.name, message: error.message } },
        error.stack,
      );
    }
    return super.catch(
      new WsException({ ...descriptor, httpStatus: status }),
      host,
    );
  }
}
