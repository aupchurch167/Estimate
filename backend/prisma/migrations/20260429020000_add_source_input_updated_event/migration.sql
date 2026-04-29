-- Phase 2.13 fix: source inputs are now editable, so the activity log
-- needs a SOURCE_INPUT_UPDATED enum value. Postgres needs ALTER TYPE
-- ADD VALUE; placement after SOURCE_INPUT_ADDED keeps the enum in
-- creation/update/remove reading order.
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'SOURCE_INPUT_UPDATED' AFTER 'SOURCE_INPUT_ADDED';
