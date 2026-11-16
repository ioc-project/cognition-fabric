# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

package authz.operations.users

import rego.v1

# Admin operations - full access
admin := [
	"get_user",
	"create_user",
	"update_user",
	"delete_user",
]

# Viewer operations - read-only
viewer := [
	"get_user",
]

# Guest operations - no access
guest := []
