// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {LoaderRelative} from './loading';

export default function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <LoaderRelative />
    </div>
  );
}
