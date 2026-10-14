# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Client for asking cfn-svc to probe a Cognition Engine."""

import logging
import os

import requests

CFN_SVC_URL_DEFAULT = "http://localhost:9002"
CFN_SVC_CE_PROBE_PATH = "/api/internal/mgmt/cognition-engine/probe"
# Extra time on top of cfn-svc's own probe timeout for the call to cfn-svc itself
CFN_CALL_MARGIN_SECONDS = 1.0

logger = logging.getLogger(__name__)


def probe_ce_health(ce_id: str, probe_timeout_seconds: float) -> bool:
    """Ask cfn-svc to probe a CE, which it resolves to a health_url itself.

    True only if cfn-svc answers 200 with {"healthy": true}. A 404 (cfn-svc does not know the CE), any
    other error, an unreachable cfn-svc or an unreadable body all mean the CE is not healthy.
    """
    url = f"{os.getenv('CFN_SVC_URL', CFN_SVC_URL_DEFAULT)}{CFN_SVC_CE_PROBE_PATH}"
    try:
        response = requests.post(
            url,
            json={"ce_id": ce_id},
            timeout=probe_timeout_seconds + CFN_CALL_MARGIN_SECONDS,
        )
    except requests.exceptions.RequestException as e:
        logger.debug(f"cfn-svc probe call failed for CE {ce_id}: {e}")
        return False

    if response.status_code != 200:
        logger.debug(f"cfn-svc probe returned {response.status_code} for CE {ce_id}")
        return False

    try:
        return response.json().get("healthy") is True
    except (ValueError, AttributeError, TypeError):
        logger.debug(f"cfn-svc probe returned an unexpected body for CE {ce_id}")
        return False
