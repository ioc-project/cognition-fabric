# D3 — MAS Lifecycle Notifications

**Status:** Implemented

**Date:** 2026-10-12

**Parties:** CF Team, Security/Detective CE Team

## Summary

CEs are notified when MAS instances are created, updated, or deleted. The notification system uses a **ping + pull pattern**: each notification contains minimal payload (`event_type`, `timestamp`, `mas_id`), and CEs fetch full MAS details from CFN endpoints as needed.

## Problem

CEs that store per-MAS state need to know when MAS instances change. Without notifications, they must poll continuously or rely on timeouts, adding unnecessary complexity and increasing latency.

## Solution

### Notification Registration

CEs provide notification endpoint during registration:

```json
{
  "name": "my-ce",
  "ce_type": "DETECTIVE",
  "base_url": "http://my-ce:8080",
  "endpoint": "/api/query",
  "notification_url": "http://my-ce:8080",
  "notification_endpoint": "/notification/mas-lifecycle"
}
```

**Fields**:
- `notification_url` - Base URL for lifecycle event notifications (optional)
- `notification_endpoint` - Path for notification POST (optional)

If either field is omitted, the CE will not receive notifications.

### Notification Payload

Sent on MAS lifecycle events:

```json
{
  "event_type": "mas.created",
  "timestamp": "2026-10-09T08:45:00Z",
  "mas_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Event types** (enum): `mas.created`, `mas.updated`, `mas.deleted`

### CFN Query Endpoint

CEs fetch MAS details when needed:

```
GET /api/multi-agentic-systems/{mas_id}
```

Returns full MAS details by proxying to Management Plane.

### Initial association pull

Notifications fire only on a **config diff**. The first snapshot after CFN starts sends
nothing, and register/PATCH do not replay `mas.created`. A CE that restarts therefore
pulls its current associations instead of waiting for a ping:

```
GET /api/cognition-engine/{ceId}/multi-agentic-systems
```

**200** `{ "mas_ids": [...] }` means the CE is in the snapshot. An empty list is
terminal (the CE is present and has no associations). **404** means the CE is not in
the snapshot; retry while waiting for the post-register refresh. A 404 that persists
means the registration is gone (deleted in Management, or this CE registered through
a different CFN). **503** means the snapshot is unavailable; retry.

Then pull each MAS with `GET /api/multi-agentic-systems/{mas_id}?metadata=true`. A 404 on that
GET means the MAS is gone — drop it; do not treat it like the discovery 404.

This list is snapshot-backed and CE-scoped. It is not a dump of every MAS on the node
and it is not added to the register response (the snapshot may still lag the 201).

## Design Rationale

**Minimal payload**: Reduces coordination on schema changes, avoids sending sensitive data over notifications. CE fetches only what it needs.

**Include MAS ID**: CE knows exactly what changed. Can fetch specific MAS details rather than listing all MAS instances.

**CFN proxy endpoint**: Unified integration point. CEs call CFN, not Management Plane directly, maintaining service boundaries.

**Retry on transient failures**: CFN retries once on 5xx errors (server-side issues) but not on 4xx errors (client-side misconfigurations).

## Architecture

### One-Way Communication Model

Management Plane does not actively notify CFN. Instead, CFN periodically pulls config and detects changes. This maintains the principle: **Management Plane is passive, CFN pulls all data.**

### Change Detection Flow

1. CFN sends periodic heartbeat to Management Plane (~10s interval)
2. When `config_version` changes, CFN pulls latest config snapshot
3. CFN compares old vs new config to detect MAS changes:
   - **Created**: MAS ID appears in new config but not in old
   - **Updated**: MAS `last_updated_on` timestamp changed
   - **Deleted**: MAS ID exists in old config but missing from new
4. For each change, CFN extracts associated CE IDs from the MAS config
5. CFN dispatches notifications only to CEs that are:
   - Associated with the changed MAS
   - Have `notification_url` and `notification_endpoint` configured

## End-to-End Integration Flow

### System Overview

```
┌─────────────┐         ┌──────────────────┐         ┌─────────┐
│ Management  │◄────────│       CFN        │◄────────│   CE    │
│   Plane     │         │                  │         │         │
└─────────────┘         └──────────────────┘         └─────────┘
      │                          │                         │
      │                          │ 1. Register w/ notification  │
      │                          │◄────────────────────────┤
      │ 2. Store notification config  │                         │
      │◄─────────────────────────┤                         │
      │                          │                         │
      │ 3. Include in CFN config │                         │
      ├─────────────────────────►│                         │
      │                          │                         │
      │ 4. Heartbeat (10s)       │                         │
      │◄─────────────────────────┤                         │
      │                          │                         │
      │ 5. Config w/ version     │                         │
      ├─────────────────────────►│                         │
      │                          │                         │
      │                          │ 6. Detect changes       │
      │                          │                         │
      │                          │ 7. Send notification    │
      │                          ├────────────────────────►│
      │                          │                         │
      │                          │ 8. Fetch MAS details    │
      │                          │◄────────────────────────┤
      │ 9. Proxy MAS query       │                         │
      │◄─────────────────────────┤                         │
      │                          │                         │
      │ 10. MAS details          │                         │
      ├─────────────────────────►│                         │
      │                          ├────────────────────────►│
```

### Phase 1: CE Registration

1. CE calls `POST /api/cognition-engine` on CFN with notification fields:
   ```json
   {
     "name": "detective-ce",
     "notification_url": "http://detective-ce:8080",
     "notification_endpoint": "/notification/mas-lifecycle"
   }
   ```

2. CFN adds `cfn_id` and forwards to Management Plane `POST /api/cognition-engines`

3. Management Plane stores notification fields in `cognition_engine` table:
   - `notification_url` (String 512, nullable)
   - `notification_endpoint` (String 255, nullable)

4. Management Plane returns registration response including notification fields

5. Management Plane increments `config_version`, signaling config change

### Phase 2: Config Distribution

1. CFN sends heartbeat: `PUT /api/cognition-fabric-nodes/{cfn_id}/heartbeat`

2. Management Plane returns:
   ```json
   {
     "status": "online",
     "config_version": 42
   }
   ```

3. CFN detects version change and calls `GET /api/cognition-fabric-nodes/{cfn_id}/config`

4. Management Plane generates config including:
   ```json
   {
     "config_version": 42,
     "cognition_engines": [
       {
         "id": "ce-uuid",
         "notification_url": "http://detective-ce:8080",
         "notification_endpoint": "/notification/mas-lifecycle"
       }
     ],
     "workspaces": [
       {
         "multi_agentic_systems": [
           {
             "id": "mas-uuid",
             "last_updated_on": "2026-10-12T15:30:00Z",
             "cognition_engines": [{"id": "ce-uuid"}]
           }
         ]
       }
     ]
   }
   ```

### Phase 3: Change Detection & Dispatch

1. CFN compares old vs new config snapshots:
   - **Created**: MAS ID exists in new config but not old
   - **Updated**: MAS `last_updated_on` timestamp differs
   - **Deleted**: MAS ID exists in old config but not new

2. For each detected change, CFN extracts associated CE IDs from MAS config

3. CFN filters to CEs that have both `notification_url` and `notification_endpoint` configured

4. CFN dispatches notification in goroutine (one per CE):
   ```json
   POST http://detective-ce:8080/notification/mas-lifecycle
   {
     "event_type": "mas.updated",
     "timestamp": "2026-10-12T15:30:05Z",
     "mas_id": "mas-uuid"
   }
   ```

5. Retry logic:
   - On **5xx response**: wait 2 seconds, retry once (server-side transient error)
   - On **4xx response**: log error, no retry (client-side misconfiguration)
   - On **network error**: log error, no retry (CE may be down)

### Phase 4: CE Fetches Details

1. CE receives notification, returns `202 Accepted` immediately

2. CE processes in background, calls `GET /api/multi-agentic-systems/{mas_id}` on CFN

3. CFN proxies request to Management Plane using its own workspace credentials

4. Management Plane returns full MAS details

5. CE updates its internal state based on the event type:
   - `mas.created` → initialize new MAS state
   - `mas.updated` → refresh existing MAS state
   - `mas.deleted` → cleanup MAS state

## Data Schema Alignment

| Concept | Management Plane | CFN Config JSON | CFN Go Struct | Notification Payload |
|---------|-----------------|-----------------|---------------|---------------------|
| Notification URL | `cognition_engine.notification_url` | `cognition_engines[].notification_url` | `EngineCfg.NotificationURL` | N/A |
| Notification Endpoint | `cognition_engine.notification_endpoint` | `cognition_engines[].notification_endpoint` | `EngineCfg.NotificationEndpoint` | N/A |
| MAS Timestamp | `mas.updated_at` | `multi_agentic_systems[].last_updated_on` | `MASCfg.LastUpdatedOn` | N/A |
| MAS ID | `mas.id` | `multi_agentic_systems[].id` | `MASCfg.ID` | `mas_id` |
| CE Association | `mas_cognition_engine` junction | `multi_agentic_systems[].cognition_engines[].id` | `MASEngineCfg.ID` | N/A |
| Event Type | N/A | N/A | N/A | `event_type` |
| Timestamp | N/A | N/A | N/A | `timestamp` |

## Error Handling

### Network Failures
- **Behavior**: CFN logs error, does not retry
- **Recovery**: CE can implement polling fallback or wait for next config change
- **Reasoning**: Network issues are typically not transient at this layer

### 5xx Server Errors
- **Behavior**: CFN retries once after 2 seconds
- **Recovery**: If both attempts fail, logs error; CE should implement polling fallback
- **Reasoning**: Server errors may be transient (restart, temporary overload)

### 4xx Client Errors
- **Behavior**: No retry, log error
- **Recovery**: Alert ops team to fix notification endpoint configuration
- **Reasoning**: Client errors indicate misconfiguration (404 endpoint not found, 400 bad payload)

### Change Detection Failures
- **Behavior**: If CFN misses a heartbeat cycle, next heartbeat re-detects changes
- **Recovery**: Timestamp-based detection ensures eventual consistency
- **Reasoning**: MAS `last_updated_on` persists across heartbeat cycles

## Implementation Examples

### CE Notification Handler (Python/FastAPI)

```python
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import Literal

class MASLifecycleNotification(BaseModel):
    event_type: Literal["mas.created", "mas.updated", "mas.deleted"]
    timestamp: str
    mas_id: str

@app.post("/notification/mas-lifecycle")
async def handle_mas_lifecycle(
    notification: MASLifecycleNotification,
    background_tasks: BackgroundTasks
):
    background_tasks.add_task(process_mas_event, notification.mas_id, notification.event_type)
    return {"status": "accepted"}

async def process_mas_event(mas_id: str, event_type: str):
    if event_type == "mas.created":
        await initialize_mas_state(mas_id)
    elif event_type == "mas.updated":
        await refresh_mas_state(mas_id)
    elif event_type == "mas.deleted":
        await cleanup_mas_state(mas_id)
```

### Fetching MAS Details

```python
async def initialize_mas_state(mas_id: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{CFN_BASE_URL}/api/multi-agentic-systems/{mas_id}"
        )
        mas = response.json()
        
        # Initialize per-MAS state
        state_store[mas_id] = {
            "name": mas["name"],
            "ces": mas["cognition_engines"],
            "initialized_at": time.time()
        }
```

## Code References

### Management Plane
- **Migration**: `alembic/versions/20261012000001_add_notification_fields_to_ce.py`
- **Model**: `src/server/database/relational_db/models/cognition_engine.py:35-36`
- **Schema**: `src/server/schemas/cognition_engine.py:47-48,61-62`
- **Config generation**: `src/server/services/cognition_fabric_node.py:1130-1131,1175`

### CFN
- **Config types**: `pkg/app/config.go:20-21,39`
- **Registration DTO**: `pkg/app/httpapi/cognitionengine/dto.go:22-24,49-51`
- **MAS handler**: `pkg/app/handlers_mas.go`
- **Change detection**: `pkg/app/notification.go:24-80`
- **Notification dispatch**: `pkg/app/notification.go:92-174`
- **Heartbeat integration**: `pkg/app/app.go:301-313`

## Future Enhancements

### Authentication & Security
- Implement HMAC signature verification in notification headers
- Support notification secret rotation
- Add IP allowlist for notification sources

### Delivery Guarantees
- Persistent queue with retries for critical events
- Dead letter queue for failed deliveries after N attempts
- Delivery confirmation/acknowledgment mechanism

### Observability
- Notification delivery metrics (success rate, latency, retry count)
- Alerting on sustained delivery failures
- CE notification endpoint health checks

### Performance
- Batch notification sending to reduce overhead
- Rate limiting per CE to prevent overwhelming endpoints
- Async notification dispatch with circuit breaker pattern

## Related Documentation

- Gap 3: MAS Lifecycle Notifications
- CE Registration API: `docs/api/swagger.yaml`
