# Windows Step-by-Step Deployment Guide

## Prerequisites Installation

### 1. Install AWS CLI v2
1. Download AWS CLI installer: https://awscli.amazonaws.com/AWSCLIV2.msi
2. Run the installer as Administrator
3. Open Command Prompt and verify: `aws --version`

### 2. Install Node.js (if not installed)
1. Download from: https://nodejs.org/
2. Install LTS version
3. Verify: `node --version` and `npm --version`

### 3. Configure AWS CLI
```cmd
aws configure
```
Enter your:
- AWS Access Key ID
- AWS Secret Access Key  
- Default region (e.g., us-east-1)
- Default output format: json

## Method 1: Automated Deployment (Recommended)

### Step 1: Set Environment Variables
Open Command Prompt as Administrator:

```cmd
set DB_HOST=your-database-host.amazonaws.com
set DB_PASSWORD=your-database-password
set DB_NAME=whatsapp_db
set DB_USER=postgres
```

### Step 2: Run Deployment Script
```cmd
cd C:\Users\ayush\Demokrito\whatsapp-server-webhook
deployment\deploy.sh
```

**Note**: If you get permission errors, run in Git Bash or WSL:
```bash
chmod +x deployment/deploy.sh
./deployment/deploy.sh
```

## Method 2: Manual AWS Console Deployment

### Step 1: Prepare Code Package

1. **Open PowerShell in project directory**:
```powershell
cd C:\Users\ayush\Demokrito\whatsapp-server-webhook
```

2. **Install dependencies**:
```powershell
npm install --production
```

3. **Create ZIP package**:
```powershell
# Remove old package if exists
Remove-Item whatsapp-webhook.zip -ErrorAction SilentlyContinue

# Create new package
Compress-Archive -Path * -DestinationPath whatsapp-webhook.zip -Force
```

### Step 2: Create Lambda Function in AWS Console

1. **Open AWS Lambda Console**:
   - Go to: https://console.aws.amazon.com/lambda/
   - Select region: us-east-1 (or your preferred region)

2. **Create Function**:
   - Click "Create function"
   - Choose "Author from scratch"
   - Function name: `whatsapp-webhook-handler`
   - Runtime: `Node.js 18.x`
   - Click "Create function"

3. **Upload Code**:
   - In "Code" tab, click "Upload from" → ".zip file"
   - Select your `whatsapp-webhook.zip` file
   - Click "Save"

### Step 3: Configure Lambda Settings

1. **Environment Variables**:
   - Go to "Configuration" → "Environment variables"
   - Click "Edit" → "Add environment variable"
   - Add these variables:
     ```
     DB_HOST = your-database-host.amazonaws.com
     DB_NAME = whatsapp_db
     DB_USER = postgres
     DB_PASSWORD = your-database-password
     NODE_ENV = production
     ```
   - Click "Save"

2. **Basic Settings**:
   - Go to "Configuration" → "General configuration"
   - Click "Edit"
   - Timeout: 30 seconds
   - Memory: 512 MB
   - Click "Save"

### Step 4: Create API Gateway

1. **Open API Gateway Console**:
   - Go to: https://console.aws.amazon.com/apigateway/
   - Click "Create API"

2. **Create REST API**:
   - Choose "REST API" → "Build"
   - API name: `whatsapp-webhook-api`
   - Click "Create API"

3. **Create /webhook Resource**:
   - Click "Actions" → "Create Resource"
   - Resource Name: `webhook`
   - Click "Create Resource"

4. **Create GET Method**:
   - Select `/webhook` resource
   - Click "Actions" → "Create Method"
   - Select "GET" → Click checkmark
   - Integration type: "Lambda Function"
   - Lambda Function: `whatsapp-webhook-handler`
   - Click "Save" → "OK"

5. **Create POST Method**:
   - Select `/webhook` resource
   - Click "Actions" → "Create Method"
   - Select "POST" → Click checkmark
   - Integration type: "Lambda Function"
   - Lambda Function: `whatsapp-webhook-handler`
   - Click "Save" → "OK"

6. **Deploy API**:
   - Click "Actions" → "Deploy API"
   - Deployment stage: "New Stage"
   - Stage name: `prod`
   - Click "Deploy"
   - **Copy the Invoke URL** (e.g., https://abc123.execute-api.us-east-1.amazonaws.com/prod)

## Method 3: Command Line Deployment

### Step 1: Set Environment Variables
```cmd
set DB_HOST=your-database-host.amazonaws.com
set DB_PASSWORD=your-database-password
set DB_NAME=whatsapp_db
set DB_USER=postgres
```

### Step 2: Deploy CloudFormation Stack
```cmd
aws cloudformation deploy ^
  --template-file deployment/cloudformation.yaml ^
  --stack-name whatsapp-webhook-stack ^
  --parameter-overrides ^
    FunctionName=whatsapp-webhook-handler ^
    Environment=production ^
    DBHost=%DB_HOST% ^
    DBName=%DB_NAME% ^
    DBUser=%DB_USER% ^
    DBPassword=%DB_PASSWORD% ^
  --capabilities CAPABILITY_NAMED_IAM ^
  --region us-east-1
```

### Step 3: Package and Deploy Code
```cmd
# Install dependencies
npm install --production

# Create package
powershell Compress-Archive -Path * -DestinationPath whatsapp-webhook-lambda.zip -Force

# Update function code
aws lambda update-function-code ^
  --function-name whatsapp-webhook-handler ^
  --zip-file fileb://whatsapp-webhook-lambda.zip ^
  --region us-east-1
```

### Step 4: Get Webhook URL
```cmd
aws cloudformation describe-stacks ^
  --stack-name whatsapp-webhook-stack ^
  --region us-east-1 ^
  --query "Stacks[0].Outputs[?OutputKey=='WebhookUrl'].OutputValue" ^
  --output text
```

## Database Setup

### Option 1: Use Existing Database
If you already have a PostgreSQL database, just run the schema:

```cmd
# Install PostgreSQL client if needed
# Download from: https://www.postgresql.org/download/windows/

# Run schema
psql -h your-database-host.com -U postgres -d whatsapp_db -f db/schema.sql
```

### Option 2: Create RDS Database
```cmd
aws rds create-db-instance ^
  --db-instance-identifier whatsapp-db ^
  --db-instance-class db.t3.micro ^
  --engine postgres ^
  --master-username postgres ^
  --master-user-password YourSecurePassword123 ^
  --allocated-storage 20 ^
  --publicly-accessible ^
  --region us-east-1
```

Wait for database to be available (5-10 minutes), then get endpoint:
```cmd
aws rds describe-db-instances ^
  --db-instance-identifier whatsapp-db ^
  --query "DBInstances[0].Endpoint.Address" ^
  --output text
```

## Configure Organizations in Database

1. **Connect to your database** using pgAdmin or command line
2. **Run this SQL** (replace with your actual values):

```sql
-- Insert your organization
INSERT INTO organizations (
  id, name, status,
  whatsapp_business_account_id,
  whatsapp_access_token,
  whatsapp_phone_number_id,
  whatsapp_webhook_verify_token,
  whatsapp_app_secret
) VALUES (
  uuid_generate_v4(),
  'My Organization',
  'active',
  'your_business_account_id_from_meta',
  'your_access_token_from_meta',
  'your_phone_number_id_from_meta',
  'unique_verify_token_123',
  'your_app_secret_from_meta'
);
```

## Test Your Deployment

### 1. Test Webhook Verification
Open browser or use curl:
```
https://your-api-gateway-url/prod/webhook?hub.mode=subscribe&hub.verify_token=unique_verify_token_123&hub.challenge=test123
```

Should return: `test123`

### 2. Check Logs
```cmd
aws logs tail "/aws/lambda/whatsapp-webhook-handler" ^
  --region us-east-1 ^
  --since 10m
```

## Configure WhatsApp Business API

1. **Go to Meta for Developers**: https://developers.facebook.com/
2. **Open your WhatsApp Business API app**
3. **Go to WhatsApp → Configuration**
4. **Set Webhook URL**: `https://your-api-gateway-url/prod/webhook`
5. **Set Verify Token**: `unique_verify_token_123` (from your database)
6. **Subscribe to**: `messages` field
7. **Click "Verify and Save"**

## Troubleshooting

### Common Windows Issues

1. **PowerShell Execution Policy**:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

2. **AWS CLI Not Found**:
   - Restart Command Prompt after installation
   - Check PATH environment variable

3. **Node.js/NPM Issues**:
   - Restart Command Prompt
   - Run as Administrator

### Check Deployment Status

```cmd
# Check Lambda function
aws lambda get-function --function-name whatsapp-webhook-handler

# Check CloudFormation stack
aws cloudformation describe-stacks --stack-name whatsapp-webhook-stack

# Check API Gateway
aws apigateway get-rest-apis
```

## Final Checklist

- [ ] AWS CLI configured
- [ ] Database accessible and schema deployed
- [ ] Lambda function created and code uploaded
- [ ] API Gateway created and deployed
- [ ] Environment variables set
- [ ] Organization configured in database
- [ ] WhatsApp webhook URL configured
- [ ] Webhook verification test passes

Your WhatsApp webhook is now deployed and ready to handle messages from multiple organizations!
