# Safe Reuse & Public Sharing

ZUVYR aims to share useful engineering knowledge without accidentally publishing secrets, customer data, privileged infrastructure details, or unsupported public contracts.

## Safe to share publicly
Generally safe material includes:
- architecture diagrams and high-level component boundaries;
- generic idempotency, queue, retry and billing patterns;
- generic authorization and permission-grant patterns;
- generic OAuth security guidance;
- sanitized examples with placeholder values;
- public-facing product documentation;
- test strategies that contain no real credentials or private customer data.

## Keep private or sanitized
Do not publish:
- production API keys, OAuth client secrets, service-role keys or database passwords;
- access/refresh tokens;
- customer conversations/files or personal data;
- internal incident data that exposes exploitable details before remediation;
- private provider credentials, account IDs or billing identifiers;
- exact privileged operational procedures that bypass normal authorization;
- raw production logs containing sensitive payloads.

## No fake credentials
Examples must use obvious placeholders such as:

```text
YOUR_CLIENT_ID
YOUR_SERVER_SECRET
https://example.invalid
```

Never add a working credential "just for the demo."

## Internal API vs public contract
Code being visible in a repository does not make every internal endpoint a stable public API. A public API should have an explicit version, authentication model, rate/usage policy, support expectations and compatibility contract.

## Licensing note
There is currently no explicit repository license file. Do not assume source code reuse rights until the repository owner chooses and publishes a license.

A future license choice should be deliberate because it affects redistribution, modification, commercial use, warranty disclaimers and—depending on the license—patent terms.
