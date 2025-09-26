const pool = require('../db/connection');

class IncomingMessage {
  constructor(data) {
    this.id = data.id;
    this.organizationId = data.organization_id;
    this.whatsappMessageId = data.whatsapp_message_id;
    this.fromPhoneNumber = data.from_phone_number;
    this.toPhoneNumber = data.to_phone_number;
    this.messageType = data.message_type;
    this.content = data.content;
    this.mediaUrl = data.media_url;
    this.mediaType = data.media_type;
    this.mediaSize = data.media_size;
    this.timestamp = data.timestamp;
    this.interactiveType = data.interactive_type;
    this.interactiveData = data.interactive_data;
    this.contextMessageId = data.context_message_id;
    this.contextCampaignId = data.context_campaign_id;
    this.rawPayload = data.raw_payload;
    this.processed = data.processed;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  // Create new incoming message
  static async create(messageData) {
    try {
      const query = `
        INSERT INTO incoming_messages (
          organization_id, whatsapp_message_id, from_phone_number, to_phone_number,
          message_type, content, media_url, media_type, media_size, timestamp,
          interactive_type, interactive_data, context_message_id, context_campaign_id,
          raw_payload, processed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `;
      
      const params = [
        messageData.organizationId,
        messageData.whatsappMessageId,
        messageData.fromPhoneNumber,
        messageData.toPhoneNumber,
        messageData.messageType,
        messageData.content,
        messageData.mediaUrl || null,
        messageData.mediaType || null,
        messageData.mediaSize || null,
        messageData.timestamp,
        messageData.interactiveType || null,
        messageData.interactiveData ? JSON.stringify(messageData.interactiveData) : null,
        messageData.contextMessageId || null,
        messageData.contextCampaignId || null,
        JSON.stringify(messageData.rawPayload),
        false
      ];

      const result = await pool.query(query, params);
      return new IncomingMessage(result.rows[0]);
    } catch (error) {
      console.error('Error creating incoming message:', error);
      throw error;
    }
  }

  // Find incoming message by WhatsApp message ID
  static async findByWhatsAppMessageId(whatsappMessageId) {
    try {
      const query = 'SELECT * FROM incoming_messages WHERE whatsapp_message_id = $1';
      const result = await pool.query(query, [whatsappMessageId]);
      return result.rows.length > 0 ? new IncomingMessage(result.rows[0]) : null;
    } catch (error) {
      console.error('Error finding incoming message by WhatsApp ID:', error);
      throw error;
    }
  }

  // Find incoming messages by organization
  static async findByOrganization(organizationId, limit = 50, offset = 0) {
    try {
      const query = `
        SELECT * FROM incoming_messages 
        WHERE organization_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2 OFFSET $3
      `;
      const result = await pool.query(query, [organizationId, limit, offset]);
      return result.rows.map(row => new IncomingMessage(row));
    } catch (error) {
      console.error('Error finding incoming messages by organization:', error);
      throw error;
    }
  }

  // Find incoming messages by phone number
  static async findByPhoneNumber(phoneNumber, organizationId = null, limit = 50) {
    try {
      let query = `
        SELECT * FROM incoming_messages 
        WHERE from_phone_number = $1
      `;
      const params = [phoneNumber];
      
      if (organizationId) {
        query += ' AND organization_id = $2';
        params.push(organizationId);
      }
      
      query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await pool.query(query, params);
      return result.rows.map(row => new IncomingMessage(row));
    } catch (error) {
      console.error('Error finding incoming messages by phone number:', error);
      throw error;
    }
  }

  // Find incoming messages that are replies to a campaign
  static async findRepliesByCampaign(campaignId, organizationId = null) {
    try {
      let query = `
        SELECT * FROM incoming_messages 
        WHERE context_campaign_id = $1
      `;
      const params = [campaignId];
      
      if (organizationId) {
        query += ' AND organization_id = $2';
        params.push(organizationId);
      }
      
      query += ' ORDER BY timestamp DESC';

      const result = await pool.query(query, params);
      return result.rows.map(row => new IncomingMessage(row));
    } catch (error) {
      console.error('Error finding campaign replies:', error);
      throw error;
    }
  }

  // Find unprocessed incoming messages
  static async findUnprocessed(organizationId = null, limit = 100) {
    try {
      let query = `
        SELECT * FROM incoming_messages 
        WHERE processed = false
      `;
      const params = [];
      
      if (organizationId) {
        query += ' AND organization_id = $1';
        params.push(organizationId);
      }
      
      query += ' ORDER BY timestamp ASC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await pool.query(query, params);
      return result.rows.map(row => new IncomingMessage(row));
    } catch (error) {
      console.error('Error finding unprocessed incoming messages:', error);
      throw error;
    }
  }

  // Mark incoming message as processed
  static async markAsProcessed(id, errorMessage = null) {
    try {
      const query = `
        UPDATE incoming_messages 
        SET processed = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;
      const result = await pool.query(query, [id]);
      return result.rows.length > 0 ? new IncomingMessage(result.rows[0]) : null;
    } catch (error) {
      console.error('Error marking incoming message as processed:', error);
      throw error;
    }
  }

  // Update context campaign ID (link to original campaign)
  async updateContextCampaign(campaignId, contextMessageId = null) {
    try {
      const query = `
        UPDATE incoming_messages 
        SET 
          context_campaign_id = $1,
          context_message_id = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      const result = await pool.query(query, [campaignId, contextMessageId, this.id]);
      
      if (result.rows.length > 0) {
        const updated = new IncomingMessage(result.rows[0]);
        Object.assign(this, updated);
        return this;
      }
      return null;
    } catch (error) {
      console.error('Error updating context campaign:', error);
      throw error;
    }
  }

  // Get conversation history for a phone number
  static async getConversationHistory(phoneNumber, organizationId, limit = 20) {
    try {
      const query = `
        SELECT * FROM incoming_messages 
        WHERE from_phone_number = $1 AND organization_id = $2
        ORDER BY timestamp DESC 
        LIMIT $3
      `;
      const result = await pool.query(query, [phoneNumber, organizationId, limit]);
      return result.rows.map(row => new IncomingMessage(row));
    } catch (error) {
      console.error('Error getting conversation history:', error);
      throw error;
    }
  }

  // Get interactive message statistics
  static async getInteractiveStats(organizationId, campaignId = null, dateFrom = null, dateTo = null) {
    try {
      let query = `
        SELECT 
          interactive_type,
          COUNT(*) as count,
          COUNT(DISTINCT from_phone_number) as unique_users
        FROM incoming_messages 
        WHERE organization_id = $1 
        AND interactive_type IS NOT NULL
      `;
      const params = [organizationId];
      
      if (campaignId) {
        query += ' AND context_campaign_id = $' + (params.length + 1);
        params.push(campaignId);
      }
      
      if (dateFrom) {
        query += ' AND timestamp >= $' + (params.length + 1);
        params.push(dateFrom);
      }
      
      if (dateTo) {
        query += ' AND timestamp <= $' + (params.length + 1);
        params.push(dateTo);
      }
      
      query += ' GROUP BY interactive_type ORDER BY count DESC';

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting interactive stats:', error);
      throw error;
    }
  }

  // Check if message is a duplicate
  static async isDuplicate(whatsappMessageId) {
    try {
      const query = 'SELECT id FROM incoming_messages WHERE whatsapp_message_id = $1';
      const result = await pool.query(query, [whatsappMessageId]);
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking for duplicate message:', error);
      throw error;
    }
  }
}

module.exports = IncomingMessage;
