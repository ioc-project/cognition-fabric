# Cognition Engine walkthrough

Use the [Python Template CE](https://github.com/ioc-project/cognition-fabric/tree/main/samples/template-ce)
to follow the CE contract from registration to a decision. The
[quickstart](quickstart.md) runs this sample with CF and NOA.

## Connect to CFN

1. The CE starts its gRPC and HTTP listeners and registers with
   `POST /api/cognition-engine` on CFN. It advertises its name, version,
   enforcement endpoint, and HTTP health URL. When the registration exists,
   the sample updates it with `PATCH`.
2. CFN probes `GET /healthz` at the advertised endpoint. An enabled, online CE
   with an enforcing endpoint can be selected for a MAS to which it is attached.
3. The sample pulls its MAS associations from CFN and fetches the MAS details.
   When registered with a notification URL, its `POST /notification` listener
   handles later MAS lifecycle events and updates that local view.

Follow [the registration code](https://github.com/ioc-project/cognition-fabric/blob/main/samples/template-ce/src/registration.py)
and [MAS synchronization](https://github.com/ioc-project/cognition-fabric/blob/main/samples/template-ce/src/mas_sync.py)
for exact fields and endpoints. Addresses advertised by the CE must be
reachable from CFN's network. To attach a newly registered CE to an existing
MAS, add the association in Management. See [run your own CE](https://github.com/ioc-project/cognition-fabric/blob/main/deploy/README.md#run-your-own-ce)
for deployment and addressing details.

## Return a decision

`GetInfo` returns CE metadata. When CFN selects the engine, it calls
`Evaluate` with the MAS, source and destination, correlation identifiers, and
the workspace context.

The Template CE's `Evaluate` uses `TEMPLATE_CE_DECISION`, which defaults to
`allow`. Its response includes the decision, a reason, the trace ID, and
`details` identifying the sample response format and configured decision.
`deny` returns a simulated denial. Restart the CE after changing the value.
CFN maps a denial to `ACTION_BLOCK`, which the Proxy applies.

When `COGNITION_STORE_URL` is configured, `Evaluate` reads prior findings and
submits a finding for the current decision.

See [the Python service](https://github.com/ioc-project/cognition-fabric/blob/main/samples/template-ce/src/service.py)
and [the CE gRPC contract](https://github.com/ioc-project/cognition-fabric/blob/main/api/ce/proto/ce/v1/ce.proto).
The [audit walkthrough](quickstart.md#read-the-audit-trail) shows where to inspect
the CE response and the Proxy outcome.

## Compare the Go Demo CE

The [Go Demo CE](https://github.com/ioc-project/cognition-fabric/tree/main/samples/demo-ce)
uses the same interfaces and loads policy per MAS from JSON. Identity rules
evaluate source and destination. Content rules can use evidence from SCOPE
when configured. The engine returns its verdict and details about the checks
it ran.

See the [policy setup](https://github.com/ioc-project/cognition-fabric/blob/main/deploy/README.md#noa-demo-ce-policy)
to prepare the MAS-specific config and use the Go Demo CE.
