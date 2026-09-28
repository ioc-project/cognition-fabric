#!/bin/bash -e

# Run Demo CE unit tests
cd demo-ce
uv pip install -e ".[test]"
uv run pytest -v
echo "UNIT-TEST DONE"