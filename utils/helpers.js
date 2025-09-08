/**
 * Utility functions for WhatsApp webhook processing
 */

/**
 * Parse WhatsApp timestamp to JavaScript Date
 */
function parseWhatsAppTimestamp(timestamp) {
  if (!timestamp) return new Date();
  
  // WhatsApp timestamps are in seconds, JavaScript expects milliseconds
  return new Date(parseInt(timestamp) * 1000);
}

/**
 * Validate WhatsApp webhook payload structure
 */
function validateWebhookPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid payload format' };
  }

  if (!payload.entry || !Array.isArray(payload.entry)) {
    return { valid: false, error: 'Missing or invalid entry array' };
  }

  return { valid: true };
}

/**
 * Extract phone number from WhatsApp ID
 */
function extractPhoneNumber(whatsappId) {
  if (!whatsappId) return null;
  
  // WhatsApp IDs are typically in format: phone_number@c.us
  return whatsappId.split('@')[0];
}

/**
 * Format error message from WhatsApp error object
 */
function formatWhatsAppError(error) {
  if (!error) return 'Unknown error';
  
  const parts = [];
  
  if (error.code) parts.push(`Code: ${error.code}`);
  if (error.title) parts.push(`Title: ${error.title}`);
  if (error.message) parts.push(`Message: ${error.message}`);
  if (error.error_data && error.error_data.details) {
    parts.push(`Details: ${error.error_data.details}`);
  }
  
  return parts.length > 0 ? parts.join(' | ') : 'Unknown error';
}

/**
 * Check if message status is a final status
 */
function isFinalMessageStatus(status) {
  const finalStatuses = ['delivered', 'read', 'failed'];
  return finalStatuses.includes(status);
}

/**
 * Get message type from WhatsApp message object
 */
function getMessageType(message) {
  if (!message) return 'unknown';
  
  const messageTypes = [
    'text', 'image', 'video', 'audio', 'document', 
    'location', 'contacts', 'sticker', 'template'
  ];
  
  for (const type of messageTypes) {
    if (message[type]) return type;
  }
  
  return message.type || 'unknown';
}

/**
 * Extract media information from WhatsApp message
 */
function extractMediaInfo(message, messageType) {
  if (!message || !message[messageType]) return null;
  
  const media = message[messageType];
  
  return {
    id: media.id,
    mimeType: media.mime_type,
    sha256: media.sha256,
    size: media.file_size,
    caption: media.caption,
    filename: media.filename
  };
}

/**
 * Sanitize and validate phone number
 */
function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Basic validation - should be at least 10 digits
  if (cleaned.length < 10) return null;
  
  return cleaned;
}

/**
 * Create a standardized response object
 */
function createResponse(statusCode, data, error = null) {
  const response = {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    }
  };

  if (error) {
    response.body = JSON.stringify({
      success: false,
      error: error,
      timestamp: new Date().toISOString()
    });
  } else {
    response.body = JSON.stringify({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  }

  return response;
}

/**
 * Log webhook event with structured format
 */
function logWebhookEvent(eventType, data, level = 'info') {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    eventType: eventType,
    data: data
  };

  if (level === 'error') {
    console.error(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

module.exports = {
  parseWhatsAppTimestamp,
  validateWebhookPayload,
  extractPhoneNumber,
  formatWhatsAppError,
  isFinalMessageStatus,
  getMessageType,
  extractMediaInfo,
  sanitizePhoneNumber,
  createResponse,
  logWebhookEvent,
  retryWithBackoff
};
