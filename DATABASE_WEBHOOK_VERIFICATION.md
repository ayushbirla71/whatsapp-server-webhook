# Database-Based Webhook Verification

## 🔐 **Enhanced Security with Database Verification**

I've updated the webhook receiver Lambda to use **database-based verification** instead of static environment variables. This provides much better security and multi-organization support.

## 🏗️ **How It Works**

### **Webhook Verification (GET Request)**
```javascript
// WhatsApp sends: GET /webhook?hub.mode=subscribe&hub.verify_token=your_token&hub.challenge=test123

// 1. Extract verify token from query parameters
const token = queryParams["hub.verify_token"];

// 2. Query database to verify token
const query = `
  SELECT id, name FROM organizations 
  WHERE whatsapp_webhook_verify_token = $1 AND status = 'active'
`;

// 3. If token found, return challenge; otherwise return 403
```

### **Webhook Events (POST Request)**
```javascript
// WhatsApp sends webhook payload

// 1. Extract business account ID or phone number ID from payload
const businessAccountId = webhookPayload.entry[0].id;
const phoneNumberId = webhookPayload.entry[0].changes[0].value.metadata.phone_number_id;

// 2. Find organization in database
const organization = await findOrganizationByBusinessAccountId(businessAccountId);

// 3. Verify HMAC signature using organization's app secret
const isValid = verifyWebhookSignature(payload, signature, organization.whatsapp_app_secret);

// 4. If valid, forward to SQS; otherwise return 403
```

## 📊 **Database Schema Requirements**

Your `organizations` table must have these fields configured:

```sql
-- Required for webhook verification
whatsapp_webhook_verify_token VARCHAR(255) -- Unique token for each organization
whatsapp_app_secret VARCHAR(255)           -- For HMAC signature verification

-- Required for organization lookup
whatsapp_business_account_id VARCHAR(255)  -- From webhook payload entry.id
whatsapp_phone_number_id VARCHAR(255)      -- From webhook payload metadata.phone_number_id

-- Required for status check
status organization_status DEFAULT 'active' -- Only active orgs can receive webhooks
```

## 🔧 **Configuration Steps**

### **1. Configure Your Organization**

```sql
-- Insert or update your organization with WhatsApp credentials
INSERT INTO organizations (
  name,
  whatsapp_business_account_id,
  whatsapp_phone_number_id,
  whatsapp_webhook_verify_token,
  whatsapp_app_secret,
  status
) VALUES (
  'My Organization',
  'your_business_account_id_from_whatsapp',
  'your_phone_number_id_from_whatsapp',
  'unique_verify_token_12345',  -- Create a unique token
  'your_app_secret_from_whatsapp',
  'active'
) ON CONFLICT (name) DO UPDATE SET
  whatsapp_business_account_id = EXCLUDED.whatsapp_business_account_id,
  whatsapp_phone_number_id = EXCLUDED.whatsapp_phone_number_id,
  whatsapp_webhook_verify_token = EXCLUDED.whatsapp_webhook_verify_token,
  whatsapp_app_secret = EXCLUDED.whatsapp_app_secret,
  status = EXCLUDED.status;
```

### **2. Get Your WhatsApp Credentials**

#### **Business Account ID**
- Go to: https://developers.facebook.com/
- Select your WhatsApp Business API app
- Go to WhatsApp → API Setup
- Copy the "WhatsApp Business Account ID"

#### **Phone Number ID**
- In the same API Setup page
- Copy the "Phone number ID" from the "From" dropdown

#### **App Secret**
- Go to Settings → Basic
- Copy the "App Secret" (click "Show")

#### **Verify Token**
- Create a unique string for your organization
- Example: `myorg_webhook_token_2024`
- **Important**: Each organization must have a unique token

### **3. Configure WhatsApp Business API**

In your WhatsApp Business API settings:
- **Webhook URL**: `https://your-api-gateway-url/prod/webhook`
- **Verify Token**: The `whatsapp_webhook_verify_token` from your database
- **Webhook Fields**: Select `messages`

## 🚀 **Deployment**

### **Environment Variables**
```powershell
# Database connection (required for webhook receiver)
$env:DB_HOST = "your-rds-endpoint.amazonaws.com"
$env:DB_PASSWORD = "your-database-password"
$env:DB_NAME = "whatsapp_db"
$env:DB_USER = "postgres"

# These are now optional (database takes precedence)
$env:WEBHOOK_VERIFY_TOKEN = "fallback_token"  # Optional fallback
$env:WEBHOOK_SECRET = "fallback_secret"       # Optional fallback
```

### **Deploy**
```powershell
.\deployment\deploy-two-lambda.ps1
```

## 🔍 **Verification Process**

### **Step 1: Database Lookup**
```sql
-- Webhook receiver queries this for verification
SELECT id, name FROM organizations 
WHERE whatsapp_webhook_verify_token = 'unique_verify_token_12345' 
AND status = 'active';
```

### **Step 2: Organization Lookup**
```sql
-- Webhook receiver queries this for signature verification
SELECT * FROM organizations 
WHERE whatsapp_business_account_id = 'your_business_account_id' 
AND status = 'active';
```

### **Step 3: Signature Verification**
```javascript
// Uses organization's app secret
const expectedSignature = crypto
  .createHmac('sha256', organization.whatsapp_app_secret)
  .update(payload, 'utf8')
  .digest('hex');
```

## 🧪 **Testing**

### **Test Webhook Verification**
```bash
# This should return the challenge if your organization is configured correctly
curl "https://your-api-gateway-url/prod/webhook?hub.mode=subscribe&hub.verify_token=unique_verify_token_12345&hub.challenge=test123"

# Expected response: test123
```

### **Test Organization Lookup**
```sql
-- Verify your organization is configured correctly
SELECT 
  name,
  whatsapp_business_account_id,
  whatsapp_phone_number_id,
  whatsapp_webhook_verify_token IS NOT NULL as has_verify_token,
  whatsapp_app_secret IS NOT NULL as has_app_secret,
  status
FROM organizations 
WHERE status = 'active';
```

### **Check Logs**
```powershell
# Check webhook receiver logs for verification attempts
.\deployment\deploy-two-lambda.ps1 -ShowLogs webhook-receiver
```

## 🛡️ **Security Benefits**

### **1. Multi-Organization Support**
- Each organization has its own verify token
- Each organization has its own app secret
- Isolated webhook verification per organization

### **2. Dynamic Configuration**
- No need to redeploy Lambda when adding organizations
- Update tokens and secrets in database only
- Immediate effect without code changes

### **3. Centralized Management**
- All webhook credentials in one place
- Easy to rotate tokens and secrets
- Audit trail of organization configurations

### **4. Enhanced Security**
- Unique tokens prevent cross-organization access
- Database-driven verification is more secure than static env vars
- Organization status can disable webhooks instantly

## ⚠️ **Important Notes**

### **Unique Verify Tokens**
Each organization **must** have a unique `whatsapp_webhook_verify_token`. WhatsApp will use this token to verify your webhook endpoint.

### **Database Connection**
The webhook receiver now requires database access. Ensure:
- Database credentials are correct in environment variables
- Lambda has network access to your RDS instance
- Security groups allow connections from Lambda to RDS

### **Fallback Behavior**
If database lookup fails, the webhook receiver will:
1. Log the error
2. Return 500 Internal Server Error
3. WhatsApp will retry the webhook

### **Performance**
Database lookups add ~10-50ms to webhook response time, but this is still well within WhatsApp's timeout limits.

## 🔄 **Migration from Static Tokens**

If you were using static environment variables before:

1. **Keep existing environment variables** as fallback
2. **Configure organizations in database** with proper tokens
3. **Test webhook verification** with database tokens
4. **Update WhatsApp configuration** to use database tokens
5. **Remove environment variable fallbacks** once confirmed working

The webhook receiver now provides enterprise-grade security with database-driven verification!
