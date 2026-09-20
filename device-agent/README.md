# ZUVYR Device Agent — PACK085

PACK085 creates the **local device-agent boundary only**. It does not pair a device to a ZUVYR account and it does not execute computer-control actions.

## Trust boundary

- Binds to `127.0.0.1` only. No LAN/public/raw-IP trust.
- Browser `Origin` requests are rejected in PACK085.
- Authenticated local endpoints require a random per-user bearer token stored with private-file permissions.
- Device identity is a locally generated Ed25519 key pair. The private key never appears in API responses.
- Pairing remains **PACK086**.
- Screen, pointer, keyboard, application, filesystem and shell actions remain **PACK087**.
- Existing Pack08 server-side IP execution stays fail-closed.

## User-level lifecycle

```
node bin/zuvyr-device-agent.js init
node bin/zuvyr-device-agent.js install
node bin/zuvyr-device-agent.js start
node bin/zuvyr-device-agent.js status
node bin/zuvyr-device-agent.js stop
node bin/zuvyr-device-agent.js uninstall
```

The installer copies the agent into the user's state directory and creates a user-owned launcher. It does not request administrator/root access and does not enable autostart by default. Uninstall preserves device identity/token unless `--purge-identity` is explicitly supplied.

## Updates

The verifier supports signed Ed25519 manifests, HTTPS-only artifact URLs, host allowlisting and SHA-256/size verification. Production update execution remains fail-closed until a release public key and allowed update host are configured and M19 evidence exists.

## Verification status

CI can prove the local security/lifecycle contract with an ephemeral loopback server and temporary user directory. A real installation/uninstallation/start test on an actual target device is an external **M19** acceptance gate and must not be claimed from CI alone.


## PACK086 — Pairing & secure session

PACK086 adds user-authenticated pairing and a device-authenticated heartbeat session while keeping all computer-control execution disabled.

- Pairing uses Ed25519 proof of possession; the backend stores only the public key/fingerprint.
- Pairing challenges are single-use and expire quickly; only their SHA-256 hashes are stored.
- Session tokens are returned once, stored privately on-device, and stored server-side only as SHA-256 hashes.
- Every device heartbeat requires the short-lived token, an Ed25519 request signature and a strictly increasing counter.
- Device revocation invalidates all open sessions and pending pairing challenges.
- Raw IP addresses never identify or authorize a device.
- Session transport is HTTPS-only by contract.
- PACK087 owns screen, pointer, keyboard, application, clipboard, filesystem and shell execution.

CLI helpers:

    zuvyr-device-agent pair-proof challenge.json
    zuvyr-device-agent session-import session.json --backend-origin https://<zuvyr-api-host>
    zuvyr-device-agent session-proof POST /api/device-agent/heartbeat
    zuvyr-device-agent session-clear


## PACK087 — IP Actions / STOP / Undo

PACK087 adds a least-privilege action worker on top of PACK086 signed device sessions. The device opens no public inbound control port: it pulls authorized work over outbound HTTPS.

Execution contract:

- the backend remains the authority for owner, paired device, signed session, permission grant and confirmation;
- file reads/writes are disabled until `ZUVYR_AGENT_FILE_ROOTS` explicitly scopes allowed roots;
- shell execution is disabled until `ZUVYR_AGENT_ALLOWED_EXECUTABLES` explicitly allowlists executables; commands use argument arrays with `shell:false`;
- application launch is disabled until `ZUVYR_AGENT_ALLOWED_APPLICATIONS` explicitly allowlists applications;
- screen, pointer, keyboard and clipboard support is detected honestly from the current OS/tools and fails closed when unavailable;
- write-file creates a private local opaque backup before mutation; Undo restores the prior bytes or removes a newly-created file;
- STOP is polled independently while an action is running and aborts cancellable child processes;
- device results are redacted locally and redacted again by the backend before persistence;
- sensitive paths such as .ssh, .aws, .env, credentials and private-key locations remain blocked.

Typical configuration:

    ZUVYR_AGENT_FILE_ROOTS=/explicit/root
    ZUVYR_AGENT_ALLOWED_EXECUTABLES=/absolute/or/path-resolved-command
    ZUVYR_AGENT_ALLOWED_APPLICATIONS=ExplicitAppName

The exact list separator for file roots follows the operating system path delimiter. Executable and application allowlists are comma-separated.

The `start`/`serve` flow runs the local management server and PACK087 action worker together. `cycle` runs one pull/execute/report cycle and `work` runs the action worker in the foreground.
