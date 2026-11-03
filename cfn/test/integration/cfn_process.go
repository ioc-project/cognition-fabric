// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

//go:build integration

package integration_test

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	. "github.com/onsi/ginkgo/v2"
)

type cfnProcess struct {
	cmd      *exec.Cmd
	httpPort int
	grpcPort int
}

func moduleRoot() string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		panic("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "../.."))
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	port := l.Addr().(*net.TCPAddr).Port
	if err := l.Close(); err != nil {
		return 0, err
	}
	return port, nil
}

func startCFN(mgmtURL string) (*cfnProcess, error) {
	httpPort, err := freePort()
	if err != nil {
		return nil, err
	}
	grpcPort, err := freePort()
	if err != nil {
		return nil, err
	}

	cmd := exec.Command("go", "run", "./cmd/cfn")
	cmd.Dir = moduleRoot()
	cmd.Stdout = GinkgoWriter
	cmd.Stderr = GinkgoWriter
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Env = mergeEnv(map[string]string{
		"MGMT_URL":                   mgmtURL,
		"CFN_NAME":                   "cfn-integration",
		"CFN_IP":                     "127.0.0.1",
		"APP_PORT":                   strconv.Itoa(httpPort),
		"GRPC_PORT":                  strconv.Itoa(grpcPort),
		"HEARTBEAT_INTERVAL_SECONDS": "1",
		"CE_PROBE_TIMEOUT_SECONDS":   "1",
		"SERVER_TIMEOUT_SECONDS":     "5",
	})

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start CFN: %w", err)
	}
	return &cfnProcess{cmd: cmd, httpPort: httpPort, grpcPort: grpcPort}, nil
}

func (p *cfnProcess) HTTPBaseURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d", p.httpPort)
}

func (p *cfnProcess) GRPCAddr() string {
	return fmt.Sprintf("127.0.0.1:%d", p.grpcPort)
}

func (p *cfnProcess) Stop() error {
	if p == nil || p.cmd == nil || p.cmd.Process == nil {
		return nil
	}
	pgid, err := syscall.Getpgid(p.cmd.Process.Pid)
	if err != nil {
		pgid = p.cmd.Process.Pid
	}
	_ = syscall.Kill(-pgid, syscall.SIGTERM)

	done := make(chan error, 1)
	go func() { done <- p.cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-time.After(8 * time.Second):
		_ = syscall.Kill(-pgid, syscall.SIGKILL)
		return <-done
	}
}

func mergeEnv(overrides map[string]string) []string {
	env := map[string]string{}
	for _, kv := range os.Environ() {
		k, v, ok := strings.Cut(kv, "=")
		if ok {
			env[k] = v
		}
	}
	for k, v := range overrides {
		env[k] = v
	}
	out := make([]string, 0, len(env))
	for k, v := range env {
		out = append(out, k+"="+v)
	}
	return out
}
