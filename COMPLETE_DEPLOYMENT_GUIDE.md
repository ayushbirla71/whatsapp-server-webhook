# Complete AWS Deployment Guide - WhatsApp Webhook Lambda

This guide covers both AWS Console (GUI) and Command Line (CLI) deployment methods.

## Prerequisites

### 1. AWS Account Setup
- Active AWS account with billing enabled
- IAM user with appropriate permissions or Administrator access

### 2. Required Tools (for CLI method)
- AWS CLI v2 installed
- Node.js 18+ installed
- Git (optional)

### 3. Database Requirements
- PostgreSQL database (RDS recommended)
- Database accessible from Lambda (same VPC or public)

## Method 1: AWS Console Deployment (GUI)

### Step 1: Prepare the Code Package

1. **Download/Clone the project** to your local machine
2. **Install dependencies**:
   ```bash
   cd whatsapp-server-webhook
   npm install --production
   ```

3. **Create deployment package**:
   ```bash
   # Windows
   powershell Compress-Archive -Path * -DestinationPath whatsapp-webhook.zip -Force
   
   # Mac/Linux
   zip -r whatsapp-webhook.zip . -x "*.git*" "node_modules/.cache/*" "tests/*" "*.md" "deployment/*"
   ```

### Step 2: Create Lambda Function

1. **Go to AWS Lambda Console**:
   - Open https://console.aws.amazon.com/lambda/
   - Select your preferred region (e.g., us-east-1)

2. **Create Function**:
   - Click "Create function"
   - Choose "Author from scratch"
   - Function name: `whatsapp-webhook-handler`
   - Runtime: `Node.js 18.x`
   - Architecture: `x86_64`
   - Click "Create function"

3. **Upload Code**:
   - In the "Code" tab, click "Upload from" → ".zip file"
   - Upload your `whatsapp-webhook.zip` file
   - Click "Save"

### Step 3: Configure Lambda Function

1. **Environment Variables**:
   - Go to "Configuration" → "Environment variables"
   - Click "Edit" and add:
     ```
     DB_HOST = your-database-host.amazonaws.com
     DB_NAME = whatsapp_db
     DB_USER = postgres
     DB_PASSWORD = your-database-password
     NODE_ENV = production
     ```

2. **Basic Settings**:
   - Go to "Configuration" → "General configuration"
   - Click "Edit":
     - Timeout: 30 seconds
     - Memory: 512 MB
   - Click "Save"

3. **Execution Role** (if needed):
   - Go to "Configuration" → "Permissions"
   - The execution role should have:
     - `AWSLambdaBasicExecutionRole`
     - VPC access (if database is in VPC)

### Step 4: Create API Gateway

1. **Go to API Gateway Console**:
   - Open https://console.aws.amazon.com/apigateway/
   - Click "Create API"

2. **Create REST API**:
   - Choose "REST API" (not private)
   - Click "Build"
   - API name: `whatsapp-webhook-api`
   - Description: `WhatsApp Webhook API`
   - Click "Create API"

3. **Create Resource**:
   - Click "Actions" → "Create Resource"
   - Resource Name: `webhook`
   - Resource Path: `/webhook`
   - Enable CORS: ✓
   - Click "Create Resource"

4. **Create Methods**:
   
   **GET Method (for verification)**:
   - Select `/webhook` resource
   - Click "Actions" → "Create Method"
   - Choose "GET" → Click checkmark
   - Integration type: "Lambda Function"
   - Lambda Region: Your region
   - Lambda Function: `whatsapp-webhook-handler`
   - Click "Save" → "OK"

   **POST Method (for webhooks)**:
   - Select `/webhook` resource
   - Click "Actions" → "Create Method"
   - Choose "POST" → Click checkmark
   - Integration type: "Lambda Function"
   - Lambda Region: Your region
   - Lambda Function: `whatsapp-webhook-handler`
   - Click "Save" → "OK"

5. **Deploy API**:
   - Click "Actions" → "Deploy API"
   - Deployment stage: "New Stage"
   - Stage name: `prod`
   - Click "Deploy"
   - **Note the Invoke URL** (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com/prod`)

### Step 5: Test the Deployment

1. **Test URL**: `https://your-api-url/prod/webhook`
2. **Test verification** (replace with your org's verify token):
   ```
   https://your-api-url/prod/webhook?hub.mode=subscribe&hub.verify_token=your_org_token&hub.challenge=test123
   ```

## Method 2: Command Line Deployment (CLI)

### Step 1: Install and Configure AWS CLI

1. **Install AWS CLI v2**:
   ```bash
   # Windows (using installer)
   # Download from: https://awscli.amazonaws.com/AWSCLIV2.msi
   
   # Mac
   brew install awscli
   
   # Linux
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   ```

2. **Configure AWS CLI**:
   ```bash
   aws configure
   # Enter:
   # AWS Access Key ID: your-access-key
   # AWS Secret Access Key: your-secret-key
   # Default region: us-east-1
   # Default output format: json
   ```

### Step 2: Set Environment Variables

```bash
# Windows CMD
set DB_HOST=your-database-host.amazonaws.com
set DB_PASSWORD=your-database-password
set DB_NAME=whatsapp_db
set DB_USER=postgres

# Windows PowerShell
$env:DB_HOST="your-database-host.amazonaws.com"
$env:DB_PASSWORD="your-database-password"
$env:DB_NAME="whatsapp_db"
$env:DB_USER="postgres"

# Mac/Linux
export DB_HOST="your-database-host.amazonaws.com"
export DB_PASSWORD="your-database-password"
export DB_NAME="whatsapp_db"
export DB_USER="postgres"
```

### Step 3: Deploy Using CloudFormation

1. **Deploy Infrastructure**:
   ```bash
   aws cloudformation deploy \
     --template-file deployment/cloudformation.yaml \
     --stack-name whatsapp-webhook-stack \
     --parameter-overrides \
       FunctionName=whatsapp-webhook-handler \
       Environment=production \
       DBHost=%DB_HOST% \
       DBName=%DB_NAME% \
       DBUser=%DB_USER% \
       DBPassword=%DB_PASSWORD% \
     --capabilities CAPABILITY_NAMED_IAM \
     --region us-east-1
   ```

2. **Package and Deploy Code**:
   ```bash
   # Install dependencies
   npm install --production
   
   # Create package
   # Windows
   powershell Compress-Archive -Path * -DestinationPath whatsapp-webhook-lambda.zip -Force
   
   # Mac/Linux
   zip -r whatsapp-webhook-lambda.zip . -x "*.git*" "node_modules/.cache/*" "tests/*" "*.md" "deployment/*"
   
   # Update function code
   aws lambda update-function-code \
     --function-name whatsapp-webhook-handler \
     --zip-file fileb://whatsapp-webhook-lambda.zip \
     --region us-east-1
   ```

3. **Get Webhook URL**:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name whatsapp-webhook-stack \
     --region us-east-1 \
     --query 'Stacks[0].Outputs[?OutputKey==`WebhookUrl`].OutputValue' \
     --output text
   ```

### Step 4: Use Automated Script (Easiest)

```bash
# Windows
deployment\deploy.sh

# Mac/Linux
chmod +x deployment/deploy.sh
./deployment/deploy.sh
```

## Database Setup

### Step 1: Create RDS Database (if needed)

**Using AWS Console**:
1. Go to RDS Console
2. Click "Create database"
3. Choose PostgreSQL
4. Template: Free tier (for testing) or Production
5. DB instance identifier: `whatsapp-db`
6. Master username: `postgres`
7. Master password: (set secure password)
8. Public access: Yes (for Lambda access)
9. Create database

**Using CLI**:
```bash
aws rds create-db-instance \
  --db-instance-identifier whatsapp-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username postgres \
  --master-user-password YourSecurePassword123 \
  --allocated-storage 20 \
  --publicly-accessible \
  --region us-east-1
```

### Step 2: Deploy Database Schema

```bash
# Get RDS endpoint
aws rds describe-db-instances \
  --db-instance-identifier whatsapp-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text

# Deploy schema
psql -h your-rds-endpoint.amazonaws.com -U postgres -d postgres -f db/schema.sql
```

### Step 3: Configure Organizations

```sql
-- Connect to database and run:
INSERT INTO organizations (
  id, name, status,
  whatsapp_business_account_id,
  whatsapp_access_token,
  whatsapp_phone_number_id,
  whatsapp_webhook_verify_token,
  whatsapp_app_secret
) VALUES (
  uuid_generate_v4(),
  'Your Organization',
  'active',
  'your_business_account_id',
  'your_access_token',
  'your_phone_number_id',
  'unique_verify_token_123',
  'your_app_secret'
);
```

## WhatsApp Business API Configuration

### Step 1: Configure Webhook

1. **Go to Meta for Developers**:
   - Visit https://developers.facebook.com/
   - Go to your WhatsApp Business API app

2. **Set Webhook URL**:
   - Webhook URL: `https://your-api-gateway-url/prod/webhook`
   - Verify Token: Use your organization's `whatsapp_webhook_verify_token`

3. **Subscribe to Events**:
   - Enable `messages` field

### Step 2: Test Webhook

```bash
# Test verification
curl "https://your-api-gateway-url/prod/webhook?hub.mode=subscribe&hub.verify_token=unique_verify_token_123&hub.challenge=test123"

# Should return: test123
```

## Monitoring and Troubleshooting

### View Logs

**AWS Console**:
1. Go to CloudWatch Console
2. Click "Log groups"
3. Find `/aws/lambda/whatsapp-webhook-handler`
4. Click on latest log stream

**CLI**:
```bash
aws logs tail "/aws/lambda/whatsapp-webhook-handler" \
  --region us-east-1 \
  --since 10m \
  --follow
```

### Common Issues

1. **Database Connection Failed**:
   - Check security groups
   - Verify database credentials
   - Ensure Lambda has VPC access (if needed)

2. **Webhook Verification Failed**:
   - Check organization configuration in database
   - Verify token matches WhatsApp settings

3. **Function Timeout**:
   - Increase timeout in Lambda configuration
   - Check database query performance

## Security Checklist

- [ ] Database password is secure
- [ ] RDS security groups properly configured
- [ ] Lambda execution role has minimal permissions
- [ ] API Gateway has appropriate throttling
- [ ] CloudWatch monitoring enabled
- [ ] Organization webhook tokens are unique

## Cost Optimization

- Use RDS t3.micro for development
- Set Lambda reserved concurrency
- Enable CloudWatch log retention policies
- Use API Gateway caching if needed

Your WhatsApp webhook Lambda function is now deployed and ready to handle multi-organization webhook events!
