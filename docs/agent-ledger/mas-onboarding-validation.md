# MAS onboarding validation

**Scope:** Management MAS create/update requests and their Web UI forms.

**Guidance:** Management enforces semantic constraints for every caller. UI
validation provides early field feedback and does not replace backend checks;
provider CI and other tooling can call the Management API directly.

MCP server names are unique within a MAS, and native tool names are unique within
their MCP server. Compare exact strings, including the empty string. One empty
name is valid in each scope; native tool names can repeat on different servers.
Validate tools even when their server's name is empty. Duplicate requests return
HTTP 422 and leave saved state unchanged. Database uniqueness constraints remain
the final integrity boundary.

**Evidence:** The user confirmed backend enforcement during issue #43 review.
The [implementation plan](../plans/issue-43-mas-onboarding-metadata.md) includes
the narrow Management correction in stage 2. Workspace implementation and direct
API/Postgres regressions are in the
[Management service](../../../ioc-scale-cf-mgmt-svc/src/server/services/multi_agentic_system.py)
and [MCP name tests](../../../ioc-scale-cf-mgmt-svc/tests/test_mcp_name_validation.py).

**Revisit when:** The API changes accepted names, name normalization, or the
uniqueness scopes, or Management delegates semantic validation to another
authoritative backend boundary.
