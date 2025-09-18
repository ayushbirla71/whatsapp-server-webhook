# WhatsApp Webhook Lambda Deployment Guide

This guide will help you deploy the multi-organization WhatsApp webhook Lambda function to AWS.

## Prerequisites

### 1. AWS Account Setup
- AWS CLI installed and configured
- Appropriate IAM permissions for Lambda, CloudFormation, API Gateway, and CloudWatch

### 2. Database Setup
- PostgreSQL database accessible from AWS Lambda
- Database schema deployed (run `db/schema.sql`)
- Organizations configured with WhatsApp settings

### 3. Required Environment Variables
Set these environment variables before deployment:

```bash
# Required
export DB_HOST="your-database-host.amazonaws.com"
export DB_PASSWORD="your-database-password"

# Optional (with defaults)
export DB_NAME="whatsapp_db"          # Default: whatsapp_db
export DB_USER="postgres"             # Default: postgres
```

## Quick Deployment

### 1. Make the deployment script executable
```bash
chmod +x deployment/deploy.sh
```

### 2. Run the deployment
```bash
# Basic deployment
./deployment/deploy.sh

# Custom configuration
./deployment/deploy.sh \
  --environment production \
  --region us-west-2 \
  --function-name my-whatsapp-webhook
```

### 3. Note the webhook URL
The script will output a webhook URL like:
```
https://abc123.execute-api.us-east-1.amazonaws.com/prod/webhook
```

## Step-by-Step Deployment

### Step 1: Prepare Environment
```bash
# Set required environment variables
export DB_HOST="your-rds-endpoint.amazonaws.com"
export DB_PASSWORD="your-secure-password"
export DB_NAME="whatsapp_db"
export DB_USER="postgres"

# Optional: Set AWS region and profile
export AWS_DEFAULT_REGION="us-east-1"
export AWS_PROFILE="your-aws-profile"
```

### Step 2: Install Dependencies
```bash
npm install --production
```

### Step 3: Deploy Infrastructure
```bash
# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file deployment/cloudformation.yaml \
  --stack-name whatsapp-webhook-stack \
  --parameter-overrides \
    FunctionName=whatsapp-webhook-handler \
    Environment=production \
    DBHost=$DB_HOST \
    DBName=$DB_NAME \
    DBUser=$DB_USER \
    DBPassword=$DB_PASSWORD \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### Step 4: Package and Deploy Function Code
```bash
# Create deployment package
zip -r whatsapp-webhook-lambda.zip . \
  -x "*.git*" \
  -x "node_modules/.cache/*" \
  -x "tests/*" \
  -x "*.md" \
  -x "deployment/*" \
  -x "*.sh"

# Update Lambda function code
aws lambda update-function-code \
  --function-name whatsapp-webhook-handler \
  --zip-file fileb://whatsapp-webhook-lambda.zip \
  --region us-east-1
```

### Step 5: Get Webhook URL
```bash
# Get the webhook URL from CloudFormation outputs
aws cloudformation describe-stacks \
  --stack-name whatsapp-webhook-stack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`WebhookUrl`].OutputValue' \
  --output text
```

## Database Configuration

### 1. Deploy Database Schema
Run the SQL schema on your PostgreSQL database:
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f db/schema.sql
```

### 2. Configure Organizations
For each organization, set their WhatsApp configuration:

```sql
-- Example organization configuration
UPDATE organizations 
SET 
  whatsapp_business_account_id = '1234567890123456',
  whatsapp_access_token = 'EAAxxxxxxxxxxxxxxx',
  whatsapp_phone_number_id = '1234567890123456',
  whatsapp_webhook_verify_token = 'unique_verify_token_org1',
  whatsapp_webhook_url = 'https://your-api-gateway-url/webhook',
  whatsapp_app_id = '1234567890123456',
  whatsapp_app_secret = 'your_app_secret_here'
WHERE id = 'your-organization-uuid';
```

**Important**: Each organization must have a unique `whatsapp_webhook_verify_token`.

## WhatsApp Business API Configuration

### 1. Configure Webhook URL
In your WhatsApp Business API settings:
- **Webhook URL**: `https://your-api-gateway-url/webhook`
- **Verify Token**: Use the organization's `whatsapp_webhook_verify_token`

### 2. Subscribe to Events
Enable these webhook events:
- `messages` (for incoming messages and status updates)

### 3. Test Webhook Verification
```bash
# Test with your organization's verify token
curl "https://your-api-gateway-url/webhook?hub.mode=subscribe&hub.verify_token=your_org_verify_token&hub.challenge=test123"
```

Should return: `test123`

## Deployment Script Options

The `deploy.sh` script supports several options:

```bash
# Show help
./deployment/deploy.sh --help

# Deploy to different environment
./deployment/deploy.sh --environment staging

# Deploy to different region
./deployment/deploy.sh --region eu-west-1

# Use custom function name
./deployment/deploy.sh --function-name my-custom-webhook

# View recent logs
./deployment/deploy.sh --logs

# Test deployment
./deployment/deploy.sh --test
```

## Monitoring and Troubleshooting

### 1. View Logs
```bash
# Using deployment script
./deployment/deploy.sh --logs

# Using AWS CLI directly
aws logs tail "/aws/lambda/whatsapp-webhook-handler" \
  --region us-east-1 \
  --since 10m \
  --follow
```

### 2. Test Deployment
```bash
# Test webhook verification
./deployment/deploy.sh --test

# Manual test
curl "https://your-webhook-url?hub.mode=subscribe&hub.verify_token=your_token&hub.challenge=test"
```

### 3. Common Issues

#### Database Connection Issues
- Check security groups allow Lambda to access RDS
- Verify database credentials and host
- Ensure database is in same VPC or publicly accessible

#### Webhook Verification Fails
- Check organization's `whatsapp_webhook_verify_token` in database
- Verify token matches WhatsApp Business API configuration
- Check CloudWatch logs for detailed error messages

#### Function Timeout
- Increase timeout in CloudFormation template (default: 30 seconds)
- Check database query performance
- Monitor memory usage

## Security Considerations

### 1. Database Security
- Use RDS with encryption at rest
- Store database password in AWS Secrets Manager
- Use VPC for network isolation

### 2. Environment Variables
- Database password is encrypted in CloudFormation
- Consider using AWS Secrets Manager for sensitive data

### 3. API Gateway Security
- Consider adding API keys or WAF rules
- Monitor for unusual traffic patterns

## Updating the Function

### 1. Code Updates
```bash
# Update function code only
./deployment/deploy.sh

# Or manually
zip -r whatsapp-webhook-lambda.zip .
aws lambda update-function-code \
  --function-name whatsapp-webhook-handler \
  --zip-file fileb://whatsapp-webhook-lambda.zip
```

### 2. Infrastructure Updates
```bash
# Update CloudFormation stack
aws cloudformation deploy \
  --template-file deployment/cloudformation.yaml \
  --stack-name whatsapp-webhook-stack \
  --capabilities CAPABILITY_NAMED_IAM
```

## Production Checklist

- [ ] Database schema deployed
- [ ] Organizations configured with WhatsApp settings
- [ ] Lambda function deployed successfully
- [ ] API Gateway webhook URL configured in WhatsApp Business API
- [ ] Webhook verification test passes
- [ ] CloudWatch monitoring set up
- [ ] Error alerting configured
- [ ] Database backups enabled
- [ ] Security groups properly configured

## Support

If you encounter issues:

1. Check CloudWatch logs for detailed error messages
2. Verify database connectivity and configuration
3. Test webhook verification manually
4. Check WhatsApp Business API webhook configuration
5. Review organization settings in database

The deployment creates a production-ready, scalable webhook handler that supports multiple organizations with complete isolation and comprehensive logging.
