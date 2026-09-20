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
