# Frozen legacy CE contract

Captured before changing issue #55's contract, on CFN base `712c939` (PR #46),
with unchanged Python Template CE bindings from sample base `d6166c3`.
The proto SHA256 is `70ae8d1c7d4db28296004c8b2f854877af4ee432501651451a723aee8f6d5723`.

`ce.protoset` was generated with `protoc -I . --include_imports
--descriptor_set_out=ce.protoset ce.proto`. Tests load it into a private descriptor
pool. The binary fixtures were serialized with the unchanged Python bindings;
they cover ALLOW, DENY with every legacy diagnostic, MODIFY, unknown outcome 99,
and omitted zero/default values. They must remain frozen when current bindings
are regenerated. Do not regenerate them from the updated contract.
