# P2-USR-05 Blocker — Required Image Processor Installation

**Recorded:** 2026-09-01
**Status:** RESOLVED on 2026-09-01

P2-USR-05 requires decoding uploaded images by their bytes, removing all metadata (including EXIF
GPS), and producing three verified variants. The backend currently has no image decoder or processor.
The selected implementation dependency is `sharp@0.34.3`.

Dependency installation cannot run in the current workspace runtime:

- the repository enforces pnpm `>=10.34.5 <11`
- the available bundled command is pnpm `11.19.0`
- the Node runtime contains neither `corepack` nor `npx`, so the required pnpm release cannot be
  selected
- repeated `pnpm --filter @kaj/backend add sharp@0.34.3` attempts stop with
  `ERR_PNPM_UNSUPPORTED_ENGINE`

No dependency, lockfile, or application change was produced by the failed commands. Work stopped
under build-guide rule R2 / step 6 after the same blocker repeated.

## Unblock requirement

Provide pnpm `10.34.5` in the execution environment (or update the repository's pnpm engine policy
explicitly), then install `sharp@0.34.3` for `@kaj/backend`. After that, implementation can continue
with storage metadata/read/write primitives, upload verification, EXIF-safe variants, and private
signed document downloads.

## Resolution

pnpm 10.34.5 was bootstrapped outside the repository. The stale Windows-backed dependency tree was
recreated against a Linux-local store, Sharp 0.34.3 was installed, and P2-USR-05 passed its complete
backend verification gate. The repository engine policy was preserved.
