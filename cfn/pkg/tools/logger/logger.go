// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package logger

import (
	"os"
	"sync"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	logLevel    = getEnvOrDefault("LOG_LEVEL", "info")
	logEncoding = getEnvOrDefault("LOG_ENCODING", "json")

	atomicLevel = zap.NewAtomicLevelAt(zapcore.InfoLevel)
	std         *zap.SugaredLogger
	initOnce    sync.Once

	serviceName = getEnvOrDefault("SERVICE_NAME", "ioc-cfn-svc")
	appVersion  = getEnvOrDefault("APPLICATION_VERSION", "0.1.0")
)

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// Init initializes the logger. Safe to call multiple times.
func Init() {
	initOnce.Do(func() {
		parsedLevel, err := zapcore.ParseLevel(logLevel)
		if err != nil {
			parsedLevel = zapcore.InfoLevel
		}
		atomicLevel.SetLevel(parsedLevel)
		std = newLogger().Sugar().Named("app")
	})
}

// Default returns the pre-initialized sugared logger.
func Default() *zap.SugaredLogger {
	Init()
	return std
}

// SubPkg returns a new logger for a specific package.
func SubPkg(name string) *zap.SugaredLogger {
	Init()
	return newLogger().Sugar().Named(name)
}

func newLogger() *zap.Logger {
	highPriority := zap.LevelEnablerFunc(func(lvl zapcore.Level) bool {
		return lvl >= zapcore.ErrorLevel && atomicLevel.Enabled(lvl)
	})
	lowPriority := zap.LevelEnablerFunc(func(lvl zapcore.Level) bool {
		return lvl < zapcore.ErrorLevel && atomicLevel.Enabled(lvl)
	})

	config := zap.NewProductionEncoderConfig()
	config.TimeKey = "timestamp"
	config.LevelKey = "level"
	config.NameKey = "logger"
	config.MessageKey = "message"
	config.EncodeTime = zapcore.ISO8601TimeEncoder
	config.EncodeLevel = zapcore.CapitalLevelEncoder

	consoleErrors := zapcore.Lock(os.Stderr)
	consoleDebugging := zapcore.Lock(os.Stdout)

	var encoder zapcore.Encoder
	if logEncoding == "console" {
		encoder = zapcore.NewConsoleEncoder(config)
	} else {
		encoder = zapcore.NewJSONEncoder(config)
	}

	core := zapcore.NewTee(
		zapcore.NewCore(encoder, consoleErrors, highPriority),
		zapcore.NewCore(encoder, consoleDebugging, lowPriority),
	)

	return zap.New(core,
		zap.AddCaller(),
		zap.AddStacktrace(zapcore.ErrorLevel),
	).With(
		zap.String("service", serviceName),
		zap.String("version", appVersion),
	)
}

// GetLevel returns the current log level as a string.
func GetLevel() string {
	return atomicLevel.Level().String()
}

// SetLevel sets the log level.
func SetLevel(level string) error {
	newLevel, err := zapcore.ParseLevel(level)
	if err != nil {
		return err
	}
	atomicLevel.SetLevel(newLevel)
	return nil
}

// Sync flushes any buffered log entries.
func Sync() error {
	if std != nil {
		return std.Sync()
	}
	return nil
}
