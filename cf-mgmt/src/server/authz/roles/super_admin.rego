# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

package authz.roles.super_admin

import rego.v1

# Super admin role - full access to all operations (bypasses all restrictions)
# Super admins have unrestricted access to all resources and operations
allow if {
	input.user.role == "super_admin"
}
