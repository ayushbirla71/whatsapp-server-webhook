-- Create extension for UUID generation (if not exists from main schema)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create additional enum types for webhook handling
CREATE TYPE webhook_event_type AS ENUM (
  'message_status', 'delivery_receipt', 'read_receipt',
  'message_received', 'user_status', 'error', 'interactive_response'
);

-- Function to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Organizations table for multi-tenant support
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

-- Webhook events table for tracking all webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID, -- Reference to organization for multi-tenant support
  campaign_id UUID, -- Reference to campaign if applicable
  campaign_audience_id UUID, -- Reference to campaign_audience record
  event_type webhook_event_type NOT NULL,
  whatsapp_message_id VARCHAR(255),
  from_phone_number VARCHAR(20), -- Phone number that sent the message/response
  to_phone_number VARCHAR(20), -- Phone number that received the message
  status VARCHAR(50),
  timestamp TIMESTAMP WITH TIME ZONE,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  error_message TEXT,

  -- Interactive message response data
  interactive_type VARCHAR(50), -- button_reply, list_reply, etc.
  interactive_data JSONB, -- Store button/list selection data

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages table for tracking all message content and interactions
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL, -- Reference to organizations table
  campaign_id UUID, -- Reference to campaigns table (NULL for non-campaign messages)
  campaign_audience_id UUID, -- Reference to campaign_audience table (NULL for non-campaign messages)
  whatsapp_message_id VARCHAR(255) UNIQUE,

  -- Message routing
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,

  -- Message content
  message_type VARCHAR(50) DEFAULT 'text', -- text, image, video, audio, document, location, contact, sticker, template, interactive
  message_content TEXT,
  media_url TEXT,
  media_type VARCHAR(50),

  -- Template information (for outgoing template messages)
  template_name VARCHAR(255),
  template_language VARCHAR(10),
  template_parameters JSONB, -- Store template parameter values

  -- Message direction and status
  is_incoming BOOLEAN DEFAULT false,
  message_status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, read, failed
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,

  -- Interactive message tracking (for buttons, lists, etc.)
  interaction_data JSONB, -- Store interactive template data and responses

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Incoming messages table for tracking received messages
CREATE TABLE IF NOT EXISTS incoming_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID, -- Reference to organization
  whatsapp_message_id VARCHAR(255) UNIQUE NOT NULL,
  from_phone_number VARCHAR(20) NOT NULL,
  to_phone_number VARCHAR(20) NOT NULL,
  message_type VARCHAR(50) NOT NULL, -- text, image, video, audio, document, location, etc.
  content TEXT,
  media_url TEXT,
  media_type VARCHAR(50),
  media_size INTEGER,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Interactive message data
  interactive_type VARCHAR(50), -- button_reply, list_reply, etc.
  interactive_data JSONB, -- Store button/list selection data

  -- Context (if replying to a campaign message)
  context_message_id VARCHAR(255), -- WhatsApp message ID being replied to
  context_campaign_id UUID, -- Campaign that the original message belonged to

  raw_payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance

-- Organizations table indexes
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_business_account_id
  ON organizations(whatsapp_business_account_id) WHERE whatsapp_business_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_phone_number_id
  ON organizations(whatsapp_phone_number_id) WHERE whatsapp_phone_number_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_webhook_verify_token
  ON organizations(whatsapp_webhook_verify_token) WHERE whatsapp_webhook_verify_token IS NOT NULL;

-- Messages table indexes
CREATE INDEX IF NOT EXISTS idx_messages_organization_id ON messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_campaign_id ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_campaign_audience_id ON messages(campaign_audience_id);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON messages(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_from_number ON messages(from_number);
CREATE INDEX IF NOT EXISTS idx_messages_to_number ON messages(to_number);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(message_status);
CREATE INDEX IF NOT EXISTS idx_messages_is_incoming ON messages(is_incoming);
CREATE INDEX IF NOT EXISTS idx_messages_template_name ON messages(template_name);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(organization_id, from_number, to_number);

-- Webhook events table indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_organization_id ON webhook_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_campaign_id ON webhook_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_campaign_audience_id ON webhook_events(campaign_audience_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_whatsapp_id ON webhook_events(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_timestamp ON webhook_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_webhook_events_from_phone ON webhook_events(from_phone_number);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);

-- Incoming messages table indexes
CREATE INDEX IF NOT EXISTS idx_incoming_messages_organization_id ON incoming_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_whatsapp_id ON incoming_messages(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_from_phone ON incoming_messages(from_phone_number);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_to_phone ON incoming_messages(to_phone_number);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_processed ON incoming_messages(processed);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_context_campaign ON incoming_messages(context_campaign_id);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_timestamp ON incoming_messages(timestamp);

-- Create triggers for updated_at columns
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
