/**
 * Background runners (assignment and dispute housekeeping, recurrence,
 * reputation, risk scan, verification purge) are plain timers in each API
 * process. With more than one instance every one of them runs everywhere, so
 * set RUN_SCHEDULERS=false on all instances but one.
 */
export function schedulersEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (env.RUN_SCHEDULERS ?? "true").trim().toLowerCase() !== "false";
}
