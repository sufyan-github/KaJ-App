import { HttpStatus } from "@nestjs/common";
import { ValidationError } from "class-validator";

import { KajHttpException } from "./kaj-http.exception";

function findFirstField(errors: ValidationError[], parent = ""): string | null {
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;

    if (error.constraints && Object.keys(error.constraints).length > 0)
      return field;

    const childField = findFirstField(error.children ?? [], field);
    if (childField) return childField;
  }

  return null;
}

export interface ValidationDetail {
  field: string;
  /** class-validator rule names, e.g. ["isUuid"]. Never the submitted value. */
  rules: string[];
}

function collectDetails(
  errors: ValidationError[],
  parent = "",
  out: ValidationDetail[] = [],
): ValidationDetail[] {
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints && Object.keys(error.constraints).length > 0)
      out.push({ field, rules: Object.keys(error.constraints) });
    collectDetails(error.children ?? [], field, out);
  }
  return out.slice(0, 50);
}

export class RequestValidationException extends KajHttpException {
  constructor(errors: ValidationError[]) {
    super(
      {
        action: null,
        code: "VALIDATION_FAILED",
        details: collectDetails(errors),
        field: findFirstField(errors),
        message: "Request validation failed.",
        messageKey: "error.validation.failed",
        retryable: false,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
