# ZUVYR Starter Kits

Small, dependency-light reference projects for builders who want the engineering patterns behind reliable AI products without depending on ZUVYR production infrastructure.

## Kits

### 1. Durable AI Job
`durable-ai-job/`

A runnable Node.js example showing:
- idempotent task submission;
- explicit task states;
- budget reservation;
- worker execution;
- terminal settlement/refund;
- safe duplicate retry behavior.

### 2. Permissioned Tool
`permissioned-tool/`

A runnable example for high-impact actions showing:
- owner check;
- explicit grant;
- action scope;
- expiry;
- revocation;
- denial reasons;
- audit-friendly decision output.

### 3. Provider Router
`provider-router/`

A local mock provider router showing:
- capability filtering;
- provider health filtering;
- cost/latency ranking;
- ordered fallback;
- no dependency on a paid API.

## Run

Each kit uses Node.js 22+ and no third-party packages.

```bash
cd starter-kits/durable-ai-job
npm start
```

See each kit's README for its specific example.

## License

Everything inside `starter-kits/` is licensed under Apache License 2.0. ZUVYR branding and trademarks are not licensed. See [this directory's LICENSE](LICENSE), the [repository licensing notice](../LICENSE), and the [Public Use Policy](../docs/PUBLIC_USE_POLICY.md).
