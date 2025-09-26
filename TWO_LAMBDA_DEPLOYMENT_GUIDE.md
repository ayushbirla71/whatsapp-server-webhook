# Two-Lambda WhatsApp Webhook Architecture Deployment Guide

## 🏗️ **Architecture Overview**

This new architecture separates concerns for better scalability and reliability:

```
WhatsApp → Webhook Receiver Lambda → SQS Queue → DB Processor Lambda → PostgreSQL
```

### **Benefits of Two-Lambda Architecture**

1. **🚀 Fast Webhook Response**: Webhook receiver responds immediately to WhatsApp
2. **🔄 Reliable Processing**: SQS ensures messages aren't lost if DB is temporarily unavailable
3. **📈 Scalable**: Each Lambda can scale independently based on load
4. **🛡️ Fault Tolerant**: Failed DB operations are retried automatically via SQS
5. **🔍 Better Monitoring**: Separate CloudWatch logs for webhook vs database operations
6. **⚡ Cost Effective**: Only pay for actual processing time

## 📁 **Project Structure**

```
whatsapp-server-webhook/
├── webhook-receiver/           # Lambda 1: Webhook receiver
│   ├── index.js               # Main webhook handler
│   └── package.json           # Dependencies (aws-sdk)
├── db-processor/              # Lambda 2: Database processor
│   ├── index.js               # SQS message processor
│   ├── package.json           # Dependencies (pg, pg-pool)
│   ├── models/                # Database models
│   │   ├── Organization.js
│   │   ├── Message.js
│   │   ├── CampaignAudience.js
│   │   ├── WebhookEvent.js
│   │   └── IncomingMessage.js
│   └── db/
│       └── connection.js      # Database connection
├── deployment/
│   ├── two-lambda-infrastructure.yaml  # CloudFormation template
│   ├── deploy-two-lambda.sh           # Linux/Mac deployment script
│   └── deploy-two-lambda.ps1          # Windows deployment script
└── db/
    ├── schema.sql             # Complete database schema
    └── migration_add_organizations.sql
```

## 🚀 **Quick Deployment (Windows)**

### **1. Set Environment Variables**

```powershell
# Required
$env:DB_HOST = "your-database-host.amazonaws.com"
$env:DB_PASSWORD = "your-database-password"

# Optional (with defaults)
$env:DB_NAME = "whatsapp_db"
$env:DB_USER = "postgres"
$env:WEBHOOK_VERIFY_TOKEN = "your_unique_verify_token"
$env:WEBHOOK_SECRET = "your_webhook_secret"
```

### **2. Deploy Everything**

```powershell
# Make script executable and deploy
.\deployment\deploy-two-lambda.ps1
```

### **3. Get Deployment Info**

```powershell
# Show deployment details
.\deployment\deploy-two-lambda.ps1 -Info
```

## 🐧 **Quick Deployment (Linux/Mac)**

### **1. Set Environment Variables**

```bash
export DB_HOST="your-database-host.amazonaws.com"
export DB_PASSWORD="your-database-password"
export DB_NAME="whatsapp_db"  # Optional
export DB_USER="postgres"     # Optional
export WEBHOOK_VERIFY_TOKEN="your_unique_verify_token"  # Optional
export WEBHOOK_SECRET="your_webhook_secret"  # Optional
```

### **2. Deploy Everything**

```bash
chmod +x deployment/deploy-two-lambda.sh
./deployment/deploy-two-lambda.sh
```

## 🔧 **Manual Deployment Steps**

### **Step 1: Prepare Database**

```sql
-- Run the complete schema
psql -h your-db-host -U postgres -d whatsapp_db -f db/schema.sql

-- Configure your organization
UPDATE organizations 
SET 
  whatsapp_business_account_id = 'your_business_account_id',
  whatsapp_access_token = 'your_access_token',
  whatsapp_phone_number_id = 'your_phone_number_id',
  whatsapp_webhook_verify_token = 'unique_verify_token_123',
  whatsapp_app_secret = 'your_app_secret'
WHERE name = 'Default Organization';
```

### **Step 2: Deploy Infrastructure**

```bash
aws cloudformation deploy \
  --template-file deployment/two-lambda-infrastructure.yaml \
  --stack-name whatsapp-webhook-two-lambda-stack \
  --parameter-overrides \
    Environment=development \
    DBHost=$DB_HOST \
    DBPassword=$DB_PASSWORD \
    WebhookVerifyToken=$WEBHOOK_VERIFY_TOKEN \
    WebhookSecret=$WEBHOOK_SECRET \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### **Step 3: Package and Deploy Functions**

```bash
# Package webhook receiver
cd webhook-receiver
npm install --production
zip -r ../webhook-receiver-lambda.zip .
cd ..

# Package DB processor
cd db-processor
npm install --production
zip -r ../db-processor-lambda.zip .
cd ..

# Update function codes
aws lambda update-function-code \
  --function-name whatsapp-webhook-receiver-development \
  --zip-file fileb://webhook-receiver-lambda.zip

aws lambda update-function-code \
  --function-name whatsapp-db-processor-development \
  --zip-file fileb://db-processor-lambda.zip
```

## 🔍 **How It Works**

### **Webhook Receiver Lambda**

1. **Receives webhook** from WhatsApp Business API
2. **Verifies signature** using HMAC SHA256 (if configured)
3. **Validates webhook token** for verification requests
4. **Extracts metadata** (business account ID, phone number ID, message types)
5. **Sends to SQS** with message attributes for filtering
6. **Returns 200 OK** immediately to WhatsApp

### **SQS Queue**

1. **Receives messages** from webhook receiver
2. **Batches messages** (up to 10 per batch)
3. **Triggers DB processor** Lambda automatically
4. **Handles retries** (up to 3 attempts)
5. **Dead letter queue** for failed messages

### **DB Processor Lambda**

1. **Receives SQS batch** (1-10 messages)
2. **Finds organization** based on webhook payload
3. **Processes each webhook entry**:
   - **Message status updates** (sent → delivered → read)
   - **Incoming messages** (text, media, interactive responses)
4. **Updates database tables**:
   - `messages` - Message tracking
   - `campaign_audience` - Campaign statistics
   - `incoming_messages` - Incoming message details
   - `webhook_events` - Audit trail
5. **Handles failures** gracefully with partial batch failures

## 📊 **Monitoring & Troubleshooting**

### **View Logs**

```bash
# Webhook receiver logs
./deployment/deploy-two-lambda.sh --logs webhook-receiver

# DB processor logs
./deployment/deploy-two-lambda.sh --logs db-processor
```

### **Monitor SQS Queue**

```bash
# Check queue metrics
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/whatsapp-webhook-queue-development \
  --attribute-names All
```

### **Common Issues**

1. **"Organization not found"**
   - **Cause**: No organization configured in database
   - **Fix**: Run organization configuration SQL

2. **"Database connection failed"**
   - **Cause**: Lambda can't connect to database
   - **Fix**: Check VPC settings and security groups

3. **"SQS permission denied"**
   - **Cause**: IAM role missing SQS permissions
   - **Fix**: Redeploy CloudFormation stack

4. **"Messages stuck in queue"**
   - **Cause**: DB processor Lambda failing
   - **Fix**: Check DB processor logs and fix database issues

## 🧪 **Testing**

### **Test Webhook Verification**

```bash
curl "https://your-api-gateway-url/prod/webhook?hub.mode=subscribe&hub.verify_token=your_verify_token&hub.challenge=test123"
# Should return: test123
```

### **Test Message Processing**

1. **Send test webhook** to your endpoint
2. **Check SQS queue** for message
3. **Verify database updates** in all tables
4. **Check CloudWatch logs** for both functions

### **Load Testing**

```bash
# Send multiple concurrent webhooks
for i in {1..10}; do
  curl -X POST https://your-api-gateway-url/prod/webhook \
    -H "Content-Type: application/json" \
    -d '{"test": "message '$i'"}' &
done
```

## 🔐 **Security Features**

1. **Webhook Signature Verification**: HMAC SHA256 validation
2. **Token-based Verification**: WhatsApp verify token validation
3. **IAM Roles**: Least privilege access for each Lambda
4. **VPC Support**: Database in private subnet
5. **Encryption**: SQS messages encrypted at rest
6. **CloudWatch Logs**: Audit trail for all operations

## 💰 **Cost Optimization**

1. **Reserved Concurrency**: Limits to prevent runaway costs
2. **Efficient Batching**: Process up to 10 SQS messages per invocation
3. **Connection Pooling**: Reuse database connections
4. **Log Retention**: Automatic cleanup of old logs
5. **Dead Letter Queue**: Prevent infinite retries

## 🔄 **Scaling Considerations**

- **Webhook Receiver**: Can handle 1000+ concurrent requests
- **SQS Queue**: Virtually unlimited throughput
- **DB Processor**: Scales based on SQS batch size
- **Database**: Consider read replicas for high volume

## 📈 **Next Steps**

1. **Configure WhatsApp Business API** with your webhook URL
2. **Set up monitoring alerts** in CloudWatch
3. **Implement auto-responses** based on incoming messages
4. **Add business logic** for campaign management
5. **Set up backup and disaster recovery**

The two-Lambda architecture provides a robust, scalable foundation for your WhatsApp webhook processing!
