const pool = require('../db/connection');

class CampaignAudience {
  constructor(data) {
    this.id = data.id;
    this.campaignId = data.campaign_id;
    this.organizationId = data.organization_id;
    this.name = data.name;
    this.msisdn = data.msisdn;
    this.attributes = data.attributes;
    this.messageStatus = data.message_status;
    this.sentAt = data.sent_at;
    this.deliveredAt = data.delivered_at;
    this.readAt = data.read_at;
    this.failedAt = data.failed_at;
    this.failureReason = data.failure_reason;
    this.whatsappMessageId = data.whatsapp_message_id;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  // Find campaign audience by WhatsApp message ID
  static async findByWhatsAppId(whatsappMessageId) {
    try {
      const query = 'SELECT * FROM campaign_audience WHERE whatsapp_message_id = $1';
      const result = await pool.query(query, [whatsappMessageId]);
      return result.rows.length > 0 ? new CampaignAudience(result.rows[0]) : null;
    } catch (error) {
      console.error('Error finding campaign audience by WhatsApp ID:', error);
      throw error;
    }
  }

  // Find campaign audience by ID
  static async findById(id) {
    try {
      const query = 'SELECT * FROM campaign_audience WHERE id = $1';
      const result = await pool.query(query, [id]);
      return result.rows.length > 0 ? new CampaignAudience(result.rows[0]) : null;
    } catch (error) {
      console.error('Error finding campaign audience by ID:', error);
      throw error;
    }
  }

  // Update message status for campaign audience
  static async updateStatus(whatsappMessageId, status, timestamp = null) {
    try {
      let query, params;
      
      if (status === 'delivered') {
        query = `
          UPDATE campaign_audience 
          SET message_status = $1, delivered_at = $2, updated_at = CURRENT_TIMESTAMP 
          WHERE whatsapp_message_id = $3 
          RETURNING *
        `;
        params = [status, timestamp || new Date(), whatsappMessageId];
      } else if (status === 'read') {
        query = `
          UPDATE campaign_audience 
          SET message_status = $1, read_at = $2, updated_at = CURRENT_TIMESTAMP 
          WHERE whatsapp_message_id = $3 
          RETURNING *
        `;
        params = [status, timestamp || new Date(), whatsappMessageId];
      } else if (status === 'sent') {
        query = `
          UPDATE campaign_audience 
          SET message_status = $1, sent_at = $2, updated_at = CURRENT_TIMESTAMP 
          WHERE whatsapp_message_id = $3 
          RETURNING *
        `;
        params = [status, timestamp || new Date(), whatsappMessageId];
      } else {
        query = `
          UPDATE campaign_audience 
          SET message_status = $1, updated_at = CURRENT_TIMESTAMP 
          WHERE whatsapp_message_id = $2 
          RETURNING *
        `;
        params = [status, whatsappMessageId];
      }

      const result = await pool.query(query, params);
      
      // Also update campaign statistics
      if (result.rows.length > 0) {
        await CampaignAudience.updateCampaignStats(result.rows[0].campaign_id);
      }
      
      return result.rows.length > 0 ? new CampaignAudience(result.rows[0]) : null;
    } catch (error) {
      console.error('Error updating campaign audience status:', error);
      throw error;
    }
  }

  // Update campaign audience with failure reason
  static async updateWithFailure(whatsappMessageId, failureReason) {
    try {
      const query = `
        UPDATE campaign_audience 
        SET message_status = 'failed', failure_reason = $1, failed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE whatsapp_message_id = $2 
        RETURNING *
      `;
      const result = await pool.query(query, [failureReason, whatsappMessageId]);
      
      // Update campaign statistics
      if (result.rows.length > 0) {
        await CampaignAudience.updateCampaignStats(result.rows[0].campaign_id);
      }
      
      return result.rows.length > 0 ? new CampaignAudience(result.rows[0]) : null;
    } catch (error) {
      console.error('Error updating campaign audience with failure:', error);
      throw error;
    }
  }

  // Update campaign statistics based on audience status
  static async updateCampaignStats(campaignId) {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_targeted_audience,
          COUNT(CASE WHEN message_status = 'sent' THEN 1 END) as total_sent,
          COUNT(CASE WHEN message_status = 'delivered' THEN 1 END) as total_delivered,
          COUNT(CASE WHEN message_status = 'read' THEN 1 END) as total_read,
          COUNT(CASE WHEN message_status = 'failed' THEN 1 END) as total_failed
        FROM campaign_audience 
        WHERE campaign_id = $1
      `;
      
      const statsResult = await pool.query(statsQuery, [campaignId]);
      const stats = statsResult.rows[0];
      
      const updateQuery = `
        UPDATE campaigns 
        SET 
          total_targeted_audience = $1,
          total_sent = $2,
          total_delivered = $3,
          total_read = $4,
          total_failed = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `;
      
      await pool.query(updateQuery, [
        stats.total_targeted_audience,
        stats.total_sent,
        stats.total_delivered,
        stats.total_read,
        stats.total_failed,
        campaignId
      ]);
      
      console.log(`Updated campaign ${campaignId} statistics:`, stats);
    } catch (error) {
      console.error('Error updating campaign statistics:', error);
      throw error;
    }
  }

  // Get campaign audience by campaign ID
  static async getByCampaignId(campaignId, limit = 100, offset = 0) {
    try {
      const query = `
        SELECT * FROM campaign_audience 
        WHERE campaign_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `;
      const result = await pool.query(query, [campaignId, limit, offset]);
      return result.rows.map(row => new CampaignAudience(row));
    } catch (error) {
      console.error('Error getting campaign audience:', error);
      throw error;
    }
  }

  // Get campaign audience by phone number and organization
  static async getByPhoneAndOrg(msisdn, organizationId) {
    try {
      const query = `
        SELECT ca.*, c.name as campaign_name 
        FROM campaign_audience ca 
        JOIN campaigns c ON ca.campaign_id = c.id 
        WHERE ca.msisdn = $1 AND ca.organization_id = $2 
        ORDER BY ca.created_at DESC
      `;
      const result = await pool.query(query, [msisdn, organizationId]);
      return result.rows.map(row => new CampaignAudience(row));
    } catch (error) {
      console.error('Error getting campaign audience by phone:', error);
      throw error;
    }
  }

  // Get pending messages for sending
  static async getPendingMessages(limit = 100) {
    try {
      const query = `
        SELECT ca.*, c.name as campaign_name, t.name as template_name
        FROM campaign_audience ca
        JOIN campaigns c ON ca.campaign_id = c.id
        JOIN templates t ON c.template_id = t.id
        WHERE ca.message_status = 'pending'
        AND c.status = 'approved'
        ORDER BY ca.created_at ASC
        LIMIT $1
      `;
      const result = await pool.query(query, [limit]);
      return result.rows.map(row => new CampaignAudience(row));
    } catch (error) {
      console.error('Error getting pending messages:', error);
      throw error;
    }
  }
}

module.exports = CampaignAudience;
