# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Read-only Alembic compatibility check, run with the selected management Python.

Run from management's working directory, before its migration entrypoint. Image
tasks feed this script to Python stdin so no management checkout is required.
"""

import os
import sys

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError


class MigrationCompatibilityError(RuntimeError):
    pass


def require_compatible_revisions(script, current):
    heads = script.get_heads()
    if len(heads) != 1:
        raise MigrationCompatibilityError(
            f"Selected management version must have one Alembic head; found {len(heads)}."
        )
    head = heads[0]
    supported = {revision.revision for revision in script.iterate_revisions(head, "base")}
    unsupported = sorted(set(current) - supported)
    if unsupported:
        raise MigrationCompatibilityError(
            f"Database revision(s) {', '.join(unsupported)} are not ancestors of "
            f"the selected management head {head}."
        )
    return head


def current_revisions(engine):
    with engine.connect() as connection:
        # Neither this transaction nor the Alembic inspection may alter schema.
        connection.exec_driver_sql("SET TRANSACTION READ ONLY")
        return MigrationContext.configure(connection).get_current_heads()


def main():
    database = os.environ.get("POSTGRES_DB", "cfn_mgmt_local")
    engine = None
    try:
        script = ScriptDirectory.from_config(Config("alembic.ini"))
        url = URL.create(
            "postgresql+psycopg2",
            username=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
            host=os.environ["POSTGRES_HOST"],
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            database=database,
        )
        engine = create_engine(url)
        current = current_revisions(engine)
        head = require_compatible_revisions(script, current)
    except MigrationCompatibilityError as exc:
        sys.exit(
            f"Local CF: Management migrations are incompatible for {database}: {exc}\n"
            "Select a source version/image tag containing that revision, or create a separate "
            "database with LOCAL_CF_MGMT_DB=<new-name> task infra:up and start management "
            "with the same override. No revisions were stamped, downgraded, or applied."
        )
    except SQLAlchemyError:
        # Driver exceptions may include connection URLs; keep credentials out of logs.
        sys.exit(f"Local CF: Cannot read migration revisions from {database}. Check Postgres and its credentials.")
    except Exception:
        sys.exit("Local CF: Cannot inspect the selected management migration graph/configuration. No migrations were applied.")
    finally:
        if engine is not None:
            engine.dispose()
    print(f"Local CF: Management migrations compatible: database={database}, "
          f"current={','.join(current) or 'empty'}, target={head}")


if __name__ == "__main__":
    main()
