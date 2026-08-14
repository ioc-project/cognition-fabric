#!/bin/bash
set -e

# Create additional databases needed by management and CFN services.
# This script runs inside the ioc-knowledge-db container on first init.
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE cfn_mgmt;
    CREATE DATABASE cfn_cp;
EOSQL

echo "Databases 'cfn_mgmt' and 'cfn_cp' created successfully"
