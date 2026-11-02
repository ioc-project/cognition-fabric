// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/cisco-eti/ioc-scale-cfn-svc/docs/api" // Swagger docs
	enforcementv1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/audit"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/database"
	httpclient "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/http"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/config"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/tools/easyhttp"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/tools/logger"
	httpSwagger "github.com/swaggo/http-swagger"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

var (
	l    *zap.SugaredLogger
	once sync.Once
)

func getLogger() *zap.SugaredLogger {
	once.Do(func() {
		l = logger.SubPkg("app")
	})
	return l
}

var (
	// CfnID is the CFN identifier returned by the management plane on registration.
	CfnID string
	// MgmtURL is the management plane base URL.
	MgmtURL string
	// ParsedConfig is the typed config from the management plane.
	ParsedConfig *CfnConfigPayload
	// ConfigVersion tracks the config version for detecting changes.
	ConfigVersion int64
	// cfnConfigMutex protects concurrent access to ParsedConfig and ConfigVersion.
	cfnConfigMutex sync.RWMutex
)

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// getOutboundIP determines the service's outbound IP address.
func getOutboundIP() string {
	log := getLogger()

	// Allow explicit override via environment variable
	if ip := os.Getenv("CFN_IP"); ip != "" {
		log.Infof("using CFN_IP from environment: %s", ip)
		return ip
	}

	// Query network interfaces and pick the first non-loopback IPv4 address
	interfaces, err := net.Interfaces()
	if err != nil {
		log.Errorf("failed to query network interfaces: %v", err)
		return "127.0.0.1"
	}

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}

			if ip == nil || ip.IsLoopback() {
				continue
			}
			ip = ip.To4()
			if ip == nil {
				continue
			}

			log.Infof("detected service IP from interface %s: %s", iface.Name, ip.String())
			return ip.String()
		}
	}

	log.Warnf("no suitable network interface found, falling back to 127.0.0.1")
	return "127.0.0.1"
}

// App represents the CFN application.
type App struct {
	server         *easyhttp.EasyServer
	grpcServer     *grpc.Server
	enforcementSrv *enforcementServer
	stopChan       chan struct{}
	port           int
	grpcPort       int
	db             database.Store

	// probeTimeout is how long CE health probes wait for an answer (zero means the default).
	probeTimeout time.Duration
}

// New creates a new CFN application.
func New(port, grpcPort int) (*App, error) {
	log := getLogger()

	pagination := config.PaginationFromEnv()
	audit.SetPaginationConfig(pagination.DefaultPageSize, pagination.MaxPageSize)
	log.Infof("pagination config: defaultPageSize=%d maxPageSize=%d", audit.DefaultPageSize(), audit.MaxPageSize())

	db, err := database.New(config.DatabaseFromEnv())
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	if err := db.MigrateUp(); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}
	log.Info("connected to database and ran migrations")

	a := &App{
		stopChan: make(chan struct{}),
		port:     port,
		grpcPort: grpcPort,
		db:       db,
	}

	rtr := a.initializeRoutes()
	a.server = easyhttp.NewServer(port, rtr)

	// Initialize gRPC server
	a.grpcServer = grpc.NewServer()
	a.enforcementSrv = newEnforcementServer(db)
	enforcementv1.RegisterEnforcementServer(a.grpcServer, a.enforcementSrv)
	reflection.Register(a.grpcServer)

	a.registerOnStartup()
	return a, nil
}

// registerOnStartup registers the CFN with the management plane.
func (a *App) registerOnStartup() {
	log := getLogger()
	mgmtURL := getEnvOrDefault("MGMT_URL", "http://localhost:9000")
	cfnName := getEnvOrDefault("CFN_NAME", "cfn-local")
	appIP := getOutboundIP()
	appPort := a.port

	if mgmtURL == "" {
		log.Fatalf("MGMT_URL not set")
	}

	// Store management plane URL globally for later API calls
	MgmtURL = mgmtURL

	registerURL := mgmtURL + "/api/cognition-fabric-nodes/register"
	log.Infof("registering CFN at %s", registerURL)

	body, _ := json.Marshal(map[string]any{
		"name":       cfnName,
		"ip_address": appIP,
		"port":       appPort,
	})

	client := httpclient.New(30 * time.Second)
	ctx := context.Background()
	headers := map[string]string{
		"Content-Type": "application/json",
		"Accept":       "application/json",
	}

	resp, err := client.Post(ctx, registerURL, body, headers)
	if err != nil {
		log.Fatalf("CFN registration failed: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Fatalf("failed to decode registration response: %v", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Fatalf("CFN registration failed: status=%d, response=%v", resp.StatusCode, result)
	}

	// Store id from response globally
	id, ok := result["id"].(string)
	if !ok || id == "" {
		log.Fatalf("registration response missing id")
	}
	CfnID = id

	var applied *CfnConfigPayload
	if cfgBlob, ok := result["config"].(map[string]any); ok {
		cfgBytes, _ := json.Marshal(cfgBlob)
		var parsed CfnConfigPayload
		if err := json.Unmarshal(cfgBytes, &parsed); err != nil {
			log.Errorf("failed to parse config into typed struct: %v", err)
		} else {
			applyParsedConfig(&parsed)
			applied = &parsed
		}
	}

	wsIDs := assignedWorkspaceIDs(applied)
	if len(wsIDs) == 0 {
		log.Warnf("no assigned workspaces in config - enforcement requests will fail until a workspace is associated")
	}

	cfgJSON, _ := json.Marshal(applied)
	log.Infof("CFN registered successfully: cfn_id=%s cfn_name=%s assigned_workspaces=%d workspace_ids=%v ip_address=%s port=%d config_version=%d payload=%s",
		CfnID, cfnName, len(wsIDs), wsIDs, appIP, appPort, configVersion(applied), cfgJSON)

	// Start periodic heartbeat
	go a.startHeartbeat(mgmtURL)
}

// RefreshConfig fetches the latest CFN configuration from the management plane.
func (a *App) RefreshConfig(mgmtURL string) error {
	log := getLogger()

	cfnURL := mgmtURL + "/api/cognition-fabric-nodes/" + CfnID

	client := httpclient.New(30 * time.Second)
	ctx := context.Background()
	headers := map[string]string{
		"Accept": "application/json",
	}

	resp, err := client.Get(ctx, cfnURL, headers)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Errorf("RefreshConfig failed: status=%d response=%v", resp.StatusCode, result)
		return fmt.Errorf("RefreshConfig failed: status=%d", resp.StatusCode)
	}

	if cfgBlob, ok := result["config"].(map[string]any); ok {
		cfgBytes, _ := json.Marshal(cfgBlob)
		var parsed CfnConfigPayload
		if err := json.Unmarshal(cfgBytes, &parsed); err != nil {
			log.Errorf("failed to parse refreshed config into typed struct: %v", err)
			return fmt.Errorf("failed to parse config: %v", err)
		}

		oldConfig := applyParsedConfig(&parsed)
		log.Debugf("detecting MAS changes (oldConfig nil: %v)", oldConfig == nil)
		changes := detectMASChanges(oldConfig, &parsed)
		log.Debugf("detected %d MAS changes", len(changes))

		wsIDs := assignedWorkspaceIDs(&parsed)
		log.Infof("CFN Config refreshed, config_version=%d assigned_workspaces=%d workspace_ids=%v", parsed.ConfigVersion, len(wsIDs), wsIDs)

		if len(changes) > 0 {
			log.Infof("detected %d MAS changes, dispatching notifications", len(changes))
			a.dispatchNotifications(changes)
		} else {
			log.Debugf("no MAS changes detected")
		}
	} else {
		log.Warnf("RefreshConfig response missing config key")
	}

	return nil
}

// startHeartbeat sends periodic heartbeat to the management plane.
func (a *App) startHeartbeat(mgmtURL string) {
	log := getLogger()

	heartbeatURL := mgmtURL + "/api/cognition-fabric-nodes/" + CfnID + "/heartbeat"

	intervalStr := getEnvOrDefault("HEARTBEAT_INTERVAL_SECONDS", "10")
	interval, err := time.ParseDuration(intervalStr + "s")
	if err != nil {
		interval = 10 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	client := httpclient.New(10 * time.Second)
	headers := map[string]string{
		"Accept": "application/json",
	}

	log.Infof("starting heartbeat to %s every %s", heartbeatURL, interval)

	for {
		select {
		case <-a.stopChan:
			log.Info("stopping heartbeat")
			return
		case <-ticker.C:
			ctx := context.Background()
			resp, err := client.Put(ctx, heartbeatURL, nil, headers)
			if err != nil {
				log.Errorf("heartbeat failed: %v", err)
				continue
			}

			if resp.StatusCode == http.StatusOK {
				var result map[string]any
				if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
					log.Errorf("failed to decode heartbeat response: %v", err)
					resp.Body.Close()
					continue
				}
				resp.Body.Close()

				// Check if config_version has changed
				if newVersion, ok := result["config_version"].(float64); ok {
					current := configVersion(currentConfig())

					remoteVersion := int64(newVersion)
					log.Debugf("heartbeat response: remote_version=%d local_version=%d", remoteVersion, current)

					if remoteVersion > current {
						log.Infof("config update detected: remote_version=%d local_version=%d - refreshing", remoteVersion, current)
						if err := a.RefreshConfig(mgmtURL); err != nil {
							log.Errorf("failed to refresh config: %v", err)
						}
					}
				}

				log.Debugf("heartbeat successful, status=%d", resp.StatusCode)
			} else {
				resp.Body.Close()
				log.Errorf("heartbeat failed, status=%d", resp.StatusCode)
			}
		}
	}
}

// Run starts the application.
func (a *App) Run() error {
	log := getLogger()

	// Start gRPC server in a goroutine
	go func() {
		log.Infof("starting gRPC server on port %d", a.grpcPort)
		lis, err := net.Listen("tcp", fmt.Sprintf(":%d", a.grpcPort))
		if err != nil {
			log.Fatalf("failed to listen on gRPC port %d: %v", a.grpcPort, err)
		}
		if err := a.grpcServer.Serve(lis); err != nil {
			log.Errorf("gRPC server error: %v", err)
		}
	}()

	log.Infof("starting HTTP server on port %d", a.port)
	return a.server.Start()
}

// Stop stops the application.
func (a *App) Stop() error {
	log := getLogger()

	log.Infof("shutting down CFN service...")
	close(a.stopChan)

	log.Info("- stopping gRPC server")
	a.grpcServer.GracefulStop()

	log.Info("- waiting for in-flight audit writes")
	const auditWaitTimeout = 10 * time.Second
	if !a.enforcementSrv.WaitTimeout(auditWaitTimeout) {
		log.Warnf("timed out after %s waiting for in-flight audit writes, continuing shutdown", auditWaitTimeout)
	}

	log.Info("- stopping HTTP server")
	err := a.server.Stop()

	log.Info("- closing database connection")
	if closeErr := a.db.Close(); closeErr != nil {
		log.Errorf("failed to close database connection: %v", closeErr)
	}

	return err
}

// healthHandler returns service health status.
func (a *App) healthHandler(w http.ResponseWriter, r *http.Request) (int, error) {
	return easyhttp.RespondWithJSON(w, http.StatusOK, map[string]string{
		"status": "healthy",
		"cfn_id": CfnID,
	})
}

// initializeRoutes sets up the HTTP routes.
func (a *App) initializeRoutes() http.Handler {
	log := getLogger()

	a.probeTimeout = probeTimeoutFromEnv()

	rtr := easyhttp.NewRouter()

	// Log incoming requests
	rtr.Use(func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Infof("incoming request: %s %s", r.Method, r.URL.Path)
			h.ServeHTTP(w, r)
		})
	})

	// Diagnostics
	rtr.Get("/api/internal/diagnostics/health", a.healthHandler)

	// CE registration endpoints
	rtr.Post("/api/cognition-engine", a.registerCognitionEngineHandler)
	rtr.Patch("/api/cognition-engine/{ceId}", a.patchCognitionEngineHandler)
	rtr.Delete("/api/cognition-engine/{ceId}", a.deleteCognitionEngineHandler)

	// CE health probe (internal - called by mgmt-svc's CE monitor)
	rtr.Post("/api/internal/mgmt/cognition-engine/probe", a.probeCognitionEngineHandler)
	// MAS query endpoint (proxy to management plane)
	rtr.Get("/api/multi-agentic-systems/{masId}", a.getMASHandler)

	// Audit events (internal - consumed by mgmt-svc's audit passthrough)
	rtr.Get("/api/internal/mgmt/audit", a.listAuditEventsHandler)
	rtr.Get("/api/internal/mgmt/audit/{eventId}", a.getAuditEventHandler)

	// Swagger UI
	rtr.HandleHTTP("/docs/", httpSwagger.WrapHandler)

	return rtr
}

// Port returns the port the server is using (for testing).
func (a *App) Port() int {
	if a.server != nil {
		addr := a.server.Addr
		portStr := strings.TrimPrefix(addr, ":")
		port, _ := strconv.Atoi(portStr)
		return port
	}
	return a.port
}
