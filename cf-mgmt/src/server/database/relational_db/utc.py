# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0

"""Initialize physical PostgreSQL connections without replacing libpq options."""

from sqlalchemy import event


def set_session_utc(connection, _record):
    # SET must survive the pool's rollback and must not begin Alembic's transaction.
    previous = connection.autocommit
    try:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute("SET TIME ZONE 'UTC'")
    finally:
        connection.autocommit = previous


def configure_utc(engine):
    event.listen(engine, "connect", set_session_utc)
