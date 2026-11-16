// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package easyhttp

import (
	"fmt"
	"net/http"
	"sync"

	"github.com/cisco-eti/cognition-fabric/cfn/pkg/tools/logger"
	"go.uber.org/zap"
)

var (
	l    *zap.SugaredLogger
	once sync.Once
)

func getLogger() *zap.SugaredLogger {
	once.Do(func() {
		l = logger.SubPkg("easyhttp")
	})
	return l
}

// Router wraps http.ServeMux with middleware support and easy handler signature.
type Router struct {
	mux         *http.ServeMux
	middlewares []middleware
	wrappedMux  http.Handler
}

type middleware func(http.Handler) http.Handler

// NewRouter initializes a router with logging and panic recovery middleware.
func NewRouter() *Router {
	mux := http.NewServeMux()
	rtr := &Router{
		mux:         mux,
		middlewares: []middleware{},
		wrappedMux:  loggingMiddleware(panicRecoverMiddleware(mux)),
	}

	// Default 404 handler
	rtr.Handle("/", func(http.ResponseWriter, *http.Request) (int, error) {
		return http.StatusNotFound, nil
	})

	return rtr
}

func (rtr *Router) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rtr.wrappedMux.ServeHTTP(w, r)
}

// Use registers middleware.
func (rtr *Router) Use(mw middleware) {
	rtr.middlewares = append(rtr.middlewares, mw)
}

func (rtr *Router) Get(path string, eh EasyHandler) {
	rtr.byMethod(http.MethodGet, path, eh)
}

func (rtr *Router) Post(path string, eh EasyHandler) {
	rtr.byMethod(http.MethodPost, path, eh)
}

func (rtr *Router) Put(path string, eh EasyHandler) {
	rtr.byMethod(http.MethodPut, path, eh)
}

func (rtr *Router) Patch(path string, eh EasyHandler) {
	rtr.byMethod(http.MethodPatch, path, eh)
}

func (rtr *Router) Delete(path string, eh EasyHandler) {
	rtr.byMethod(http.MethodDelete, path, eh)
}

func (rtr *Router) Handle(path string, eh EasyHandler) {
	rtr.byMethod("", path, eh)
}

func (rtr *Router) HandleHTTP(path string, h http.Handler) {
	rtr.mux.Handle(path, h)
}

func (rtr *Router) byMethod(method, path string, eh EasyHandler) {
	h := wrapToEasyHandler(eh)
	for i := len(rtr.middlewares) - 1; i >= 0; i-- {
		h = rtr.middlewares[i](h)
	}
	rtr.mux.Handle(fmt.Sprintf("%s %s", method, path), h)
}

// EasyHandler is an http handler that returns status code and error.
type EasyHandler func(http.ResponseWriter, *http.Request) (int, error)

func wrapToEasyHandler(h EasyHandler) http.Handler {
	log := getLogger()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cw := &cleanResponseWriter{ResponseWriter: w}
		code, err := h(cw, r)
		if err == nil {
			if !cw.wroteHeader {
				if code == 0 {
					code = http.StatusOK
				}
				RespondWithJSON(w, code, map[string]string{"status": http.StatusText(code)})
			}
			return
		}

		if code >= http.StatusInternalServerError && code != http.StatusNotImplemented {
			log.Errorf("[%s %s %d] error: %+v", r.Method, r.URL, code, err)
		} else {
			log.Infof("[%s %s %d] error: %s", r.Method, r.URL, code, err)
		}

		RespondWithJSON(w, code, map[string]string{"error": err.Error()})
	})
}
