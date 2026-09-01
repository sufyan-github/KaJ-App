import { HttpStatus } from "@nestjs/common";
import { RoleMode } from "@prisma/client";

import { ApiErrorDescriptor } from "../api/api-envelope";
import { KajHttpException } from "./kaj-http.exception";

function descriptor(
  code: string,
  messageKey: string,
  message: string,
): ApiErrorDescriptor {
  return {
    action: null,
    code,
    details: [],
    field: null,
    message,
    messageKey,
    retryable: false,
  };
}

export function authorizationPolicyRequiredError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "AUTH_POLICY_REQUIRED",
      "error.auth.policy_required",
      "This operation is not available.",
    ),
    HttpStatus.FORBIDDEN,
  );
}

export function authorizationDeniedError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "AUTHORIZATION_DENIED",
      "error.auth.authorization_denied",
      "You are not allowed to perform this action.",
    ),
    HttpStatus.FORBIDDEN,
  );
}

export function roleRequiredError(requiredRole: RoleMode): KajHttpException {
  return new KajHttpException(
    {
      ...descriptor(
        "ROLE_REQUIRED",
        "error.auth.role_required",
        `Activate the ${requiredRole.toLowerCase()} role to perform this action.`,
      ),
      action: { target: requiredRole, type: "activate_role" },
      details: [{ requiredRole }],
    },
    HttpStatus.FORBIDDEN,
  );
}

export function privateResourceNotFoundError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "RESOURCE_NOT_FOUND",
      "error.common.not_found",
      "Resource not found.",
    ),
    HttpStatus.NOT_FOUND,
  );
}
