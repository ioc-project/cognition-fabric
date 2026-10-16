#!/bin/bash
set -e

# Create additional databases needed
# This script runs inside the ioc-scale-db container on first init.
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE cfn_mgmt;
    CREATE DATABASE cognition_store;
    CREATE DATABASE cfn_audit;
    CREATE DATABASE enforcement_proxy;
EOSQL

echo "Databases 'cfn_mgmt', 'cognition_store', 'cfn_audit' and 'enforcement_proxy' created successfully"
