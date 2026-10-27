package main

import (
	"fmt"
	"strconv"
	"time"
)

type contextConfig struct {
	wait      time.Duration
	attempts  int
	retryWait time.Duration
}

func loadContextConfig() (contextConfig, error) {
	var cfg contextConfig
	var err error
	cfg.wait, err = time.ParseDuration(env("CE_CONTEXT_WAIT", "1s"))
	if err != nil || cfg.wait <= 0 || cfg.wait > 25*time.Second {
		return cfg, fmt.Errorf("CE_CONTEXT_WAIT must be a positive duration up to 25s")
	}
	cfg.attempts, err = strconv.Atoi(env("CE_CONTEXT_ATTEMPTS", "5"))
	if err != nil || cfg.attempts <= 0 {
		return cfg, fmt.Errorf("CE_CONTEXT_ATTEMPTS must be a positive integer (including the initial attempt)")
	}
	cfg.retryWait, err = time.ParseDuration(env("CE_CONTEXT_RETRY_WAIT", "0.2s"))
	if err != nil || cfg.retryWait <= 0 {
		return cfg, fmt.Errorf("CE_CONTEXT_RETRY_WAIT must be a positive duration")
	}
	return cfg, nil
}
