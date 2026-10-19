// Package ids validates the W3C trace and span identifiers a request carries.
package ids

import (
	"encoding/hex"
	"strings"
)

// Valid reports whether s is n lowercase hexadecimal characters and not all zero.
func Valid(s string, n int) bool {
	_, err := hex.DecodeString(s)
	return len(s) == n && err == nil && s == strings.ToLower(s) && s != strings.Repeat("0", n)
}
