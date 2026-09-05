import { OperatorPort } from "./operator.port";

export function selectOperatorAdapter(
  provider: string,
  pendingAdapter: OperatorPort,
  bdappsAdapter: OperatorPort,
): OperatorPort {
  if (provider === "pending") return pendingAdapter;
  if (provider === "bdapps") return bdappsAdapter;
  throw new Error(`Unsupported operator provider: ${provider}`);
}
