#!/bin/bash
set -e

# Create additional databases needed
# This script runs inside the ioc-scale-db container on first init.
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE cfn_mgmt;
    CREATE DATABASE cognition_store;
EOSQL

echo "Databases 'cfn_mgmt' and 'cognition_store' created successfully"
