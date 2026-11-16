// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	"context"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Store failures remain fail-closed, with a 1s timeout for each read or write.
func storeCall(ctx context.Context, operation string, call func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	err := call(ctx)
	if ctx.Err() != nil {
		return status.FromContextError(ctx.Err()).Err()
	}
	if err != nil {
		return status.Errorf(codes.Unavailable, "Cognition Store %s failed", operation)
	}
	return nil
}
