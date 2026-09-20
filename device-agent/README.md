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
