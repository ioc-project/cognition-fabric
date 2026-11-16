// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// demo-ce is a demonstration Cognition Engine: it loads identity and content rules per MAS from a JSON
// file and answers CFN's ioc.ce.v1.CognitionEngine calls from them. See the README.
package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/cfn"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/logging"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/oxp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/pkg/config"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func run() error {
	logger, err := logging.New(os.Stderr, env("LOG_FORMAT", "console"), env("LOG_LEVEL", "info"), os.Getenv("NO_COLOR") != "")
	if err != nil {
		return err
	}
	slog.SetDefault(logger)
	f, err := os.Open(env("CE_CONFIG_FILE", "/etc/demo-ce/config.json"))
	if err != nil {
		return err
	}
	set, err := config.DecodeSet(f)
	f.Close()
	if err != nil {
		return err
	}
	ceType, ceVersion := env("CE_TYPE", "CASA"), env("CE_VERSION", "1.0.0")
	// With a single config the MAS comes from CE_MAS_FILE, which a bootstrap may write after this CE
	// registers, so it cannot be required at startup; Evaluate reports Unavailable until it exists.
	masID := func() (string, error) {
		raw, err := os.ReadFile(env("CE_MAS_FILE", "/var/lib/demo-ce/mas-id"))
		return strings.TrimSpace(string(raw)), err
	}
	// OXP supplies causal span history and the Cognition Store. Without it the CE
	// can still judge pre-call inputs, but does not read or write findings.
	oxpURL := strings.TrimRight(os.Getenv("OXP_API_URL"), "/")
	client := &http.Client{Timeout: time.Second}
	contextCfg, err := loadContextConfig()
	if err != nil {
		return err
	}
	var store *oxp.Store
	if oxpURL != "" {
		store = &oxp.Store{Base: oxpURL, Client: client}
	}
	events := inbox.New(os.Getenv("CE_EVENT_SERVICE"), 4096)
	server := engine.New(set, engine.Options{MasID: masID, OXPURL: oxpURL, Store: store, Inbox: events, Wait: contextCfg.wait, Attempts: contextCfg.attempts, RetryWait: contextCfg.retryWait, CEType: ceType, CEVersion: ceVersion})

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	var ready atomic.Bool
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		if !ready.Load() {
			http.Error(w, "CF registration pending", 503)
			return
		}
		w.WriteHeader(200)
	})
	mux.HandleFunc("POST /events", events.Receive)
	mux.HandleFunc("GET /events", events.Inspect)
	mux.HandleFunc("GET /info", func(w http.ResponseWriter, r *http.Request) {
		info, _ := server.GetInfo(r.Context(), &cev1.GetInfoRequest{})
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(info)
	})
	httpListen := env("HTTP_LISTEN_ADDRESS", ":18000")
	// CFN probes this URL to check the CE is alive. It defaults to the advertised gRPC host and the HTTP port.
	advertisedGRPC := env("ADVERTISED_GRPC_ADDRESS", "demo-ce:18001")
	healthURL, notifyURL, err := cfn.AdvertisedURLs(advertisedGRPC, httpListen, os.Getenv("ADVERTISED_HEALTH_URL"), os.Getenv("ADVERTISED_NOTIFICATION_URL"))
	if err != nil {
		return err
	}
	lifecycle := cfn.Lifecycle{Base: strings.TrimRight(env("CFN_URL", "http://ioc-scale-cfn-svc:9002"), "/"), Address: advertisedGRPC, HealthURL: healthURL, NotificationURL: notifyURL, Name: env("CE_NAME", "demo-ce"), Version: ceVersion, Type: ceType, Client: client, Work: ctx}
	mux.HandleFunc("POST /notification", lifecycle.NotificationHandler)
	httpServer := &http.Server{Addr: httpListen, Handler: mux, ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 3 * time.Second, WriteTimeout: 3 * time.Second, IdleTimeout: 30 * time.Second}
	listener, err := net.Listen("tcp", env("GRPC_LISTEN_ADDRESS", ":18001"))
	if err != nil {
		return err
	}
	g := grpc.NewServer(grpc.MaxRecvMsgSize(65536))
	cev1.RegisterCognitionEngineServer(g, server)
	reflection.Register(g)
	failures := make(chan error, 2)
	go func() { failures <- g.Serve(listener) }()
	go func() { failures <- httpServer.ListenAndServe() }()
	done := make(chan struct{})
	go func() {
		defer close(done)
		lifecycle.Run(ctx, ready.Store)
	}()
	identity, content := set.RuleCounts()
	slog.Info("Demo CE started", "event", "startup", "stage", "CE", "mas_configs", max(len(set.ByMAS), 1), "identity_rules", identity, "content_rules", content, "oxp_enabled", oxpURL != "", "cognition_store_enabled", store != nil, "context_wait", contextCfg.wait, "context_attempts", contextCfg.attempts, "context_retry_wait", contextCfg.retryWait)
	select {
	case <-ctx.Done():
	case err = <-failures:
		stop()
	}
	stop()
	<-done
	shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdown)
	// Stop bounded RPCs; a stalled peer cannot hold shutdown indefinitely.
	drained := make(chan struct{})
	go func() { g.GracefulStop(); close(drained) }()
	select {
	case <-drained:
	case <-shutdown.Done():
		g.Stop()
	}
	return err
}

func main() {
	if err := run(); err != nil {
		slog.Error("Demo CE stopped", "error", err)
		os.Exit(1)
	}
}
