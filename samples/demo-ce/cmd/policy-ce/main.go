// policy-ce is a policy-driven Cognition Engine: it loads identity and content rules per MAS from a JSON
// file and answers CFN's ioc.ce.v1.CognitionEngine calls from them. See the README.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/cfn"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/oxp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
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
	f, err := os.Open(env("CE_POLICY_FILE", "/etc/policy-ce/policy.json"))
	if err != nil {
		return err
	}
	set, err := policy.DecodeSet(f)
	f.Close()
	if err != nil {
		return err
	}
	ceType, ceVersion := env("CE_TYPE", "CASA"), env("CE_VERSION", "reference-v1")
	// With a single policy the MAS comes from CE_MAS_FILE, which a bootstrap may write after this CE
	// registers, so it cannot be required at startup; Evaluate reports Unavailable until it exists.
	masID := func() (string, error) {
		raw, err := os.ReadFile(env("CE_MAS_FILE", "/var/lib/policy-ce/mas-id"))
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
	advertisedGRPC := env("ADVERTISED_GRPC_ADDRESS", "policy-ce:18001")
	healthURL := os.Getenv("ADVERTISED_HEALTH_URL")
	if healthURL == "" {
		if healthURL, err = cfn.HealthURL(advertisedGRPC, httpListen); err != nil {
			return err
		}
	}
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
		l := cfn.Lifecycle{Base: strings.TrimRight(env("CFN_URL", "http://ioc-scale-cfn-svc:9002"), "/"), Address: advertisedGRPC, HealthURL: healthURL, Name: env("CE_NAME", "policy-ce"), Version: ceVersion, Type: ceType, Client: client}
		l.Run(ctx, ready.Store)
	}()
	identity, content := set.RuleCounts()
	log.Printf("policy-ce started: mas_policies=%d identity_rules=%d content_rules=%d context_wait=%gs context_attempts=%d context_retry_wait=%gs", max(len(set.ByMAS), 1), identity, content, contextCfg.wait.Seconds(), contextCfg.attempts, contextCfg.retryWait.Seconds())
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
		log.Fatal(err)
	}
}
