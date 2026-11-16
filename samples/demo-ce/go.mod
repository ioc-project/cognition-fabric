module github.com/cisco-eti/cognition-fabric/samples/demo-ce

go 1.25.9

require (
	github.com/cisco-eti/cognition-fabric/api v1.0.0
	github.com/lmittmann/tint v1.2.1
	google.golang.org/grpc v1.83.2
	google.golang.org/protobuf v1.36.12
)

require (
	golang.org/x/net v0.58.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.41.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260526163538-3dc84a4a5aaa // indirect
)

replace github.com/cisco-eti/cognition-fabric/api => ../../api
