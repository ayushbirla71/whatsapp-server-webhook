const pool = require("../db/connection");

class Message {
  constructor(data) {
    this.id = data.id;
    this.organizationId = data.organization_id;
    this.campaignId = data.campaign_id;
    this.campaignAudienceId = data.campaign_audience_id;
    this.whatsappMessageId = data.whatsapp_message_id;
    this.fromNumber = data.from_number;
    this.toNumber = data.to_number;
    this.messageType = data.message_type;
    this.messageContent = data.message_content;
    this.mediaUrl = data.media_url;
    this.mediaType = data.media_type;
    this.templateName = data.template_name;
    this.templateLanguage = data.template_language;
    this.templateParameters = data.template_parameters;
    this.isIncoming = data.is_incoming;
    this.messageStatus = data.message_status;
    this.sentAt = data.sent_at;
    this.deliveredAt = data.delivered_at;
    this.readAt = data.read_at;
    this.failedAt = data.failed_at;
    this.failureReason = data.failure_reason;
    this.interactionData = data.interaction_data;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  // Find message by WhatsApp message ID
  static async findByWhatsAppId(whatsappMessageId) {
    try {
      const query = "SELECT * FROM messages WHERE whatsapp_message_id = $1";
      const result = await pool.query(query, [whatsappMessageId]);
      return result.rows.length > 0 ? new Message(result.rows[0]) : null;
    } catch (error) {
      console.error("Error finding message by WhatsApp ID:", error);
      throw error;
    }
  }

  // Find message by ID
  static async findById(id) {
    try {
      const query = "SELECT * FROM messages WHERE id = $1";
      const result = await pool.query(query, [id]);
      return result.rows.length > 0 ? new Message(result.rows[0]) : null;
    } catch (error) {
      console.error("Error finding message by ID:", error);
      throw error;
    }
  }

  // Create new message entry
  static async create(messageData) {
    try {
      const query = `
        INSERT INTO messages (
          organization_id, campaign_id, campaign_audience_id, whatsapp_message_id,
          from_number, to_number, message_type, message_content, media_url, media_type,
          template_name, template_language, template_parameters, is_incoming,
          message_status, interaction_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `;
      const params = [
        messageData.organizationId,
        messageData.campaignId,
        messageData.campaignAudienceId,
        messageData.whatsappMessageId,
        messageData.fromNumber,
        messageData.toNumber,
        messageData.messageType || "text",
        messageData.messageContent,
        messageData.mediaUrl,
        messageData.mediaType,
        messageData.templateName,
        messageData.templateLanguage,
        messageData.templateParameters
          ? JSON.stringify(messageData.templateParameters)
          : null,
        messageData.isIncoming || false,
        messageData.messageStatus || "pending",
        messageData.interactionData
          ? JSON.stringify(messageData.interactionData)
          : null,
      ];

      const result = await pool.query(query, params);
      return new Message(result.rows[0]);
    } catch (error) {
      console.error("Error creating message:", error);
      throw error;
    }
  }

  // Update message status
  static async updateStatus(whatsappMessageId, status, timestamp = null) {
    try {
      let query, params;

      if (status === "delivered") {
        query = `
          UPDATE messages
          SET message_status = $1, delivered_at = $2, updated_at = CURRENT_TIMESTAMP
          WHERE whatsapp_message_id = $3
          RETURNING *
        `;
        params = [status, timestamp || new Date(), whatsappMessageId];
      } else if (status === "read") {
        query = `
          UPDATE messages
          SET message_status = $1, read_at = $2, updated_at = CURRENT_TIMESTAMP
          WHERE whatsapp_message_id = $3
          RETURNING *
        `;
        params = [status, timestamp || new Date(), whatsappMessageId];
      } else if (status === "sent") {
        query = `
          UPDATE messages
          SET message_status = $1, sent_at = $2, updated_at = CURRENT_TIMESTAMP
          WHERE whatsapp_message_id = $3
          RETURNING *
        `;
        params = [status, timestamp || new Date(), whatsappMessageId];
      } else {
        query = `
          UPDATE messages
          SET message_status = $1, updated_at = CURRENT_TIMESTAMP
          WHERE whatsapp_message_id = $2
          RETURNING *
        `;
        params = [status, whatsappMessageId];
      }

      const result = await pool.query(query, params);
      return result.rows.length > 0 ? new Message(result.rows[0]) : null;
    } catch (error) {
      console.error("Error updating message status:", error);
      throw error;
    }
  }

  // Update message with failure reason
  static async updateWithFailure(whatsappMessageId, failureReason) {
    try {
      const query = `
        UPDATE messages
        SET message_status = 'failed', failure_reason = $1, failed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE whatsapp_message_id = $2
        RETURNING *
      `;
      const result = await pool.query(query, [
        failureReason,
        whatsappMessageId,
      ]);
      return result.rows.length > 0 ? new Message(result.rows[0]) : null;
    } catch (error) {
      console.error("Error updating message with failure:", error);
      throw error;
    }
  }

  // Update interaction data for interactive messages
  static async updateInteractionData(whatsappMessageId, interactionData) {
    try {
      const query = `
        UPDATE messages
        SET interaction_data = $1, updated_at = CURRENT_TIMESTAMP
        WHERE whatsapp_message_id = $2
        RETURNING *
      `;
      const result = await pool.query(query, [
        JSON.stringify(interactionData),
        whatsappMessageId,
      ]);
      return result.rows.length > 0 ? new Message(result.rows[0]) : null;
    } catch (error) {
      console.error("Error updating message interaction data:", error);
      throw error;
    }
  }

  // Get messages by campaign ID
  static async getByCampaignId(campaignId, limit = 100, offset = 0) {
    try {
      const query = `
        SELECT * FROM messages
        WHERE campaign_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const result = await pool.query(query, [campaignId, limit, offset]);
      return result.rows.map((row) => new Message(row));
    } catch (error) {
      console.error("Error getting messages by campaign:", error);
      throw error;
    }
  }

  // Get conversation between organization and phone number
  static async getConversation(
    organizationId,
    phoneNumber,
    limit = 50,
    offset = 0
  ) {
    try {
      const query = `
        SELECT * FROM messages
        WHERE organization_id = $1
        AND (from_number = $2 OR to_number = $2)
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
      `;
      const result = await pool.query(query, [
        organizationId,
        phoneNumber,
        limit,
        offset,
      ]);
      return result.rows.map((row) => new Message(row));
    } catch (error) {
      console.error("Error getting conversation:", error);
      throw error;
    }
  }

  // Get incoming messages for processing
  static async getIncomingMessages(organizationId, limit = 100) {
    try {
      const query = `
        SELECT * FROM messages
        WHERE organization_id = $1
        AND is_incoming = true
        ORDER BY created_at DESC
        LIMIT $2
      `;
      const result = await pool.query(query, [organizationId, limit]);
      return result.rows.map((row) => new Message(row));
    } catch (error) {
      console.error("Error getting incoming messages:", error);
      throw error;
    }
  }

  // Get interactive messages that need response tracking
  static async getInteractiveMessages(organizationId, limit = 100) {
    try {
      const query = `
        SELECT * FROM messages
        WHERE organization_id = $1
        AND template_name IS NOT NULL
        AND interaction_data IS NOT NULL
        ORDER BY created_at DESC
        LIMIT $2
      `;
      const result = await pool.query(query, [organizationId, limit]);
      return result.rows.map((row) => new Message(row));
    } catch (error) {
      console.error("Error getting interactive messages:", error);
      throw error;
    }
  }
}

module.exports = Message;
