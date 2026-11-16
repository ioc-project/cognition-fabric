# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

package authz.roles.guest

import rego.v1

# Guest role permissions - no permissions allowed
# Guests cannot perform any operations in the system
default allow := false
