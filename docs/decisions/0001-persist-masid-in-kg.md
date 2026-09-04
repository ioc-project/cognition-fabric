# 0001 — Persist application_id as masId on the MAS node in the KG

**Status:** Accepted

## Context

OXP's Knowledge Graph stores the MAS identifier (sourced from the OTel span attribute `application_id`) as the `masName` property on the `MAS` node in Neo4j. CF queries OXP using `mas_id` — there is no `masId` property on the node today.

## Decision

Two options were considered:

1. Maintain both method names in claris-lib (`get_all_application_ids()` + `get_all_mas_ids()`)
2. Rename entirely to `mas_id` in the ioc-scaling-oxp integration layer since it is CF-specific

Option 1 was agreed. Add `masId` as an additional property on the `MAS` node in Neo4j, holding the same value as `masName`. Concretely, add `SET mas.masId = $mas_name` alongside the existing `masName` write in `ingest_multi_layer_trajectory.py`. On the DAL API surface,
add `get_all_mas_ids()` alongside the existing `get_all_application_ids()` — both method names are maintained. The change goes into claris-lib directly. The forked ioc-scaling-oxp integration layer will maintain its own CF-specific version using `mas_id` naming natively.

## Consequences

- CF can query OXP using `mas_id`.
- Both property names (`masName`, `masId`) coexist on the `MAS` node, holding the same value
