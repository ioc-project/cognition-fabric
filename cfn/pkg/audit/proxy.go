// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	api "github.com/ioc-project/cognition-fabric/api/enforcement/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrRecordConflict = errors.New("audit_record_id already has different contents")

// Unknown wire fields are retained in JSONB too, so additive producers and
// identical retries do not lose data when this receiver uses an older schema.
const unknownFieldsKey = "_cf_protobuf_unknown_fields"

func EncodeProxyInformation(record *api.AuditRecord) (datatypes.JSON, error) {
	if hasJSONBNul(record) {
		return nil, errors.New("protobuf text contains U+0000, which JSONB cannot store")
	}
	raw, err := (protojson.MarshalOptions{UseProtoNames: true, EmitDefaultValues: true}).Marshal(record)
	if err != nil {
		return nil, err
	}
	unknown := map[string][]byte{}
	visitMessages(record.ProtoReflect(), "", func(path string, m protoreflect.Message) {
		if b := m.GetUnknown(); len(b) != 0 {
			unknown[path] = b
		}
	})
	if len(unknown) == 0 {
		return raw, nil
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}
	fields[unknownFieldsKey], err = json.Marshal(unknown)
	if err != nil {
		return nil, err
	}
	return json.Marshal(fields)
}

// PostgreSQL JSONB cannot represent U+0000 in text, even as a JSON escape.
// Byte captures and unknown wire fields are base64 and remain unrestricted here.
func hasJSONBNul(record *api.AuditRecord) bool {
	found := false
	visitMessages(record.ProtoReflect(), "", func(_ string, m protoreflect.Message) {
		m.Range(func(fd protoreflect.FieldDescriptor, value protoreflect.Value) bool {
			switch {
			case fd.IsMap():
				value.Map().Range(func(k protoreflect.MapKey, v protoreflect.Value) bool {
					if strings.ContainsRune(k.String(), 0) || (fd.MapValue().Kind() == protoreflect.StringKind && strings.ContainsRune(v.String(), 0)) {
						found = true
					}
					return !found
				})
			case fd.IsList():
				if fd.Kind() == protoreflect.StringKind {
					for i := 0; i < value.List().Len(); i++ {
						if strings.ContainsRune(value.List().Get(i).String(), 0) {
							found = true
						}
					}
				}
			case fd.Kind() == protoreflect.StringKind:
				if strings.ContainsRune(value.String(), 0) {
					found = true
				}
			}
			return !found
		})
	})
	return found
}

func DecodeProxyInformation(raw []byte) (*api.AuditRecord, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}
	unknown := map[string][]byte{}
	if value, ok := fields[unknownFieldsKey]; ok {
		if err := json.Unmarshal(value, &unknown); err != nil {
			return nil, err
		}
		delete(fields, unknownFieldsKey)
	}
	known, err := json.Marshal(fields)
	if err != nil {
		return nil, err
	}
	record := new(api.AuditRecord)
	if err := protojson.Unmarshal(known, record); err != nil {
		return nil, err
	}
	visitMessages(record.ProtoReflect(), "", func(path string, m protoreflect.Message) { m.SetUnknown(unknown[path]) })
	return record, nil
}

func visitMessages(m protoreflect.Message, path string, visit func(string, protoreflect.Message)) {
	visit(path, m)
	m.Range(func(fd protoreflect.FieldDescriptor, value protoreflect.Value) bool {
		next := path + "/" + string(fd.Name())
		switch {
		case fd.IsMap():
			if fd.MapValue().Kind() == protoreflect.MessageKind {
				value.Map().Range(func(k protoreflect.MapKey, v protoreflect.Value) bool {
					visitMessages(v.Message(), next+"/"+strconv.Quote(k.String()), visit)
					return true
				})
			}
		case fd.IsList():
			if fd.Kind() == protoreflect.MessageKind {
				list := value.List()
				for i := 0; i < list.Len(); i++ {
					visitMessages(list.Get(i).Message(), next+"/"+strconv.Itoa(i), visit)
				}
			}
		case fd.Kind() == protoreflect.MessageKind:
			visitMessages(value.Message(), next, visit)
		}
		return true
	})
}

func EqualProxyInformation(left, right []byte) (bool, error) {
	a, err := DecodeProxyInformation(left)
	if err != nil {
		return false, err
	}
	b, err := DecodeProxyInformation(right)
	if err != nil {
		return false, err
	}
	return proto.Equal(a, b), nil
}

// ProxySuccess uses response evidence, never the applied-outcome enum alone.
// It describes the observed transport/application step, not remote business success.
func ProxySuccess(record *api.AuditRecord) *bool {
	response := record.GetResponseObservation()
	if response == nil {
		return nil
	}
	result := response.GetErrorCode() == "" || response.GetErrorCode() == "blocked"
	return &result
}

// NewProxyAuditEvent validates and maps one record. The RPC handler validates
// the full request envelope, including unknown fields, before calling this.
func NewProxyAuditEvent(record *api.AuditRecord) (*Audit, error) {
	if err := ValidateProxyRecord(record); err != nil {
		return nil, &ValidationError{msg: err.Error()}
	}
	information, err := EncodeProxyInformation(record)
	if err != nil {
		return nil, &ValidationError{msg: "audit record cannot be encoded: " + err.Error()}
	}
	association := record.GetMasId()
	if utf8.RuneCountInString(association) > 128 {
		association = ""
	}
	sourceID := record.GetAuditRecordId()
	outcome := NormalizeOutcome(record.GetAppliedOutcome().String())
	return &Audit{
		Source: SourceProxy, SourceRecordID: &sourceID, Outcome: &outcome,
		ResourceType: ResourceTypeEnforcementProxy, ResourceIdentifier: "",
		AuditType: AuditTypeProxyMediated, AuditResourceIdentifier: association,
		AuditInformation: information, Success: ProxySuccess(record),
		CreatedBy: uuid.Nil, LastModifiedBy: uuid.Nil,
		CreatedOn: record.GetRecordedAt().AsTime(), LastModifiedOn: time.Now().UTC(),
	}, nil
}

// AppendProxyAuditEvent commits before acknowledgement. The unique index also
// serializes concurrent attempts on the same producer ID across CFN replicas.
func AppendProxyAuditEvent(ctx context.Context, db *gorm.DB, event *Audit) error {
	if event.Source != SourceProxy || event.SourceRecordID == nil || *event.SourceRecordID == "" {
		return &ValidationError{msg: "Proxy source and record ID are required"}
	}
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		event.ID = uuid.New()
		inserted := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "source"}, {Name: "source_record_id"}}, DoNothing: true}).Create(event)
		if inserted.Error != nil {
			return inserted.Error
		}
		if inserted.RowsAffected == 1 {
			return nil
		}
		var stored Audit
		if err := tx.Where("source = ? AND source_record_id = ?", event.Source, *event.SourceRecordID).First(&stored).Error; err != nil {
			return err
		}
		equal, err := EqualProxyInformation(stored.AuditInformation, event.AuditInformation)
		if err != nil {
			return err
		}
		if !equal {
			return ErrRecordConflict
		}
		return nil
	})
}
