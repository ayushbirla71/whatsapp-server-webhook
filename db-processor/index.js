const Message = require("./models/Message");
const CampaignAudience = require("./models/CampaignAudience");
const WebhookEvent = require("./models/WebhookEvent");
const Organization = require("./models/Organization");
const IncomingMessage = require("./models/IncomingMessage");

/**
 * AWS Lambda handler for processing WhatsApp webhook events from SQS
 * This function handles all database operations
 */
exports.handler = async (event, context) => {
  console.log("Received SQS event:", JSON.stringify(event, null, 2));

  const results = [];

  try {
    // Process each SQS record
    for (const record of event.Records) {
      try {
        const result = await processSQSRecord(record);
        results.push(result);
      } catch (error) {
        console.error("Error processing SQS record:", error);
        results.push({
          success: false,
          messageId: record.messageId,
          error: error.message,
        });
        // Don't throw here - continue processing other records
      }
    }

    console.log("Processing completed:", results);
    return {
      statusCode: 200,
      processedRecords: results.length,
      successfulRecords: results.filter((r) => r.success).length,
      failedRecords: results.filter((r) => !r.success).length,
      results: results,
    };
  } catch (error) {
    console.error("Lambda handler error:", error);
    throw error; // This will cause SQS to retry the entire batch
  }
};

/**
 * Process individual SQS record
 */
async function processSQSRecord(record) {
  const messageId = record.messageId;
  console.log(`Processing SQS record: ${messageId}`);

  try {
    // Parse the message body
    const messageBody = JSON.parse(record.body);
    const { webhookPayload, metadata, receivedAt } = messageBody;

    console.log(
      "Webhook payload from SQS:",
      JSON.stringify(webhookPayload, null, 2)
    );

    // Find organization based on webhook payload
    const organization = await findOrganizationFromWebhook(webhookPayload);

    if (!organization) {
      console.log("Organization not found for webhook payload");
      return {
        success: false,
        messageId: messageId,
        error: "Organization not found",
        webhookPayload: webhookPayload,
      };
    }

    console.log("Processing webhook for organization:", organization.name);

    // Process webhook entries
    const processingResults = [];
    if (webhookPayload.entry && Array.isArray(webhookPayload.entry)) {
      for (const entry of webhookPayload.entry) {
        const entryResult = await processWebhookEntry(
          entry,
          organization,
          receivedAt
        );
        processingResults.push(entryResult);
      }
    }

    return {
      success: true,
      messageId: messageId,
      organizationId: organization.id,
      organizationName: organization.name,
      processingResults: processingResults,
    };
  } catch (error) {
    console.error(`Error processing SQS record ${messageId}:`, error);
    return {
      success: false,
      messageId: messageId,
      error: error.message,
    };
  }
}

/**
 * Find organization from webhook payload
 */
async function findOrganizationFromWebhook(webhookPayload) {
  try {
    if (webhookPayload.entry && webhookPayload.entry.length > 0) {
      const entry = webhookPayload.entry[0];

      // Try to find by business account ID
      if (entry.id) {
        const org = await Organization.findByWhatsAppBusinessAccountId(
          entry.id
        );
        if (org) return org;
      }

      // Try to find by phone number ID
      if (entry.changes && entry.changes.length > 0) {
        const change = entry.changes[0];
        if (
          change.value &&
          change.value.metadata &&
          change.value.metadata.phone_number_id
        ) {
          const org = await Organization.findByWhatsAppPhoneNumberId(
            change.value.metadata.phone_number_id
          );
          if (org) return org;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding organization from webhook:", error);
    return null;
  }
}

/**
 * Process individual webhook entry
 */
async function processWebhookEntry(entry, organization, receivedAt) {
  console.log("Processing entry:", JSON.stringify(entry, null, 2));

  const results = [];

  // Handle changes array
  if (entry.changes && Array.isArray(entry.changes)) {
    for (const change of entry.changes) {
      const changeResult = await processWebhookChange(
        change,
        organization,
        receivedAt
      );
      results.push(changeResult);
    }
  }

  return {
    entryId: entry.id,
    results: results,
  };
}

/**
 * Process individual webhook change
 */
async function processWebhookChange(change, organization, receivedAt) {
  console.log("Processing change:", JSON.stringify(change, null, 2));

  const { field, value } = change;
  const results = [];

  if (field === "messages") {
    // Handle message status updates
    if (value.statuses && Array.isArray(value.statuses)) {
      for (const status of value.statuses) {
        try {
          const statusResult = await handleMessageStatus(
            status,
            change,
            organization,
            receivedAt
          );
          results.push({
            type: "status_update",
            success: true,
            result: statusResult,
          });
        } catch (error) {
          console.error("Error handling message status:", error);
          results.push({
            type: "status_update",
            success: false,
            error: error.message,
          });
        }
      }
    }

    // Handle incoming messages
    if (value.messages && Array.isArray(value.messages)) {
      for (const message of value.messages) {
        try {
          const messageResult = await handleIncomingMessage(
            message,
            change,
            organization,
            receivedAt
          );
          results.push({
            type: "incoming_message",
            success: true,
            result: messageResult,
          });
        } catch (error) {
          console.error("Error handling incoming message:", error);
          results.push({
            type: "incoming_message",
            success: false,
            error: error.message,
          });
        }
      }
    }
  }

  return {
    field: field,
    results: results,
  };
}

/**
 * Handle message status updates (sent, delivered, read, failed)
 */
async function handleMessageStatus(
  status,
  originalChange,
  organization,
  receivedAt
) {
  let webhookEvent = null;

  try {
    console.log("Handling message status:", JSON.stringify(status, null, 2));

    const {
      id: whatsappMessageId,
      status: messageStatus,
      timestamp,
      errors,
    } = status;

    // Create webhook event record with organization context
    webhookEvent = await WebhookEvent.create({
      organizationId: organization.id,
      eventType: "message_status",
      whatsappMessageId: whatsappMessageId,
      status: messageStatus,
      timestamp: timestamp
        ? new Date(parseInt(timestamp) * 1000)
        : new Date(receivedAt),
      rawPayload: originalChange,
    });

    console.log("Created webhook event:", webhookEvent.id);

    // Convert timestamp
    const statusTimestamp = timestamp
      ? new Date(parseInt(timestamp) * 1000)
      : new Date(receivedAt);

    // Update Message table
    let updatedMessage = null;
    try {
      updatedMessage = await Message.updateStatus(
        whatsappMessageId,
        messageStatus,
        statusTimestamp
      );
      console.log("Updated message status:", updatedMessage?.id || "not found");
    } catch (error) {
      console.error("Error updating message status:", error);
    }

    // Update CampaignAudience table
    let updatedCampaignAudience = null;
    try {
      if (errors && errors.length > 0) {
        updatedCampaignAudience = await CampaignAudience.updateWithFailure(
          whatsappMessageId,
          messageStatus,
          statusTimestamp,
          errors[0]
        );
      } else {
        updatedCampaignAudience = await CampaignAudience.updateStatus(
          whatsappMessageId,
          messageStatus,
          statusTimestamp
        );
      }
      console.log(
        "Updated campaign audience:",
        updatedCampaignAudience?.id || "not found"
      );
    } catch (error) {
      console.error("Error updating campaign audience:", error);
    }

    // Mark webhook event as processed
    await WebhookEvent.markAsProcessed(webhookEvent.id);

    return {
      webhookEventId: webhookEvent.id,
      messageUpdated: !!updatedMessage,
      campaignAudienceUpdated: !!updatedCampaignAudience,
      status: messageStatus,
      whatsappMessageId: whatsappMessageId,
    };
  } catch (error) {
    console.error("Error handling message status:", error);

    // Try to mark webhook event as processed with error
    try {
      if (webhookEvent && webhookEvent.id) {
        await WebhookEvent.markAsProcessed(webhookEvent.id, error.message);
      }
    } catch (markError) {
      console.error("Error marking webhook event as processed:", markError);
    }

    throw error;
  }
}

/**
 * Handle incoming messages
 */
async function handleIncomingMessage(
  message,
  originalChange,
  organization,
  receivedAt
) {
  let webhookEvent = null;
  let incomingMessage = null;

  try {
    console.log("Handling incoming message:", JSON.stringify(message, null, 2));

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
      interactive,
      context,
      button,
    } = message;

    // Check for duplicate message
    const isDuplicate = await IncomingMessage.isDuplicate(whatsappMessageId);
    if (isDuplicate) {
      console.log(
        "Duplicate incoming message detected, skipping:",
        whatsappMessageId
      );
      return { success: true, duplicate: true };
    }

    // Extract phone numbers from the change metadata
    const metadata = originalChange.value?.metadata;
    const toPhoneNumber =
      metadata?.phone_number_id || metadata?.display_phone_number;

    // Extract message content based on type
    let content = "";
    let mediaUrl = null;
    let mediaType = null;
    let mediaSize = null;
    let interactionData = null;

    switch (type) {
      case "text":
        content = text?.body || "";
        break;
      case "image":
        content = image?.caption || "Image message";
        mediaUrl = image?.id;
        mediaType = image?.mime_type;
        mediaSize = image?.file_size;
        break;
      case "video":
        content = video?.caption || "Video message";
        mediaUrl = video?.id;
        mediaType = video?.mime_type;
        mediaSize = video?.file_size;
        break;
      case "audio":
        content = "Audio message";
        mediaUrl = audio?.id;
        mediaType = audio?.mime_type;
        mediaSize = audio?.file_size;
        break;
      case "document":
        content = document?.caption || document?.filename || "Document message";
        mediaUrl = document?.id;
        mediaType = document?.mime_type;
        mediaSize = document?.file_size;
        break;
      case "location":
        content = `Location: ${location?.latitude}, ${location?.longitude}`;
        if (location?.name) content += ` (${location.name})`;
        break;
      case "contacts":
        content = `Contact: ${
          contacts?.[0]?.name?.formatted_name || "Contact shared"
        }`;
        break;
      case "interactive":
        if (interactive?.type === "button_reply") {
          content = `Button: ${interactive.button_reply.title}`;
          interactionData = {
            type: "button_reply",
            button_id: interactive.button_reply.id,
            button_title: interactive.button_reply.title,
          };
        } else if (interactive?.type === "list_reply") {
          content = `List: ${interactive.list_reply.title}`;
          interactionData = {
            type: "list_reply",
            list_id: interactive.list_reply.id,
            list_title: interactive.list_reply.title,
            list_description: interactive.list_reply.description,
          };
        }
        break;

      case "button":
        content = `Button: ${interactive.button_reply.title}`;

        interactionData = {
          type: "button_reply",
          button_id: button.payload,
          button_title: button.text,
        };
        break;

      default:
        content = `${type} message`;
    }

    // Try to find the original campaign message if this is a reply
    let contextCampaignId = null;
    let contextMessageId = null;

    if (context?.id) {
      console.log(`Message is a reply to: ${context.id}`);
      try {
        const originalMessage = await Message.findByWhatsAppId(context.id);
        if (originalMessage) {
          contextCampaignId = originalMessage.campaignId;
          contextMessageId = context.id;
          console.log(`Linked reply to campaign: ${contextCampaignId}`);
        }
      } catch (error) {
        console.error("Error finding original message:", error);
      }
    }

    // Create incoming message record
    incomingMessage = await IncomingMessage.create({
      organizationId: organization.id,
      whatsappMessageId: whatsappMessageId,
      fromPhoneNumber: from,
      toPhoneNumber: toPhoneNumber,
      messageType: type,
      content: content,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
      mediaSize: mediaSize,
      timestamp: timestamp
        ? new Date(parseInt(timestamp) * 1000)
        : new Date(receivedAt),
      interactiveType: interactionData?.type || null,
      interactiveData: interactionData,
      contextMessageId: contextMessageId,
      contextCampaignId: contextCampaignId,
      rawPayload: message,
    });

    console.log("Created incoming message record:", incomingMessage.id);

    // Create webhook event record
    webhookEvent = await WebhookEvent.create({
      organizationId: organization.id,
      campaignId: contextCampaignId,
      eventType: "message_received",
      whatsappMessageId: whatsappMessageId,
      fromPhoneNumber: from,
      toPhoneNumber: toPhoneNumber,
      status: "received",
      timestamp: timestamp
        ? new Date(parseInt(timestamp) * 1000)
        : new Date(receivedAt),
      interactiveType: interactionData?.type || null,
      interactiveData: interactionData,
      rawPayload: originalChange,
    });

    console.log("Created webhook event for incoming message:", webhookEvent.id);

    // Mark incoming message as processed
    await IncomingMessage.markAsProcessed(incomingMessage.id);

    // Mark webhook event as processed
    await WebhookEvent.markAsProcessed(webhookEvent.id);

    // TODO: Call external function to process incoming message

    return {
      incomingMessageId: incomingMessage.id,
      webhookEventId: webhookEvent.id,
      messageType: type,
      from: from,
      content: content,
      interactionData: interactionData,
      contextCampaignId: contextCampaignId,
    };
  } catch (error) {
    console.error("Error handling incoming message:", error);

    // Try to mark webhook event as processed with error
    try {
      if (webhookEvent && webhookEvent.id) {
        await WebhookEvent.markAsProcessed(webhookEvent.id, error.message);
      }
    } catch (markError) {
      console.error("Error marking webhook event as processed:", markError);
    }

    throw error;
  }
}
