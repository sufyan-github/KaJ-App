import { HttpStatus } from "@nestjs/common";

import { ApiErrorDescriptor } from "../api/api-envelope";
import { KajHttpException } from "./kaj-http.exception";

export class RateLimitException extends KajHttpException {
  constructor(
    descriptor: ApiErrorDescriptor,
    readonly retryAfterSeconds: number,
  ) {
    super(descriptor, HttpStatus.TOO_MANY_REQUESTS);
  }
}
