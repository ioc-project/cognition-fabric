// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"net"
	"strings"

	api "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/audit"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s *enforcementServer) AppendAuditRecord(ctx context.Context, request *api.AppendAuditRecordRequest) (*api.AppendAuditRecordResponse, error) {
	if err := ctx.Err(); err != nil {
		return nil, status.FromContextError(err).Err()
	}
	event, err := audit.NewProxyAuditEvent(request)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	if s.db == nil {
		return nil, status.Error(codes.Unavailable, "audit storage is unavailable")
	}
	if err := s.db.AppendProxyAuditEvent(ctx, event); err != nil {
		if ctx.Err() != nil {
			return nil, status.FromContextError(ctx.Err()).Err()
		}
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, status.FromContextError(err).Err()
		}
		if errors.Is(err, audit.ErrRecordConflict) {
			return nil, status.Error(codes.InvalidArgument, audit.ErrRecordConflict.Error())
		}
		var invalid *audit.ValidationError
		if errors.As(err, &invalid) {
			return nil, status.Error(codes.InvalidArgument, invalid.Error())
		}
		getLogger().Errorf("failed to append Proxy audit record: id=%s error=%v", request.GetRecord().GetAuditRecordId(), err)
		return nil, status.Error(auditStorageErrorCode(err), "audit storage failed")
	}
	return &api.AppendAuditRecordResponse{AuditRecordId: request.GetRecord().GetAuditRecordId()}, nil
}

func auditStorageErrorCode(err error) codes.Code {
	var network net.Error
	var postgres interface{ SQLState() string }
	if errors.Is(err, sql.ErrConnDone) || errors.Is(err, driver.ErrBadConn) || errors.As(err, &network) {
		return codes.Unavailable
	}
	if errors.As(err, &postgres) {
		code := postgres.SQLState()
		// These text-data failures are permanent for this record. Other data
		// exceptions may originate in server expressions and remain INTERNAL.
		switch code {
		case "22001", "22021", "22P05": // Text too long, invalid encoding, untranslatable character.
			return codes.InvalidArgument
		}
		if strings.HasPrefix(code, "08") || code == "57P01" || code == "57P02" || code == "57P03" || code == "53300" {
			return codes.Unavailable
		}
	}
	return codes.Internal
}
