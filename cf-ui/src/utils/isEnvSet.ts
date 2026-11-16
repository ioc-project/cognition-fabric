// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

const isEnvSet = (env?: unknown): boolean => {
  if (typeof env === 'undefined' || env === null) {
    return false;
  }
  if (typeof env === 'string') {
    return env.trim().length > 0 && env !== 'undefined';
  }
  return true;
};

export default isEnvSet;
