// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import type {components} from '../generated/schema';

export type Workspace = components['schemas']['WorkspaceDetail'];
export type WorkspaceRole = components['schemas']['WorkspaceRole'];

export type CreateWorkspaceRequest = components['schemas']['WorkspaceCreate'];
export type CreateWorkspaceResponse = components['schemas']['WorkspaceResponse'];

export type ListWorkspacesResponse = components['schemas']['WorkspaceList'];

export type UpdateWorkspaceRequest = components['schemas']['WorkspaceUpdate'];

export type ValidationErrorDetail = components['schemas']['ValidationError'];
export type HTTPValidationError = components['schemas']['HTTPValidationError'];
