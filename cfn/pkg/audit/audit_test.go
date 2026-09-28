// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"errors"
	"testing"
)

func TestValidateResourceType(t *testing.T) {
	if err := ValidateResourceType(ResourceTypeCognitionEngine); err != nil {
		t.Errorf("expected COGNITION_ENGINE to be valid, got error: %v", err)
	}
	if err := ValidateResourceType("BOGUS"); err == nil {
		t.Error("expected error for invalid resource type, got nil")
	}
}

func TestValidateAuditType(t *testing.T) {
	if err := ValidateAuditType(AuditTypeCEInvoked); err != nil {
		t.Errorf("expected CE_INVOKED to be valid, got error: %v", err)
	}
	if err := ValidateAuditType("BOGUS"); err == nil {
		t.Error("expected error for invalid audit type, got nil")
	}
}

func TestValidateResourceType_ReturnsValidationError(t *testing.T) {
	err := ValidateResourceType("BOGUS")
	var verr *ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("expected *ValidationError, got %T: %v", err, err)
	}
}

func TestValidateAuditType_ReturnsValidationError(t *testing.T) {
	err := ValidateAuditType("BOGUS")
	var verr *ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("expected *ValidationError, got %T: %v", err, err)
	}
}

func TestPaginationConfig_Defaults(t *testing.T) {
	// Reset to package defaults so this test doesn't depend on execution order.
	SetPaginationConfig(FallbackDefaultPageSize, FallbackMaxPageSize)

	if DefaultPageSize() != FallbackDefaultPageSize {
		t.Errorf("DefaultPageSize() = %d, want %d", DefaultPageSize(), FallbackDefaultPageSize)
	}
	if MaxPageSize() != FallbackMaxPageSize {
		t.Errorf("MaxPageSize() = %d, want %d", MaxPageSize(), FallbackMaxPageSize)
	}
}

func TestPaginationConfig_Override(t *testing.T) {
	defer SetPaginationConfig(FallbackDefaultPageSize, FallbackMaxPageSize)

	SetPaginationConfig(10, 50)
	if DefaultPageSize() != 10 {
		t.Errorf("DefaultPageSize() = %d, want 10", DefaultPageSize())
	}
	if MaxPageSize() != 50 {
		t.Errorf("MaxPageSize() = %d, want 50", MaxPageSize())
	}
}

func TestPaginationConfig_DefaultClampedToMax(t *testing.T) {
	defer SetPaginationConfig(FallbackDefaultPageSize, FallbackMaxPageSize)

	SetPaginationConfig(100, 20)
	if DefaultPageSize() != 20 {
		t.Errorf("DefaultPageSize() = %d, want 20 (clamped to max)", DefaultPageSize())
	}
}
