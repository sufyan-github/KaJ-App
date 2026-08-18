import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

export const REQUEST_ID_GENERATOR = Symbol("REQUEST_ID_GENERATOR");

export interface RequestIdGenerator {
  generate(): string;
}

@Injectable()
export class CryptoRequestIdGenerator implements RequestIdGenerator {
  generate(): string {
    return randomUUID();
  }
}
