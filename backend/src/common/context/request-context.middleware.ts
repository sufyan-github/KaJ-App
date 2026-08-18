import { Inject, Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

import {
  REQUEST_ID_GENERATOR,
  RequestIdGenerator,
} from "./request-id.generator";
import { RequestContextStorage } from "./request-context.storage";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly context: RequestContextStorage,
    @Inject(REQUEST_ID_GENERATOR)
    private readonly requestIdGenerator: RequestIdGenerator,
  ) {}

  use(_request: Request, response: Response, next: NextFunction): void {
    const requestId = this.requestIdGenerator.generate();
    response.setHeader("x-request-id", requestId);
    this.context.run(requestId, next);
  }
}
