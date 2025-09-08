const pool = require("../db/connection");

class WebhookEvent {
  constructor(data) {
    this.id = data.id;
    this.organizationId = data.organization_id;
    this.campaignId = data.campaign_id;
    this.campaignAudienceId = data.campaign_audience_id;
    this.messageId = data.message_id;
    this.eventType = data.event_type;
    this.whatsappMessageId = data.whatsapp_message_id;
    this.fromPhoneNumber = data.from_phone_number;
    this.toPhoneNumber = data.to_phone_number;
    this.status = data.status;
    this.timestamp = data.timestamp;
    this.rawPayload = data.raw_payload;
    this.processed = data.processed;
    this.errorMessage = data.error_message;
    this.interactiveType = data.interactive_type;
    this.interactiveData = data.interactive_data;
    this.createdAt = data.created_at;
  }

  // Create new webhook event
  static async create(eventData) {
    try {
      const query = `
        INSERT INTO webhook_events (
          organization_id, campaign_id, campaign_audience_id, event_type,
          whatsapp_message_id, from_phone_number, to_phone_number, status,
          timestamp, raw_payload, interactive_type, interactive_data, processed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
      const params = [
        eventData.organizationId || null,
        eventData.campaignId || null,
        eventData.campaignAudienceId || null,
        eventData.eventType,
        eventData.whatsappMessageId,
        eventData.fromPhoneNumber || null,
        eventData.toPhoneNumber || null,
        eventData.status,
        eventData.timestamp || new Date(),
        JSON.stringify(eventData.rawPayload),
        eventData.interactiveType || null,
        eventData.interactiveData
          ? JSON.stringify(eventData.interactiveData)
          : null,
        false,
      ];

      const result = await pool.query(query, params);
      return new WebhookEvent(result.rows[0]);
    } catch (error) {
      console.error("Error creating webhook event:", error);
      throw error;
    }
  }

  // Mark webhook event as processed
  static async markAsProcessed(id, errorMessage = null) {
    try {
      const query = `
        UPDATE webhook_events 
        SET processed = true, error_message = $1 
        WHERE id = $2 
        RETURNING *
      `;
      const result = await pool.query(query, [errorMessage, id]);
      return result.rows.length > 0 ? new WebhookEvent(result.rows[0]) : null;
    } catch (error) {
      console.error("Error marking webhook event as processed:", error);
      throw error;
    }
  }

  // Find unprocessed events
  static async findUnprocessed(limit = 100) {
    try {
      const query = `
        SELECT * FROM webhook_events 
        WHERE processed = false 
        ORDER BY created_at ASC 
        LIMIT $1
      `;
      const result = await pool.query(query, [limit]);
      return result.rows.map((row) => new WebhookEvent(row));
    } catch (error) {
      console.error("Error finding unprocessed webhook events:", error);
      throw error;
    }
  }

  // Find events by WhatsApp message ID
  static async findByWhatsAppMessageId(whatsappMessageId) {
    try {
      const query = `
        SELECT * FROM webhook_events 
        WHERE whatsapp_message_id = $1 
        ORDER BY created_at DESC
      `;
      const result = await pool.query(query, [whatsappMessageId]);
      return result.rows.map((row) => new WebhookEvent(row));
    } catch (error) {
      console.error(
        "Error finding webhook events by WhatsApp message ID:",
        error
      );
      throw error;
    }
  }

  // Get events by type
  static async findByEventType(eventType, limit = 100, offset = 0) {
    try {
      const query = `
        SELECT * FROM webhook_events 
        WHERE event_type = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `;
      const result = await pool.query(query, [eventType, limit, offset]);
      return result.rows.map((row) => new WebhookEvent(row));
    } catch (error) {
      console.error("Error finding webhook events by type:", error);
      throw error;
    }
  }

  // Clean up old processed events (for maintenance)
  static async cleanupOldEvents(daysOld = 30) {
    try {
      const query = `
        DELETE FROM webhook_events 
        WHERE processed = true 
        AND created_at < NOW() - INTERVAL '${daysOld} days'
      `;
      const result = await pool.query(query);
      return result.rowCount;
    } catch (error) {
      console.error("Error cleaning up old webhook events:", error);
      throw error;
    }
  }
}

module.exports = WebhookEvent;
