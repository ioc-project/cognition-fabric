# SHADi flavor

The optional published verifier exposes sender authorization over mTLS. Trusted
SHADi hosts call `POST /evaluate` before sending and report replies to
`POST /observations`. Decisions and finalized audit records go directly to CFN.
The hosts and SLIM run separately.

This recipe starts the verifier; it does not attach a MAS, issue host identities
or install an activation controller. The example activation is **unprovisioned**.
The listener can start without a lease but denies evaluations until valid
controller-owned activation exists. Registering a MAS alone does not activate it.

## Start from the monorepo root

Complete the platform prerequisites in [`deploy/README.md`](../../README.md).
OpenSSL is also needed for the optional development certificate generator.

1. Prepare private configuration and development certificates:

   ```bash
   deploy/enforcement/shadi/gen-dev-certs.sh spiffe://ioc.example/hosts/sender spiffe://ioc.example/hosts/receiver
   cp deploy/enforcement/shadi/config.example.json deploy/enforcement/shadi/config/config.json
   ```

2. Edit the private host/route configuration. Preserve the required `activation`
   reference. For component startup, leave epoch/generation unprovisioned and the
   lease file absent. Do not write a fake lease to enable traffic.

3. Check, pull and start the selected flavor:

   ```bash
   make -C deploy doctor enforcement=shadi
   make -C deploy pull enforcement=shadi
   make -C deploy up enforcement=shadi
   make -C deploy status
   make -C deploy logs service=ioc-scale-enforcement-proxy-shadi-verifier
   ```

4. Check the private listener with a generated client certificate:

   ```bash
   curl --cacert deploy/enforcement/shadi/config/ca.crt --cert deploy/enforcement/shadi/config/sender.crt --key deploy/enforcement/shadi/config/sender.key https://localhost:9013/metrics
   make -C deploy down
   ```

   `/metrics` confirms listener access, not activated enforcement. A valid client
   certificate is mandatory. `down` preserves application/database volumes.

## Configuration contract

The private directory contains `config.json`, `ca.crt`, `server.crt`, `server.key`,
readable by UID/GID 65532. It is mounted read-only at `/run/shadi-verifier`.
Override `SHADI_VERIFIER_CONFIG_DIR` in root `.env` or the shell; relative paths
resolve from `deploy/`. The launcher checks the files and activation reference
without rewriting existing operator configuration.

`config.json` contains:

- `activation`: controller reference with absolute in-container `path` and
  nonempty `epoch`/`generation`. The example path is
  `/run/shadi-verifier/activation.json`, intentionally absent initially.
- `hosts`: certificate SPIFFE URI, MAS ID, agent ID, local identity,
  `did:key:...` and `org/namespace/agent` SLIM name per trusted host.
- `routes`: distinct same-MAS source/destination local identities. The published
  schema also supports MCP routes with explicit tool allowlists. Real bindings
  and attachment remain the developer's responsibility.

The verifier requires `ENFORCEMENT_FAILURE_POSTURE=fail_closed` and
`CF_ENFORCEMENT_TIMEOUT` below 4 seconds (default 2 seconds). Audit delivery uses
`AUDIT_QUEUE_CAPACITY` and `AUDIT_RPC_TIMEOUT`, not the mediation service or
`AUDIT_JOURNAL_*`.

The certificate script generates a throwaway CA, server certificate and a client
certificate per URI, named after its last path segment. It refuses to overwrite
files; certificates last 30 days by default (`CERT_DAYS`). Use owner-issued
material for a real deployment. The MAS developer's controller owns activation
and identity issuance; see the maintained
[proxy runtime guide](https://github.com/ioc-project/enforcement-proxy/tree/main/deployments/compose/enforcement-proxy-runtime).

The verifier host port is loopback-only `9013` (`SHADI_VERIFIER_PORT`). See shared
[image selection and rollback](../README.md).
