export const MAX_WORKER_SKILLS = 15;

export function validateWorkerSkillIds(skillIds: readonly string[]): void {
  if (skillIds.length > MAX_WORKER_SKILLS) {
    throw new Error(`A worker can select at most ${MAX_WORKER_SKILLS} skills.`);
  }
  if (new Set(skillIds).size !== skillIds.length) {
    throw new Error("A skill cannot be selected more than once.");
  }
}
