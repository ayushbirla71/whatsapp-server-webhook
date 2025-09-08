const crypto = require("crypto");
const Message = require("./models/Message");
const CampaignAudience = require("./models/CampaignAudience");
const WebhookEvent = require("./models/WebhookEvent");
const Organization = require("./models/Organization");
const { logger, errorHandler } = require("./utils/logger");
const { config } = require("./config/config");

// This Lambda function now uses organization-specific webhook configuration
// stored in the organizations table instead of environment variables

/**
 * AWS Lambda handler for WhatsApp webhook events
 */
exports.handler = async (event, context) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    // Handle different HTTP methods
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;

    if (httpMethod === "GET") {
      return handleVerification(event);
    } else if (httpMethod === "POST") {
      return await handleWebhook(event);
    } else {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }
  } catch (error) {
    console.error("Lambda handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

/**
 * Handle WhatsApp webhook verification (GET request)
 */
async function handleVerification(event) {
  const queryParams = event.queryStringParameters || {};
  const mode = queryParams["hub.mode"];
  const token = queryParams["hub.verify_token"];
  const challenge = queryParams["hub.challenge"];

  console.log("Verification request:", { mode, token, challenge });

  if (mode === "subscribe" && token) {
    try {
      // Find organization by webhook verify token
      const organization = await Organization.findByWebhookVerifyToken(token);

      if (organization && organization.hasCompleteWhatsAppConfig()) {
        console.log(
          "Webhook verified successfully for organization:",
          organization.name
        );
        return {
          statusCode: 200,
          body: challenge,
        };
      } else {
        console.log(
          "Webhook verification failed - organization not found or incomplete config"
        );
        return {
          statusCode: 403,
          body: JSON.stringify({
            error:
              "Verification failed - invalid token or incomplete configuration",
          }),
        };
      }
    } catch (error) {
      console.error("Error during webhook verification:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Internal server error during verification",
        }),
      };
    }
  } else {
    console.log("Webhook verification failed - invalid mode or missing token");
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Verification failed - invalid request" }),
    };
  }
}

/**
 * Handle WhatsApp webhook events (POST request)
 */
async function handleWebhook(event) {
  let organization = null;

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    console.log("Webhook payload:", JSON.stringify(body, null, 2));

    // Extract organization information from webhook payload
    const orgInfo = Organization.extractOrganizationFromWebhook(body);

    if (orgInfo) {
      // Find organization by business account ID or phone number ID
      if (orgInfo.businessAccountId) {
        organization = await Organization.findByWhatsAppBusinessAccountId(
          orgInfo.businessAccountId
        );
      } else if (orgInfo.phoneNumberId) {
        organization = await Organization.findByWhatsAppPhoneNumberId(
          orgInfo.phoneNumberId
        );
      }
    }

    if (!organization) {
      console.log("Organization not found for webhook payload");
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Organization not found or not configured",
        }),
      };
    }

    console.log("Processing webhook for organization:", organization.name);

    // Verify webhook signature using organization's secret
    const signature =
      event.headers["x-hub-signature-256"] ||
      event.headers["X-Hub-Signature-256"];
    const webhookSecret = organization.getWebhookSecret();

    if (webhookSecret && webhookSecret !== "default_secret") {
      if (!verifyWebhookSignature(event.body, signature, webhookSecret)) {
        console.log(
          "Webhook signature verification failed for organization:",
          organization.name
        );
        return {
          statusCode: 403,
          body: JSON.stringify({ error: "Invalid signature" }),
        };
      }
    }

    // Process webhook entries with organization context
    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        await processWebhookEntry(entry, organization);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "success",
        organization: organization.name,
      }),
    };
  } catch (error) {
    console.error("Error handling webhook:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process webhook",
        message: error.message,
        organization: organization ? organization.name : "unknown",
      }),
    };
  }
}

/**
 * Process individual webhook entry
 */
async function processWebhookEntry(entry, organization) {
  console.log("Processing entry:", JSON.stringify(entry, null, 2));

  // Handle changes array
  if (entry.changes && Array.isArray(entry.changes)) {
    for (const change of entry.changes) {
      await processWebhookChange(change, organization);
    }
  }
}

/**
 * Process individual webhook change
 */
async function processWebhookChange(change, organization) {
  console.log("Processing change:", JSON.stringify(change, null, 2));

  const { field, value } = change;

  if (field === "messages") {
    // Handle message-related events
    if (value.statuses && Array.isArray(value.statuses)) {
      // Handle message status updates
      for (const status of value.statuses) {
        await handleMessageStatus(status, change, organization);
      }
    }

    if (value.messages && Array.isArray(value.messages)) {
      // Handle incoming messages (if needed)
      for (const message of value.messages) {
        await handleIncomingMessage(message, change, organization);
      }
    }
  }
}

/**
 * Handle message status updates (sent, delivered, read, failed)
 */
async function handleMessageStatus(status, originalChange, organization) {
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
      timestamp: timestamp ? new Date(parseInt(timestamp) * 1000) : new Date(),
      rawPayload: originalChange,
    });

    console.log("Created webhook event:", webhookEvent.id);

    // Update both Message and CampaignAudience tables
    let messageUpdated = false;
    let campaignAudienceUpdated = false;
    const statusTimestamp = timestamp
      ? new Date(parseInt(timestamp) * 1000)
      : new Date();

    if (messageStatus === "failed" && errors && errors.length > 0) {
      // Handle failed message
      const failureReason = errors
        .map((err) => `${err.code}: ${err.title} - ${err.message || ""}`)
        .join("; ");

      // Update Message table
      const updatedMessage = await Message.updateWithFailure(
        whatsappMessageId,
        failureReason
      );
      if (updatedMessage) {
        messageUpdated = true;
        console.log(
          `Updated message ${whatsappMessageId} status to failed: ${failureReason}`
        );
      }

      // Update CampaignAudience table
      const updatedCampaignAudience = await CampaignAudience.updateWithFailure(
        whatsappMessageId,
        failureReason
      );
      if (updatedCampaignAudience) {
        campaignAudienceUpdated = true;
        console.log(
          `Updated campaign audience ${whatsappMessageId} status to failed`
        );
      }
    } else {
      // Handle successful status updates

      // Update Message table
      const updatedMessage = await Message.updateStatus(
        whatsappMessageId,
        messageStatus,
        statusTimestamp
      );
      if (updatedMessage) {
        messageUpdated = true;
        console.log(
          `Updated message ${whatsappMessageId} status to ${messageStatus}`
        );
      }

      // Update CampaignAudience table
      const updatedCampaignAudience = await CampaignAudience.updateStatus(
        whatsappMessageId,
        messageStatus,
        statusTimestamp
      );
      if (updatedCampaignAudience) {
        campaignAudienceUpdated = true;
        console.log(
          `Updated campaign audience ${whatsappMessageId} status to ${messageStatus}`
        );
      }
    }

    // Log if message was not found in either table
    if (!messageUpdated && !campaignAudienceUpdated) {
      console.log(`Message ${whatsappMessageId} not found in any table`);
    }

    // Mark webhook event as processed
    await WebhookEvent.markAsProcessed(webhookEvent.id);
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
 * Handle incoming messages (optional - for logging/tracking)
 */
async function handleIncomingMessage(message, originalChange, organization) {
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
    } = message;

    // Extract message content based on type
    let content = "";
    let mediaUrl = null;
    let mediaType = null;
    let interactionData = null;

    switch (type) {
      case "text":
        content = text?.body || "";
        break;
      case "image":
        content = image?.caption || "Image message";
        mediaUrl = image?.id;
        mediaType = image?.mime_type;
        break;
      case "interactive":
        // Handle interactive message responses (buttons, lists, etc.)
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
          };
        }
        break;
      default:
        content = `${type} message`;
    }

    // Create webhook event record for incoming message
    const webhookEvent = await WebhookEvent.create({
      organizationId: organization.id,
      eventType: "message_received",
      whatsappMessageId: whatsappMessageId,
      status: "received",
      timestamp: timestamp ? new Date(parseInt(timestamp) * 1000) : new Date(),
      rawPayload: originalChange,
    });

    console.log("Created webhook event for incoming message:", webhookEvent.id);

    // TODO: Call external function to process incoming message
    console.log(`Received ${type} message from ${from}: ${content}`);

    if (interactionData) {
      console.log("Interactive response data:", interactionData);
      // TODO: Handle interactive responses - update tracking, trigger next template
    }

    if (context?.id) {
      console.log(`Message is a reply to: ${context.id}`);
      // TODO: Link this response to the original campaign message
    }

    // Mark as processed
    await WebhookEvent.markAsProcessed(webhookEvent.id);

    return {
      success: true,
      webhookEventId: webhookEvent.id,
      messageType: type,
      from: from,
      content: content,
      interactionData: interactionData,
    };
  } catch (error) {
    console.error("Error handling incoming message:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify webhook signature using HMAC SHA256
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex");

    const receivedSignature = signature.replace("sha256=", "");

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(receivedSignature, "hex")
    );
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
}
