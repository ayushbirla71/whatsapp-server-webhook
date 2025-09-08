const Message = require('../models/Message');
const WebhookEvent = require('../models/WebhookEvent');

/**
 * Handle different types of WhatsApp webhook events
 */
class WebhookHandlers {
  
  /**
   * Handle message status updates (sent, delivered, read, failed)
   */
  static async handleMessageStatus(statusData, rawPayload) {
    try {
      console.log('Processing message status:', JSON.stringify(statusData, null, 2));

      const { 
        id: whatsappMessageId, 
        status, 
        timestamp, 
        recipient_id,
        errors,
        conversation,
        pricing
      } = statusData;

      // Create webhook event record
      const webhookEvent = await WebhookEvent.create({
        eventType: 'message_status',
        whatsappMessageId: whatsappMessageId,
        status: status,
        timestamp: timestamp ? new Date(parseInt(timestamp) * 1000) : new Date(),
        rawPayload: rawPayload
      });

      let updatedMessage = null;

      switch (status) {
        case 'sent':
          updatedMessage = await Message.updateStatus(whatsappMessageId, 'sent');
          console.log(`Message ${whatsappMessageId} marked as sent`);
          break;

        case 'delivered':
          const deliveredAt = timestamp ? new Date(parseInt(timestamp) * 1000) : new Date();
          updatedMessage = await Message.updateStatus(whatsappMessageId, 'delivered', deliveredAt);
          console.log(`Message ${whatsappMessageId} marked as delivered at ${deliveredAt}`);
          break;

        case 'read':
          const readAt = timestamp ? new Date(parseInt(timestamp) * 1000) : new Date();
          updatedMessage = await Message.updateStatus(whatsappMessageId, 'read', readAt);
          console.log(`Message ${whatsappMessageId} marked as read at ${readAt}`);
          break;

        case 'failed':
          let failureReason = 'Unknown error';
          if (errors && errors.length > 0) {
            failureReason = errors.map(err => `${err.code}: ${err.title} - ${err.message || ''}`).join('; ');
          }
          updatedMessage = await Message.updateWithFailure(whatsappMessageId, failureReason);
          console.log(`Message ${whatsappMessageId} marked as failed: ${failureReason}`);
          break;

        default:
          console.log(`Unknown message status: ${status} for message ${whatsappMessageId}`);
      }

      // Mark webhook event as processed
      await WebhookEvent.markAsProcessed(webhookEvent.id);

      return {
        success: true,
        webhookEventId: webhookEvent.id,
        messageUpdated: !!updatedMessage,
        status: status
      };

    } catch (error) {
      console.error('Error handling message status:', error);
      throw error;
    }
  }

  /**
   * Handle incoming messages
   */
  static async handleIncomingMessage(messageData, rawPayload) {
    try {
      console.log('Processing incoming message:', JSON.stringify(messageData, null, 2));

      const {
        id: whatsappMessageId,
        from,
        timestamp,
        type,
        text,
        image,
        video,
        audio,
        document,
        location,
        contacts,
        context
      } = messageData;

      // Create webhook event record
      const webhookEvent = await WebhookEvent.create({
        eventType: 'message_received',
        whatsappMessageId: whatsappMessageId,
        status: 'received',
        timestamp: timestamp ? new Date(parseInt(timestamp) * 1000) : new Date(),
        rawPayload: rawPayload
      });

      // Extract message content based on type
      let content = '';
      let mediaUrl = null;
      let mediaType = null;

      switch (type) {
        case 'text':
          content = text?.body || '';
          break;
        case 'image':
          content = image?.caption || 'Image message';
          mediaUrl = image?.id; // WhatsApp media ID
          mediaType = image?.mime_type;
          break;
        case 'video':
          content = video?.caption || 'Video message';
          mediaUrl = video?.id;
          mediaType = video?.mime_type;
          break;
        case 'audio':
          content = 'Audio message';
          mediaUrl = audio?.id;
          mediaType = audio?.mime_type;
          break;
        case 'document':
          content = document?.caption || document?.filename || 'Document';
          mediaUrl = document?.id;
          mediaType = document?.mime_type;
          break;
        case 'location':
          content = `Location: ${location?.latitude}, ${location?.longitude}`;
          break;
        case 'contacts':
          content = `Contact: ${contacts?.[0]?.name?.formatted_name || 'Contact shared'}`;
          break;
        default:
          content = `${type} message`;
      }

      console.log(`Received ${type} message from ${from}: ${content}`);

      // Mark webhook event as processed
      await WebhookEvent.markAsProcessed(webhookEvent.id);

      return {
        success: true,
        webhookEventId: webhookEvent.id,
        messageType: type,
        from: from,
        content: content
      };

    } catch (error) {
      console.error('Error handling incoming message:', error);
      throw error;
    }
  }

  /**
   * Handle user status changes (typing, online, etc.)
   */
  static async handleUserStatus(statusData, rawPayload) {
    try {
      console.log('Processing user status:', JSON.stringify(statusData, null, 2));

      // Create webhook event record
      const webhookEvent = await WebhookEvent.create({
        eventType: 'user_status',
        whatsappMessageId: null,
        status: statusData.status || 'unknown',
        timestamp: new Date(),
        rawPayload: rawPayload
      });

      // Mark as processed immediately since we're just logging
      await WebhookEvent.markAsProcessed(webhookEvent.id);

      return {
        success: true,
        webhookEventId: webhookEvent.id,
        status: statusData.status
      };

    } catch (error) {
      console.error('Error handling user status:', error);
      throw error;
    }
  }

  /**
   * Handle webhook errors
   */
  static async handleWebhookError(errorData, rawPayload) {
    try {
      console.log('Processing webhook error:', JSON.stringify(errorData, null, 2));

      // Create webhook event record
      const webhookEvent = await WebhookEvent.create({
        eventType: 'error',
        whatsappMessageId: null,
        status: 'error',
        timestamp: new Date(),
        rawPayload: rawPayload
      });

      // Mark as processed with error message
      const errorMessage = errorData.message || errorData.error_data?.details || 'Unknown webhook error';
      await WebhookEvent.markAsProcessed(webhookEvent.id, errorMessage);

      return {
        success: true,
        webhookEventId: webhookEvent.id,
        error: errorMessage
      };

    } catch (error) {
      console.error('Error handling webhook error:', error);
      throw error;
    }
  }
}

module.exports = WebhookHandlers;
