// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import NextAuth from 'next-auth';
import {authOptions} from '@/lib/auth-config';

const handler = NextAuth(authOptions);

export {handler as GET, handler as POST};
