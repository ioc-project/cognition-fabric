# Onboard the NOA A2A MAS

Paste [`noa-a2a-mas.json`](noa-a2a-mas.json) into JSON mode at
`/mas/create` in CF Management. Select an enabled, online Cognition Engine in
the workspace served by your CFN and save the MAS.

Copy the MAS ID into `NOA_MAS_ID` and the ID of the declared MCP server
(`mcp_servers[0].id`) into `NOA_MCP_SERVER_ID` in the monorepo root `.env`.
The declaration includes the four networked agents, the model gateway
destination, and tools bound to the MCP server. The provided topology describes
the delegation, return, and tool relationships. The Proxy controller uses the
canonical IDs to generate routes when you run `task run:full-mas`.

See the [local setup](../../../dev/README.md#noa-onboarding-and-proxy-mode)
for service startup and Demo CE policy configuration.
