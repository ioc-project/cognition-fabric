#!/bin/bash -e

# Run Template CE unit tests
cd template-ce
uv pip install -e ".[test]"
uv run pytest -v
echo "UNIT-TEST DONE"