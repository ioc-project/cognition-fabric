# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

from pathlib import Path

from mkdocs.structure.files import File


def on_files(files, config):
    """Use the same architecture diagram on GitHub and in the site."""
    asset = "assets/cf-architecture-context.svg"
    diagram = Path(__file__).resolve().parent / asset
    files.append(File.generated(config, asset, abs_src_path=str(diagram)))
    return files
