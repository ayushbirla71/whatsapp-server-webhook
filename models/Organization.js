const pool = require('../db/connection');

class Organization {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.status = data.status;
    this.whatsappBusinessAccountId = data.whatsapp_business_account_id;
    this.whatsappAccessToken = data.whatsapp_access_token;
    this.whatsappPhoneNumberId = data.whatsapp_phone_number_id;
    this.whatsappWebhookVerifyToken = data.whatsapp_webhook_verify_token;
    this.whatsappWebhookUrl = data.whatsapp_webhook_url;
    this.whatsappAppId = data.whatsapp_app_id;
    this.whatsappAppSecret = data.whatsapp_app_secret;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
    this.createdBy = data.created_by;
  }

  // Find organization by ID
  static async findById(id) {
    try {
      const query = 'SELECT * FROM organizations WHERE id = $1 AND status = $2';
      const result = await pool.query(query, [id, 'active']);
      return result.rows.length > 0 ? new Organization(result.rows[0]) : null;
    } catch (error) {
      console.error('Error finding organization by ID:', error);
      throw error;
    }
  }

  // Find organization by WhatsApp Business Account ID
  static async findByWhatsAppBusinessAccountId(businessAccountId) {
    try {
      const query = 'SELECT * FROM organizations WHERE whatsapp_business_account_id = $1 AND status = $2';
      const result = await pool.query(query, [businessAccountId, 'active']);
      return result.rows.length > 0 ? new Organization(result.rows[0]) : null;
    } catch (error) {
      console.error('Error finding organization by WhatsApp Business Account ID:', error);
      throw error;
    }
  }

  // Find organization by WhatsApp Phone Number ID
  static async findByWhatsAppPhoneNumberId(phoneNumberId) {
    try {
      const query = 'SELECT * FROM organizations WHERE whatsapp_phone_number_id = $1 AND status = $2';
      const result = await pool.query(query, [phoneNumberId, 'active']);
      return result.rows.length > 0 ? new Organization(result.rows[0]) : null;
    } catch (error) {
      console.error('Error finding organization by WhatsApp Phone Number ID:', error);
      throw error;
    }
  }

  // Find organization by webhook verify token
  static async findByWebhookVerifyToken(verifyToken) {
    try {
      const query = 'SELECT * FROM organizations WHERE whatsapp_webhook_verify_token = $1 AND status = $2';
      const result = await pool.query(query, [verifyToken, 'active']);
      return result.rows.length > 0 ? new Organization(result.rows[0]) : null;
    } catch (error) {
      console.error('Error finding organization by webhook verify token:', error);
      throw error;
    }
  }

  // Get all active organizations
  static async findAllActive() {
    try {
      const query = 'SELECT * FROM organizations WHERE status = $1 ORDER BY name';
      const result = await pool.query(query, ['active']);
      return result.rows.map(row => new Organization(row));
    } catch (error) {
      console.error('Error finding active organizations:', error);
      throw error;
    }
  }

  // Get organization webhook configuration
  getWebhookConfig() {
    return {
      verifyToken: this.whatsappWebhookVerifyToken,
      webhookUrl: this.whatsappWebhookUrl,
      businessAccountId: this.whatsappBusinessAccountId,
      phoneNumberId: this.whatsappPhoneNumberId,
      accessToken: this.whatsappAccessToken,
      appId: this.whatsappAppId,
      appSecret: this.whatsappAppSecret
    };
  }

  // Check if organization has complete WhatsApp configuration
  hasCompleteWhatsAppConfig() {
    return !!(
      this.whatsappBusinessAccountId &&
      this.whatsappAccessToken &&
      this.whatsappPhoneNumberId &&
      this.whatsappWebhookVerifyToken
    );
  }

  // Get webhook secret (derived from app secret or use a default)
  getWebhookSecret() {
    // You can derive this from app secret or store it separately
    // For now, using app secret or fallback to environment variable
    return this.whatsappAppSecret || process.env.DEFAULT_WEBHOOK_SECRET || 'default_secret';
  }

  // Update organization WhatsApp configuration
  static async updateWhatsAppConfig(id, config) {
    try {
      const query = `
        UPDATE organizations 
        SET 
          whatsapp_business_account_id = $1,
          whatsapp_access_token = $2,
          whatsapp_phone_number_id = $3,
          whatsapp_webhook_verify_token = $4,
          whatsapp_webhook_url = $5,
          whatsapp_app_id = $6,
          whatsapp_app_secret = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *
      `;
      
      const result = await pool.query(query, [
        config.businessAccountId,
        config.accessToken,
        config.phoneNumberId,
        config.webhookVerifyToken,
        config.webhookUrl,
        config.appId,
        config.appSecret,
        id
      ]);
      
      return result.rows.length > 0 ? new Organization(result.rows[0]) : null;
    } catch (error) {
      console.error('Error updating organization WhatsApp config:', error);
      throw error;
    }
  }

  // Extract organization ID from webhook payload
  static extractOrganizationFromWebhook(webhookPayload) {
    try {
      // Try to extract from different parts of the webhook payload
      if (webhookPayload.entry && webhookPayload.entry.length > 0) {
        const entry = webhookPayload.entry[0];
        
        // Business Account ID is usually in the entry ID
        if (entry.id) {
          return { businessAccountId: entry.id };
        }
        
        // Phone Number ID might be in the changes
        if (entry.changes && entry.changes.length > 0) {
          const change = entry.changes[0];
          if (change.value && change.value.metadata && change.value.metadata.phone_number_id) {
            return { phoneNumberId: change.value.metadata.phone_number_id };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting organization from webhook:', error);
      return null;
    }
  }
}

module.exports = Organization;
