-- Migration script to add organizations table and fix existing schema
-- Run this if you already have a database with the old schema

-- Create the update function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  
  -- WhatsApp Business API configuration
  whatsapp_business_account_id VARCHAR(255),
  whatsapp_access_token TEXT,
  whatsapp_phone_number_id VARCHAR(255),
  whatsapp_webhook_verify_token VARCHAR(255),
  whatsapp_webhook_url TEXT,
  whatsapp_app_id VARCHAR(255),
  whatsapp_app_secret TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

-- Create indexes for organizations table
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_business_account_id 
  ON organizations(whatsapp_business_account_id) WHERE whatsapp_business_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_phone_number_id 
  ON organizations(whatsapp_phone_number_id) WHERE whatsapp_phone_number_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_webhook_verify_token 
  ON organizations(whatsapp_webhook_verify_token) WHERE whatsapp_webhook_verify_token IS NOT NULL;

-- Create trigger for organizations updated_at
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert a sample organization (replace with your actual data)
INSERT INTO organizations (
  name, 
  description, 
  status,
  whatsapp_business_account_id,
  whatsapp_access_token,
  whatsapp_phone_number_id,
  whatsapp_webhook_verify_token,
  whatsapp_app_secret
) VALUES (
  'Default Organization',
  'Default organization for WhatsApp webhook',
  'active',
  'your_business_account_id_here',
  'your_access_token_here',
  'your_phone_number_id_here',
  'your_unique_verify_token_here',
  'your_app_secret_here'
) ON CONFLICT DO NOTHING;

-- Show the inserted organization
SELECT 
  id,
  name,
  status,
  whatsapp_business_account_id,
  whatsapp_phone_number_id,
  whatsapp_webhook_verify_token,
  created_at
FROM organizations;

-- Instructions for updating the organization
/*
To configure your organization with actual WhatsApp credentials, run:

UPDATE organizations 
SET 
  whatsapp_business_account_id = 'your_actual_business_account_id',
  whatsapp_access_token = 'your_actual_access_token',
  whatsapp_phone_number_id = 'your_actual_phone_number_id',
  whatsapp_webhook_verify_token = 'your_unique_verify_token',
  whatsapp_webhook_url = 'https://your-api-gateway-url/prod/webhook',
  whatsapp_app_id = 'your_app_id',
  whatsapp_app_secret = 'your_app_secret'
WHERE name = 'Default Organization';

Make sure each organization has a unique whatsapp_webhook_verify_token!
*/
