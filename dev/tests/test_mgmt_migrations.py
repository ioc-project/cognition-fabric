# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Migration graph regressions without reading or migrating a real database."""

import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch


HAS_ALEMBIC = importlib.util.find_spec("alembic") is not None
if HAS_ALEMBIC:
    from alembic.script import ScriptDirectory
    from sqlalchemy.exc import SQLAlchemyError

    spec = importlib.util.spec_from_file_location(
        "check_mgmt_migrations", Path(__file__).resolve().parents[1] / "tools" / "check_mgmt_migrations.py"
    )
    migrations = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migrations)


@unittest.skipUnless(HAS_ALEMBIC, "Run with management's Python environment to check real Alembic graphs")
class MigrationCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        (self.directory / "versions").mkdir()

    def script(self, revisions):
        for revision, parent in revisions:
            (self.directory / "versions" / f"{revision}.py").write_text(
                f"revision = {revision!r}\ndown_revision = {parent!r}\n"
                "def upgrade():\n    raise AssertionError('Preflight must not migrate')\n"
                "def downgrade():\n    raise AssertionError('Preflight must not downgrade')\n"
            )
        return ScriptDirectory(str(self.directory))

    def test_empty_database_and_ancestor_revision_can_upgrade(self):
        script = self.script([("root", None), ("next", "root")])
        for current in [(), ("root",), ("next",)]:
            with self.subTest(current=current):
                self.assertEqual(migrations.require_compatible_revisions(script, current), "next")

    def test_newer_source_database_rejects_older_image_graph(self):
        script = self.script([("root", None), ("published", "root")])
        with self.assertRaisesRegex(migrations.MigrationCompatibilityError, "source_only"):
            migrations.require_compatible_revisions(script, ("source_only",))

    def test_newer_image_database_rejects_older_source_graph(self):
        script = self.script([("root", None), ("source", "root")])
        with self.assertRaisesRegex(migrations.MigrationCompatibilityError, "image_only"):
            migrations.require_compatible_revisions(script, ("image_only",))

    def test_unmerged_heads_fail_before_upgrade_head_would_be_ambiguous(self):
        script = self.script([("root", None), ("left", "root"), ("right", "root")])
        with self.assertRaisesRegex(migrations.MigrationCompatibilityError, "one Alembic head"):
            migrations.require_compatible_revisions(script, ("root",))

    def test_merged_branches_accept_both_database_heads(self):
        script = self.script([
            ("root", None), ("left", "root"), ("right", "root"),
            ("merge", ("left", "right")),
        ])
        self.assertEqual(migrations.require_compatible_revisions(script, ("left", "right")), "merge")

    def test_database_inspection_is_read_only(self):
        engine = MagicMock()
        connection = engine.connect.return_value.__enter__.return_value
        with patch.object(migrations, "MigrationContext") as context:
            context.configure.return_value.get_current_heads.return_value = ("root",)
            result = migrations.current_revisions(engine)
        self.assertEqual(result, ("root",))
        connection.exec_driver_sql.assert_called_once_with("SET TRANSACTION READ ONLY")
        connection.commit.assert_not_called()

    def test_database_errors_do_not_disclose_credentials(self):
        settings = {
            "POSTGRES_USER": "test", "POSTGRES_PASSWORD": "private-password",
            "POSTGRES_HOST": "localhost", "POSTGRES_DB": "cfn_mgmt_local",
        }
        with patch.dict(os.environ, settings), \
                patch.object(migrations.ScriptDirectory, "from_config"), \
                patch.object(migrations, "create_engine"), \
                patch.object(migrations, "current_revisions", side_effect=SQLAlchemyError("private-password")):
            with self.assertRaises(SystemExit) as result:
                migrations.main()
        self.assertIn("Cannot read migration revisions", str(result.exception))
        self.assertNotIn("private-password", str(result.exception))


if __name__ == "__main__":
    unittest.main()
