# Multi-Organization WhatsApp Webhook Setup

This document explains how the WhatsApp webhook Lambda function handles multiple organizations with their own WhatsApp Business API configurations.

## Overview

The Lambda function now dynamically fetches webhook configuration from the `organizations` table instead of using static environment variables. Each organization can have its own:

- WhatsApp Business Account ID
- WhatsApp Access Token
- WhatsApp Phone Number ID
- Webhook Verify Token
- Webhook Secret (derived from App Secret)

## Database Schema

The `organizations` table contains these WhatsApp-related fields:

```sql
-- WhatsApp Business API fields (encrypted in production)
whatsapp_business_account_id TEXT,
whatsapp_access_token TEXT,
whatsapp_phone_number_id TEXT,
whatsapp_webhook_verify_token TEXT,
whatsapp_webhook_url TEXT,
whatsapp_app_id TEXT,
whatsapp_app_secret TEXT,
```

## How It Works

### 1. Webhook Verification (GET Request)

When WhatsApp sends a verification request:

1. Lambda extracts the `hub.verify_token` from query parameters
2. Searches the `organizations` table for a matching `whatsapp_webhook_verify_token`
3. If found and organization has complete config, returns the challenge
4. If not found, returns 403 Forbidden

```javascript
// Example verification flow
const token = queryParams['hub.verify_token'];
const organization = await Organization.findByWebhookVerifyToken(token);

if (organization && organization.hasCompleteWhatsAppConfig()) {
  return { statusCode: 200, body: challenge };
}
```

### 2. Webhook Event Processing (POST Request)

When WhatsApp sends webhook events:

1. Lambda extracts organization info from the webhook payload
2. Looks up organization by Business Account ID or Phone Number ID
3. Verifies webhook signature using organization's app secret
4. Processes events with organization context

```javascript
// Example event processing flow
const orgInfo = Organization.extractOrganizationFromWebhook(body);
const organization = await Organization.findByWhatsAppBusinessAccountId(orgInfo.businessAccountId);

// Verify signature with org-specific secret
const webhookSecret = organization.getWebhookSecret();
if (!verifyWebhookSignature(event.body, signature, webhookSecret)) {
  return { statusCode: 403, body: 'Invalid signature' };
}
```

## Organization Model Methods

### Finding Organizations

```javascript
// Find by webhook verify token (for verification)
Organization.findByWebhookVerifyToken(token)

// Find by WhatsApp Business Account ID (from webhook payload)
Organization.findByWhatsAppBusinessAccountId(businessAccountId)

// Find by WhatsApp Phone Number ID (from webhook payload)
Organization.findByWhatsAppPhoneNumberId(phoneNumberId)
```

### Configuration Methods

```javascript
// Check if organization has complete WhatsApp config
organization.hasCompleteWhatsAppConfig()

// Get webhook configuration
organization.getWebhookConfig()

// Get webhook secret (from app secret)
organization.getWebhookSecret()
```

### Extracting Organization from Webhook

```javascript
// Extract organization identifiers from webhook payload
Organization.extractOrganizationFromWebhook(webhookPayload)
// Returns: { businessAccountId: "123", phoneNumberId: "456" }
```

## Setup Instructions

### 1. Configure Organizations

For each organization, set their WhatsApp configuration:

```sql
UPDATE organizations 
SET 
  whatsapp_business_account_id = 'your_business_account_id',
  whatsapp_access_token = 'your_access_token',
  whatsapp_phone_number_id = 'your_phone_number_id',
  whatsapp_webhook_verify_token = 'unique_verify_token_per_org',
  whatsapp_app_id = 'your_app_id',
  whatsapp_app_secret = 'your_app_secret'
WHERE id = 'organization_uuid';
```

### 2. WhatsApp Business API Configuration

For each organization's WhatsApp Business API:

1. **Webhook URL**: Set to your Lambda API Gateway endpoint
   ```
   https://your-api-gateway-url/webhook
   ```

2. **Verify Token**: Use the organization's unique `whatsapp_webhook_verify_token`

3. **Subscribe to Events**: Enable `messages` events

### 3. Environment Variables

The Lambda function no longer requires organization-specific environment variables. Only set these optional defaults:

```bash
# Optional fallback values
DEFAULT_WEBHOOK_VERIFY_TOKEN=fallback_token
DEFAULT_WEBHOOK_SECRET=fallback_secret

# Database connection (required)
DB_HOST=your-database-host
DB_NAME=your-database-name
DB_USER=your-database-user
DB_PASSWORD=your-database-password
```

## Webhook Event Flow

### Message Status Updates

1. WhatsApp sends status update webhook
2. Lambda identifies organization from Business Account ID
3. Updates both `campaign_audience` and `messages` tables
4. Updates campaign statistics
5. Logs event in `webhook_events` with organization ID

### Incoming Messages

1. WhatsApp sends incoming message webhook
2. Lambda identifies organization from Phone Number ID
3. Extracts message content and interaction data
4. Logs in `webhook_events` with organization context
5. **TODO**: Call your main server's incoming message handler

## Security Considerations

### 1. Webhook Signature Verification

Each organization's webhook signature is verified using their specific app secret:

```javascript
const webhookSecret = organization.getWebhookSecret(); // Uses app_secret
const isValid = verifyWebhookSignature(payload, signature, webhookSecret);
```

### 2. Organization Isolation

- All webhook events are tagged with `organization_id`
- Database queries filter by organization
- No cross-organization data leakage

### 3. Configuration Validation

```javascript
// Ensures organization has all required WhatsApp fields
organization.hasCompleteWhatsAppConfig()
```

## Monitoring and Debugging

### 1. CloudWatch Logs

Logs include organization context:

```
Processing webhook for organization: Acme Corp
Webhook verified successfully for organization: Acme Corp
Updated campaign audience for organization: Acme Corp
```

### 2. Database Queries

Check webhook events by organization:

```sql
-- Recent webhook events for an organization
SELECT * FROM webhook_events 
WHERE organization_id = 'org_uuid' 
AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Organization webhook configuration
SELECT name, whatsapp_business_account_id, whatsapp_phone_number_id
FROM organizations 
WHERE whatsapp_webhook_verify_token IS NOT NULL;
```

## Troubleshooting

### Common Issues

1. **Verification Fails**: Check if organization's `whatsapp_webhook_verify_token` matches WhatsApp configuration

2. **Organization Not Found**: Verify Business Account ID or Phone Number ID in webhook payload matches database

3. **Signature Verification Fails**: Check if organization's `whatsapp_app_secret` is correct

4. **Incomplete Configuration**: Ensure all required WhatsApp fields are set for the organization

### Debug Steps

1. Check organization configuration:
   ```sql
   SELECT * FROM organizations WHERE id = 'org_uuid';
   ```

2. Verify webhook payload structure in CloudWatch logs

3. Test webhook verification manually:
   ```bash
   curl "https://your-lambda-url/webhook?hub.mode=subscribe&hub.verify_token=org_verify_token&hub.challenge=test123"
   ```

## Migration from Single Organization

If migrating from a single-organization setup:

1. **Update existing data**: Set `organization_id` in existing webhook_events
2. **Configure organizations**: Add WhatsApp config to organizations table
3. **Update WhatsApp settings**: Use organization-specific verify tokens
4. **Test thoroughly**: Verify each organization's webhook works independently

This multi-organization setup provides complete isolation and scalability for managing multiple WhatsApp Business API accounts within a single Lambda function.
