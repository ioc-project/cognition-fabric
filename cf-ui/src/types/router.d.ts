// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {RouteObject} from 'react-router';

type RouteMod = Omit<RouteObject, 'children'>;

export interface CustomRoute extends RouteMod {
  disabled?: boolean;
  children?: CustomRoute[];
}

export type Route = CustomRoute;
