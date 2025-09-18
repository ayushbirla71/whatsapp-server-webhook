# Error Fix Guide - Organizations Table Missing

## The Error You Encountered

```
ERROR: operator does not exist: organization_status = text
error: operator does not exist: organization_status = text
```

This error occurred because:
1. The `organizations` table was missing from the database schema
2. The Lambda function was trying to query a table that didn't exist
3. PostgreSQL couldn't find the table to perform the comparison

## What I Fixed

### 1. Added Organizations Table to Schema
- **File**: `db/schema.sql`
- **Added**: Complete organizations table with WhatsApp configuration fields
- **Added**: Proper indexes and constraints
- **Added**: Trigger for automatic `updated_at` updates

### 2. Fixed Organization Model Query Issues
- **File**: `models/Organization.js`
- **Fixed**: Parameter index mismatch in SQL queries
- **Fixed**: Method signature to match actual usage
- **Fixed**: Query parameter binding

### 3. Created Migration Script
- **File**: `db/migration_add_organizations.sql`
- **Purpose**: Update existing databases without losing data

## How to Fix Your Database

### Option 1: Fresh Database Setup (Recommended)
If you can recreate your database:

```bash
# Drop and recreate database (WARNING: This deletes all data)
psql -h your-db-host -U postgres -c "DROP DATABASE IF EXISTS whatsapp_db;"
psql -h your-db-host -U postgres -c "CREATE DATABASE whatsapp_db;"

# Run the complete schema
psql -h your-db-host -U postgres -d whatsapp_db -f db/schema.sql
```

### Option 2: Migration (Preserve Existing Data)
If you have existing data to preserve:

```bash
# Run the migration script
psql -h your-db-host -U postgres -d whatsapp_db -f db/migration_add_organizations.sql
```

## Configure Your Organization

After running the schema/migration, configure your organization:

```sql
-- Connect to your database
psql -h your-db-host -U postgres -d whatsapp_db

-- Update the default organization with your WhatsApp credentials
UPDATE organizations 
SET 
  whatsapp_business_account_id = 'your_business_account_id',
  whatsapp_access_token = 'your_access_token',
  whatsapp_phone_number_id = 'your_phone_number_id',
  whatsapp_webhook_verify_token = 'unique_verify_token_123',
  whatsapp_webhook_url = 'https://your-api-gateway-url/prod/webhook',
  whatsapp_app_id = 'your_app_id',
  whatsapp_app_secret = 'your_app_secret'
WHERE name = 'Default Organization';

-- Verify the configuration
SELECT 
  name,
  whatsapp_business_account_id,
  whatsapp_phone_number_id,
  whatsapp_webhook_verify_token
FROM organizations;
```

## Get Your WhatsApp Credentials

You need these values from your Meta for Developers account:

### 1. Business Account ID
- Go to: https://developers.facebook.com/
- Select your WhatsApp Business API app
- Go to WhatsApp → API Setup
- Copy the "WhatsApp Business Account ID"

### 2. Access Token
- In the same API Setup page
- Copy the "Temporary access token" or generate a permanent one

### 3. Phone Number ID
- In the API Setup page
- Copy the "Phone number ID" from the "From" dropdown

### 4. App Secret
- Go to Settings → Basic
- Copy the "App Secret" (click "Show")

### 5. Webhook Verify Token
- Create a unique string (e.g., "myorg_webhook_token_123")
- This should be unique for each organization

## Test the Fix

### 1. Redeploy Lambda Function
```bash
# Update your Lambda function with the fixed code
aws lambda update-function-code \
  --function-name whatsapp-webhook-handler \
  --zip-file fileb://whatsapp-webhook-lambda.zip
```

### 2. Test Webhook Verification
```bash
# Test with your organization's verify token
curl "https://your-api-gateway-url/prod/webhook?hub.mode=subscribe&hub.verify_token=unique_verify_token_123&hub.challenge=test123"

# Should return: test123
```

### 3. Check Lambda Logs
```bash
aws logs tail "/aws/lambda/whatsapp-webhook-handler" \
  --region us-east-1 \
  --since 5m \
  --follow
```

## Verify Database Schema

Run this query to verify your organizations table exists:

```sql
-- Check if organizations table exists
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'organizations' 
ORDER BY ordinal_position;

-- Check if you have organizations configured
SELECT 
  id,
  name,
  status,
  whatsapp_business_account_id IS NOT NULL as has_business_account,
  whatsapp_phone_number_id IS NOT NULL as has_phone_number,
  whatsapp_webhook_verify_token IS NOT NULL as has_verify_token
FROM organizations;
```

## Common Issues After Fix

### 1. "Organization not found"
- **Cause**: No organization configured in database
- **Fix**: Run the organization configuration SQL above

### 2. "Webhook verification failed"
- **Cause**: Verify token mismatch
- **Fix**: Ensure the token in database matches WhatsApp configuration

### 3. "Database connection failed"
- **Cause**: Lambda can't connect to database
- **Fix**: Check security groups and VPC configuration

## Multi-Organization Setup

To add multiple organizations:

```sql
-- Add additional organizations
INSERT INTO organizations (
  name, 
  whatsapp_business_account_id,
  whatsapp_access_token,
  whatsapp_phone_number_id,
  whatsapp_webhook_verify_token,
  whatsapp_app_secret
) VALUES 
(
  'Organization 2',
  'business_account_id_2',
  'access_token_2',
  'phone_number_id_2',
  'unique_verify_token_org2',
  'app_secret_2'
),
(
  'Organization 3',
  'business_account_id_3',
  'access_token_3',
  'phone_number_id_3',
  'unique_verify_token_org3',
  'app_secret_3'
);
```

**Important**: Each organization must have a unique `whatsapp_webhook_verify_token`.

## Prevention

To avoid similar issues in the future:

1. **Always run the complete schema** when setting up a new database
2. **Test database connectivity** before deploying Lambda
3. **Verify table existence** with `\dt` in psql
4. **Check Lambda logs** immediately after deployment
5. **Use the migration scripts** when updating existing databases

## Support

If you still encounter issues:

1. **Check CloudWatch logs** for detailed error messages
2. **Verify database schema** with the queries above
3. **Test database connectivity** from your local machine
4. **Ensure all required fields** are populated in organizations table

The error is now fixed and your Lambda function should work correctly with the organizations table!
