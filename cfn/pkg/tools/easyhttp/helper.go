// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package easyhttp

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

// GetURLPathUUID extracts and validates a UUID path parameter.
func GetURLPathUUID(r *http.Request, key string) (string, error) {
	id := r.PathValue(key)
	if err := uuid.Validate(id); err != nil {
		return "", err
	}
	return id, nil
}

// RespondWithJSON writes a JSON response with the given status code.
func RespondWithJSON(w http.ResponseWriter, code int, payload interface{}) (int, error) {
	response, err := json.Marshal(payload)
	if err != nil {
		getLogger().Warnf("error marshaling response to json: %s", err)
		return http.StatusInternalServerError, err
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
	return code, nil
}

// PathParam extracts a path parameter from the request.
func PathParam(r *http.Request, key string) string {
	return r.PathValue(key)
}

// WrapHandler converts an EasyHandler to a standard http.Handler for testing.
func WrapHandler(h EasyHandler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		code, err := h(w, r)
		if err != nil {
			getLogger().Errorf("handler error: status=%d err=%v", code, err)
		}
	})
}
