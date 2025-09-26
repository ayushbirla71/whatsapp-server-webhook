# Two-Lambda Architecture Deployment Verification

## 🎯 **Your Schema-Matched Architecture**

I've analyzed your complete database schema and created a two-Lambda architecture that perfectly matches your existing tables:

### **📊 Database Tables Supported**
- ✅ **`organizations`** - Multi-tenant WhatsApp configuration
- ✅ **`campaigns`** - Campaign management with approval workflow
- ✅ **`campaign_audience`** - Campaign audience tracking with message status
- ✅ **`messages`** - Complete message tracking (incoming/outgoing)
- ✅ **`incoming_messages`** - Detailed incoming message processing
- ✅ **`webhook_events`** - Complete webhook audit trail

### **🏗️ Architecture Flow**
```
WhatsApp Business API
        ↓
Webhook Receiver Lambda (Fast Response)
        ↓
SQS Queue (Reliable Queuing)
        ↓
DB Processor Lambda (Database Updates)
        ↓
PostgreSQL Database (Your Schema)
```

## 🚀 **Deployment Steps**

### **1. Set Environment Variables**
```powershell
# Required
$env:DB_HOST = "your-rds-endpoint.amazonaws.com"
$env:DB_PASSWORD = "your-database-password"

# Optional (with sensible defaults)
$env:DB_NAME = "whatsapp_db"
$env:DB_USER = "postgres"
$env:WEBHOOK_VERIFY_TOKEN = "unique_token_for_your_org"
$env:WEBHOOK_SECRET = "your_whatsapp_app_secret"
```

### **2. Deploy Infrastructure**
```powershell
# Deploy everything with one command
.\deployment\deploy-two-lambda.ps1

# Or with custom settings
.\deployment\deploy-two-lambda.ps1 -Environment production -Region us-west-2
```

### **3. Configure Your Organization**
```sql
-- Update the default organization with your WhatsApp credentials
UPDATE organizations 
SET 
  whatsapp_business_account_id = 'your_actual_business_account_id',
  whatsapp_access_token = 'your_actual_access_token',
  whatsapp_phone_number_id = 'your_actual_phone_number_id',
  whatsapp_webhook_verify_token = 'unique_token_for_your_org',
  whatsapp_app_secret = 'your_whatsapp_app_secret'
WHERE name = 'Default Organization';
```

## 🧪 **Testing Your Deployment**

### **Quick Test**
```powershell
# Test webhook verification
.\deployment\deploy-two-lambda.ps1 -Test
```

### **Comprehensive Testing**
```bash
# Install test dependencies
npm install --save-dev aws-sdk

# Set test environment variables
$env:WEBHOOK_URL = "https://your-api-gateway-url/prod/webhook"
$env:SQS_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/123456789/whatsapp-webhook-queue-development"
$env:BUSINESS_ACCOUNT_ID = "your_business_account_id"
$env:PHONE_NUMBER_ID = "your_phone_number_id"

# Run all tests
node test-two-lambda-architecture.js
```

### **Individual Test Commands**
```bash
# Test webhook verification only
npm run test:verification

# Test message status updates
npm run test:status

# Test incoming messages
npm run test:incoming

# Test interactive responses
npm run test:interactive

# Test media messages
npm run test:media

# Check SQS queue status
npm run test:sqs

# View Lambda logs
npm run logs:receiver
npm run logs:processor
```

## 📊 **What Each Lambda Does**

### **Webhook Receiver Lambda**
```javascript
// Handles webhook verification and forwards to SQS
exports.handler = async (event) => {
  // 1. Verify webhook token (GET requests)
  // 2. Validate HMAC signature (POST requests)
  // 3. Extract metadata from webhook payload
  // 4. Send to SQS with message attributes
  // 5. Return 200 OK immediately to WhatsApp
};
```

### **DB Processor Lambda**
```javascript
// Processes SQS messages and updates database
exports.handler = async (event) => {
  // 1. Receive batch of SQS messages (1-10 messages)
  // 2. Find organization from webhook payload
  // 3. Process message status updates:
  //    - Update `messages` table
  //    - Update `campaign_audience` table
  //    - Create `webhook_events` record
  // 4. Process incoming messages:
  //    - Create `incoming_messages` record
  //    - Link to original campaign if reply
  //    - Handle interactive responses
  //    - Create `webhook_events` record
  // 5. Handle partial batch failures gracefully
};
```

## 🔍 **Database Operations**

### **Message Status Updates**
When WhatsApp sends status updates (sent → delivered → read):
```sql
-- Updates messages table
UPDATE messages 
SET message_status = 'delivered', delivered_at = NOW()
WHERE whatsapp_message_id = 'wamid.xxx';

-- Updates campaign_audience table
UPDATE campaign_audience 
SET message_status = 'delivered', delivered_at = NOW()
WHERE whatsapp_message_id = 'wamid.xxx';

-- Creates webhook_events record
INSERT INTO webhook_events (organization_id, event_type, whatsapp_message_id, ...)
VALUES (...);
```

### **Incoming Messages**
When users reply to your campaigns:
```sql
-- Creates incoming_messages record
INSERT INTO incoming_messages (
  organization_id, whatsapp_message_id, from_phone_number, 
  message_type, content, context_campaign_id, ...
) VALUES (...);

-- Creates webhook_events record for audit
INSERT INTO webhook_events (organization_id, event_type, ...)
VALUES (...);
```

### **Interactive Responses**
When users click buttons or select from lists:
```sql
-- Stores interaction data in incoming_messages
INSERT INTO incoming_messages (
  ..., interactive_type, interactive_data, context_campaign_id, ...
) VALUES (..., 'button_reply', '{"button_id": "yes", "title": "Yes"}', ...);
```

## 🛡️ **Error Handling & Reliability**

### **SQS Configuration**
- **Batch Size**: 10 messages per Lambda invocation
- **Visibility Timeout**: 5 minutes (6x Lambda timeout)
- **Max Retries**: 3 attempts
- **Dead Letter Queue**: Failed messages preserved for analysis

### **Partial Batch Failures**
```javascript
// If one message fails, others still process
return {
  batchItemFailures: [
    { itemIdentifier: "failed-message-id" }
  ]
};
```

### **Database Connection Pooling**
```javascript
// Reuses connections across Lambda invocations
const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5, // Maximum 5 connections per Lambda
  idleTimeoutMillis: 30000
});
```

## 📈 **Monitoring & Troubleshooting**

### **CloudWatch Metrics**
- **Webhook Receiver**: Invocation count, duration, errors
- **DB Processor**: SQS batch size, processing time, failures
- **SQS Queue**: Message count, age, dead letter queue depth

### **Log Analysis**
```bash
# Real-time webhook receiver logs
aws logs tail "/aws/lambda/whatsapp-webhook-receiver-development" --follow

# Real-time DB processor logs
aws logs tail "/aws/lambda/whatsapp-db-processor-development" --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name "/aws/lambda/whatsapp-db-processor-development" \
  --filter-pattern "ERROR"
```

### **Common Issues & Solutions**

1. **"Organization not found"**
   - **Cause**: No organization configured with matching business account ID
   - **Fix**: Run organization configuration SQL with correct IDs

2. **"Database connection timeout"**
   - **Cause**: Lambda can't reach RDS
   - **Fix**: Check VPC configuration and security groups

3. **"SQS messages stuck"**
   - **Cause**: DB processor Lambda failing repeatedly
   - **Fix**: Check DB processor logs and fix database issues

4. **"Webhook verification failed"**
   - **Cause**: Token mismatch between WhatsApp and environment variable
   - **Fix**: Ensure WEBHOOK_VERIFY_TOKEN matches WhatsApp configuration

## 🎯 **Next Steps**

1. **Deploy the architecture** using the PowerShell script
2. **Configure your organization** in the database
3. **Set webhook URL** in WhatsApp Business API
4. **Test with real webhooks** from WhatsApp
5. **Monitor CloudWatch logs** for any issues
6. **Scale as needed** by adjusting Lambda concurrency limits

## 🔗 **WhatsApp Business API Configuration**

After deployment, configure WhatsApp with:
- **Webhook URL**: `https://your-api-gateway-url/prod/webhook`
- **Verify Token**: Your `WEBHOOK_VERIFY_TOKEN` value
- **Webhook Fields**: `messages` (for both incoming messages and status updates)

Your two-Lambda architecture is now ready to handle production WhatsApp webhook traffic with full database integration!
