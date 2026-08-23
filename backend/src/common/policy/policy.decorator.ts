import { SetMetadata } from "@nestjs/common";

import {
  POLICY_METADATA_KEY,
  PolicyDefinition,
  PolicyRule,
} from "./policy.types";

export function Policy(...anyOf: readonly PolicyRule[]): MethodDecorator {
  const definition: PolicyDefinition = { anyOf };
  return SetMetadata(POLICY_METADATA_KEY, definition);
}
