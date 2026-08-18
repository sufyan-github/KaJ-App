import { HttpException, HttpStatus } from "@nestjs/common";

import { ApiErrorDescriptor } from "../api/api-envelope";

export class KajHttpException extends HttpException {
  constructor(
    readonly descriptor: ApiErrorDescriptor,
    status: HttpStatus,
  ) {
    super(descriptor.message, status);
  }
}
