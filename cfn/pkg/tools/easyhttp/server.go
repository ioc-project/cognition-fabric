// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package easyhttp

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"
)

const defaultServerTimeoutSec = 120

func serverTimeoutDuration() time.Duration {
	sec, _ := strconv.Atoi(os.Getenv("SERVER_TIMEOUT_SECONDS"))
	if sec <= 0 {
		sec = defaultServerTimeoutSec
	}
	return time.Duration(sec) * time.Second
}

// EasyServer wraps http.Server with convenience methods.
type EasyServer struct {
	*http.Server
}

// NewServer creates a new server on the specified port.
func NewServer(port int, handler http.Handler) *EasyServer {
	return &EasyServer{Server: &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      handler,
		ReadTimeout:  serverTimeoutDuration(),
		WriteTimeout: serverTimeoutDuration(),
	}}
}

// Start begins listening and serving requests.
func (es *EasyServer) Start() error {
	err := es.Server.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

// Stop gracefully shuts down the server.
func (es *EasyServer) Stop() error {
	log := getLogger()
	log.Infof("shutting down server on port [%s]", es.Server.Addr)
	ctx, cancel := context.WithTimeout(context.Background(), serverTimeoutDuration())
	defer cancel()
	return es.Server.Shutdown(ctx)
}
