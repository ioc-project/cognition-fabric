# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import pytest

from noa_trip_planner.tooling.operations import calculate, list_documents, read_document


def test_calculate_supports_expected_operations() -> None:
    assert calculate("sqrt(25) + 3 * 4") == "17.0"


def test_document_access_uses_collection_scoped_names() -> None:
    documents = list_documents("schedule_agent")

    assert "train_table.txt" in documents
    assert "Celestia" in read_document("schedule_agent", "Celestia.txt")


@pytest.mark.parametrize(
    "document_name", ["../concierge_agent/train_fares.txt", "/etc/passwd"]
)
def test_document_access_rejects_paths(document_name: str) -> None:
    with pytest.raises(ValueError, match="file name without a path"):
        read_document("schedule_agent", document_name)
