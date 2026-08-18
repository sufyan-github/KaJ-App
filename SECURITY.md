# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or exposed credential. Contact the
repository owner privately through the verified contact method on their GitHub profile and include
the affected component, reproduction steps, impact, and any safe mitigation you tested.

Do not access data beyond what is necessary to demonstrate the issue. Do not retain or share user
phone numbers, addresses, identity documents, tokens, or other personal data.

## Supported code

Until the first release, security fixes target the default branch. The project will publish a
version support table before production launch.

## Baseline rules

- Secrets belong in local or deployment environment stores, never Git.
- Local credentials in `.env.example` are development-only and must never be used in production.
- Security-sensitive changes require tests and a documented review of logging, authorization,
  privacy, and failure behavior.
