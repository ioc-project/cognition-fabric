// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// @title           IOC Cognition Fabric Node API
// @version         0.1.0
// @description     Cognition Fabric Node (CFN) service that connects Cognition Engines to the management plane.
// @license.name    Apache 2.0
// @license.url     http://www.apache.org/licenses/LICENSE-2.0.html
// @host            localhost:9002
// @BasePath        /

package main

import (
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/cisco-eti/cognition-fabric/cfn/pkg/app"
	"github.com/cisco-eti/cognition-fabric/cfn/pkg/tools/logger"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file if it exists (ignore error if not found)
	_ = godotenv.Load()

	logger.Init()
	log := logger.Default()

	// Get HTTP port from environment or use default
	portStr := os.Getenv("APP_PORT")
	if portStr == "" {
		portStr = "9002"
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		log.Fatalf("invalid APP_PORT: %v", err)
	}

	// Get gRPC port from environment or use default
	grpcPortStr := os.Getenv("GRPC_PORT")
	if grpcPortStr == "" {
		grpcPortStr = "9003"
	}
	grpcPort, err := strconv.Atoi(grpcPortStr)
	if err != nil {
		log.Fatalf("invalid GRPC_PORT: %v", err)
	}

	// Create and start the application
	application, err := app.New(port, grpcPort)
	if err != nil {
		log.Fatalf("failed to create application: %v", err)
	}

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigChan
		log.Infof("received signal %v, shutting down...", sig)
		if err := application.Stop(); err != nil {
			log.Errorf("error during shutdown: %v", err)
		}
		os.Exit(0)
	}()

	// Run the server (blocks until shutdown)
	if err := application.Run(); err != nil {
		log.Fatalf("application error: %v", err)
	}
}
