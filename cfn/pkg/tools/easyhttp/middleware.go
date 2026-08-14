// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package easyhttp

import (
	"fmt"
	"net/http"
	"time"
)

// panicRecoverMiddleware recovers from panics to prevent server crashes.
func panicRecoverMiddleware(h http.Handler) http.Handler {
	log := getLogger()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if panicErr := recover(); panicErr != nil {
				panicMsg := fmt.Sprintf("recovered from panic: [%s]", panicErr)
				log.Error(panicMsg)
				http.Error(w, panicMsg, http.StatusInternalServerError)
			}
		}()
		h.ServeHTTP(w, r)
	})
}

// loggingMiddleware logs details for all incoming requests.
func loggingMiddleware(h http.Handler) http.Handler {
	log := getLogger()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method := r.Method
		uri := r.RequestURI
		userAgent := r.UserAgent()

		// Skip logging for requests with ?log=false
		q := r.URL.Query()
		if q.Get("log") == "false" {
			log.Debugf("%s %s ->", method, uri)
			h.ServeHTTP(w, r)
			return
		}

		remoteAddr := r.RemoteAddr
		referer := r.Referer()

		log.Infof("%s %s ->", method, uri)

		cw := &cleanResponseWriter{ResponseWriter: w}

		start := time.Now()
		h.ServeHTTP(cw, r)
		dur := time.Since(start)

		responseStatus := fmt.Sprintf("%d - %s", cw.responseStatusCode,
			http.StatusText(cw.responseStatusCode))
		log.Infof("-> [%s] [%s] [%s] [%s] [%s] [%s] [%s] [%s] [%s]",
			remoteAddr,
			start.Format(time.RFC3339),
			method,
			uri,
			responseStatus,
			fmt.Sprintf("%db", cw.responseSize),
			dur,
			referer,
			userAgent,
		)
	})
}

type cleanResponseWriter struct {
	http.ResponseWriter
	responseStatusCode int
	responseSize       int
	wroteHeader        bool
}

func (w *cleanResponseWriter) Write(b []byte) (int, error) {
	size, err := w.ResponseWriter.Write(b)
	w.responseSize += size
	return size, err
}

func (w *cleanResponseWriter) WriteHeader(statusCode int) {
	w.ResponseWriter.WriteHeader(statusCode)
	w.responseStatusCode = statusCode
	w.wroteHeader = true
}
