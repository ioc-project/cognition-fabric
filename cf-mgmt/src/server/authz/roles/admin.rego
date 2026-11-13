# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

package authz.roles.admin

import rego.v1
import data.authz.operations.workspaces
import data.authz.operations.users
import data.authz.operations.softwares
import data.authz.operations.cognition_fabric_node
import data.authz.operations.cognition_engine
import data.authz.operations.memory_provider
import data.authz.operations.multi_agentic_system

# Admin role permissions - full access to all operations
allow if {
	input.user.role == "admin"
	input.resource == "workspace"
	input.operation in workspaces.admin
}

allow if {
	input.user.role == "admin"
	input.resource == "user"
	input.operation in users.admin
}

allow if {
	input.user.role == "admin"
	input.resource == "software"
	input.operation in softwares.admin
}

allow if {
	input.user.role == "admin"
	input.resource == "cognition_fabric_node"
	input.operation in cognition_fabric_node.admin
}

allow if {
	input.user.role == "admin"
	input.resource == "cognition_engine"
	input.operation in cognition_engine.admin
}

allow if {
	input.user.role == "admin"
	input.resource == "memory_provider"
	input.operation in memory_provider.admin
}

allow if {
	input.user.role == "admin"
	input.resource == "multi_agentic_system"
	input.operation in multi_agentic_system.admin
}
