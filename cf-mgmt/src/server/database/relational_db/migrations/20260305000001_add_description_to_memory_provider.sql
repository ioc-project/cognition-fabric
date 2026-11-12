-- Copyright 2026 Cisco Systems, Inc. and its affiliates
--
-- SPDX-License-Identifier: Apache-2.0

-- Migration: Add description column to memory_provider table
-- Date: 2026-03-05
-- Description: Add missing description column that was in the original schema but missing from the actual table

-- Add description column to memory_provider table
ALTER TABLE "memory_provider" 
ADD COLUMN IF NOT EXISTS "description" VARCHAR(1000) NULL;
