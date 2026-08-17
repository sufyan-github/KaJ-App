# Completion Record Procedure

Create one Markdown file for every finished project step at `docs/completed/<TASK-ID>.md`. The record is committed with the step it documents.

## Required structure

```markdown
# <TASK-ID> — <Title>

**Status:** COMPLETE
**Completed:** YYYY-MM-DD
**Phase:** <phase>
**Commit:** This completion record is part of the task commit; exact hash is in Git history and the final task report.
**Remote:** origin/main

## Scope
What the task was required to do and explicitly did not do.

## Inputs and instructions followed
Exact source-document sections and prerequisite outputs used.

## Output
Files and artifacts created or modified.

## How it operates
Runtime behavior, user flow, data flow, or documentation workflow produced by the task.

## Process and procedure
The work performed in execution order.

## Verification evidence
Commands, tests, lint, typecheck, build, source checks, and their results.

## Acceptance results
Every task acceptance item shown separately as PASS, FAIL, or N/A with evidence.

## Decisions and limitations
Assumptions, trade-offs, deferrals, human gates, and known limitations.

## Next task
Exactly one next task ID, unless a phase gate blocks progress.
```

## Rules

- Never backdate or fabricate evidence.
- Never mark interviews, legal review, vendor approval, device testing, or human usability testing complete without actual evidence.
- For code tasks, include test names and summarized results.
- For UI tasks, include requirement IDs, locale/text-scale coverage, offline/error/loading states, and screen-spec links.
- For externally changing facts, cite current sources and the access date.
- Every completion record, tracker update, changelog update, commit, and push belongs to the same logical step.
