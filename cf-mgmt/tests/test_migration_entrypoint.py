# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Check migration startup decisions without running psql, Alembic or a server."""

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize(
    "old_tracker,alembic_tracker,expected_code",
    [("t", "f", 1), ("f", "f", 0), ("t", "t", 0)],
    ids=["unversioned-legacy-refused", "empty-database-upgrades", "versioned-database-upgrades"],
)
def test_entrypoint_never_stamps_a_legacy_database(tmp_path, old_tracker, alembic_tracker, expected_code):
    commands = tmp_path / "commands"
    commands.mkdir()
    log = tmp_path / "calls.jsonl"
    psql = commands / "psql"
    psql.write_text(
        f"#!{sys.executable}\n"
        "import os,sys\n"
        "legacy = 'schema_migrations' in ' '.join(sys.argv)\n"
        "key = 'STAGE1_TEST_OLD_TRACKER' if legacy else 'STAGE1_TEST_ALEMBIC_TRACKER'\n"
        "print(os.environ[key])\n"
    )
    psql.chmod(0o755)
    for tool in ("alembic", "uvicorn"):
        executable = commands / tool
        executable.write_text(
            f"#!{sys.executable}\n"
            "import json,os,sys\n"
            "with open(os.environ['STAGE1_TEST_CALLS'], 'a') as target:\n"
            "    target.write(json.dumps([sys.argv[0].split('/')[-1], sys.argv[1:]]) + '\\n')\n"
        )
        executable.chmod(0o755)
    script = (Path(__file__).parents[1] / "docker-entrypoint.sh").read_text()
    # Only relocate the image's fixed application directory into this fixture.
    script = script.replace("cd /home/app", 'cd "$STAGE1_TEST_APP_DIR"').replace(
        'SEED_FILE="/home/app/', 'SEED_FILE="${STAGE1_TEST_APP_DIR}/'
    )
    result = subprocess.run(
        ["bash", "-c", script],
        env={
            **os.environ,
            "PATH": str(commands) + os.pathsep + os.environ["PATH"],
            "POSTGRES_USER": "unused",
            "POSTGRES_PASSWORD": "unused",
            "POSTGRES_HOST": "unused",
            "POSTGRES_PORT": "1",
            "POSTGRES_DB": "unused",
            "STAGE1_TEST_APP_DIR": str(tmp_path),
            "STAGE1_TEST_OLD_TRACKER": old_tracker,
            "STAGE1_TEST_ALEMBIC_TRACKER": alembic_tracker,
            "STAGE1_TEST_CALLS": str(log),
        },
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == expected_code, result.stderr
    calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
    if expected_code:
        assert "Reconcile its actual schema" in result.stderr
        assert "No revisions were stamped" in result.stderr
        assert calls == []
    else:
        assert calls == [
            ["alembic", ["upgrade", "head"]],
            ["uvicorn", ["server.main:app", "--host", "0.0.0.0", "--port", "9000"]],
        ]
