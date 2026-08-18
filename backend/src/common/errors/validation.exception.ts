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

export class RequestValidationException extends KajHttpException {
  constructor(errors: ValidationError[]) {
    super(
      {
        action: null,
        code: "VALIDATION_FAILED",
        details: [],
        field: findFirstField(errors),
        message: "Request validation failed.",
        messageKey: "error.validation.failed",
        retryable: false,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
