# P2-USR-05 — Uploads and Photos

Implemented and verified locally on 1 September 2026.

## Delivered

- authenticated five-minute signed upload URLs constrained by MIME and exact content length
- upload-kind policies for profile photos and sensitive verification documents
- private, user-owned pending object keys
- server-side object metadata, size, and byte-level MIME verification
- JPEG, PNG, and WebP decoding through Sharp rather than trusting extensions or headers
- automatic orientation followed by metadata-free WebP encoding
- small, medium, and large profile-photo variants
- private verification-document storage with no object key returned to clients
- owner-scoped, fresh one-minute signed document downloads
- S3 storage metadata, object read, and processed-object write primitives

## Verification

- oversize upload rejection: pass
- disallowed MIME rejection: pass
- MIME spoofing rejection: pass
- signed upload expiry: pass
- source EXIF present and absent from every generated variant: pass
- three image variants generated: pass
- sensitive document key omitted from completion response: pass
- non-owner document access rejected before URL signing: pass
- backend Prettier check: clean
- backend TypeScript typecheck: clean
- backend Jest: 109 passed, 2 intentionally skipped
- backend Nest build: successful

## Toolchain resolution

The checkout's dependency metadata referenced a Windows pnpm store. pnpm 10.34.5 was bootstrapped
outside the repository, dependencies were recreated against a Linux-local store, and Sharp 0.34.3
was then installed without changing the repository's enforced package-manager policy.

