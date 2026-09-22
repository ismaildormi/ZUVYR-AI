# ZUVYR Public Use Policy

This policy explains what people may safely learn from and reuse from this repository without turning internal ZUVYR implementation details into an accidental public product contract.

## What is intentionally reusable

The directories below are public developer resources:

- `examples/`
- `starter-kits/`

They are licensed under the **Apache License 2.0**. People may use, modify and redistribute those resources under that license, including for commercial projects, while keeping the required license and notices.

## What remains ZUVYR core

Everything outside the explicitly reusable directories remains proprietary unless a separate license notice says otherwise. That includes production application code, internal APIs, deployment configuration, product assets, internal schemas, pack evidence, operational tooling and other ZUVYR-specific implementation.

The goal is to share useful engineering patterns without accidentally giving away the production product or creating unsupported compatibility obligations.

## Trademarks

Apache-2.0 does not grant rights to the ZUVYR name, logos or branding. Reuse of a starter kit must not imply that a third-party product is endorsed, sponsored or operated by ZUVYR.

## No secrets or customer data

Public resources must never contain real:
- API keys or provider credentials;
- OAuth client secrets;
- service-role keys;
- database passwords;
- access or refresh tokens;
- private customer data;
- privileged production identifiers.

Examples use obvious placeholders and local/mock adapters by default.

## No hidden production dependency

A public starter kit should run without access to ZUVYR production infrastructure. If a future kit integrates with a ZUVYR public API, it must use an explicitly published developer contract rather than internal routes.

## Public API boundary

Internal endpoints visible in source are not automatically public APIs. A supported public API requires an explicit version, authentication model, documented rate/usage policy, compatibility expectations and developer documentation.

## Security reports

Do not publish secrets, customer data, or working exploit details in public issues. Use the repository security policy for sensitive reports.

## Warranty and responsibility

Reusable resources are provided under Apache-2.0 without warranties or conditions beyond those required by law. Builders are responsible for reviewing security, privacy, regulatory, billing and production-readiness requirements for their own applications.
