const crypto = require("crypto");
const AWS = require("aws-sdk");
const { Pool } = require("pg");

// Initialize SQS
const sqs = new AWS.SQS({ region: process.env.AWS_REGION || "us-east-1" });

// Initialize database connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME || "whatsapp_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  max: 3, // Maximum 3 connections for webhook receiver
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Fast timeout for webhook response
});

/**
 * AWS Lambda handler for WhatsApp webhook receiver
 * This function only handles webhook verification and forwards payloads to SQS
 */
exports.handler = async (event, context) => {
  console.log("Received webhook event:", JSON.stringify(event, null, 2));

  try {
    // Handle GET request for webhook verification
    if (event.httpMethod === "GET") {
      return await handleWebhookVerification(event);
    }

    // Handle POST request for webhook events
    if (event.httpMethod === "POST") {
      return await handleWebhookEvent(event);
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
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
 * Verifies token against organizations table in database
 */
async function handleWebhookVerification(event) {
  const queryParams = event.queryStringParameters || {};
  const mode = queryParams["hub.mode"];
  const token = queryParams["hub.verify_token"];
  const challenge = queryParams["hub.challenge"];

  console.log("Verification request:", { mode, token, challenge });

  if (mode === "subscribe") {
    try {
      // Verify token against database
      const isValidToken = await verifyWebhookToken(token);

      if (isValidToken) {
        console.log(
          "Webhook verification successful - token found in database"
        );
        return {
          statusCode: 200,
          body: challenge,
        };
      } else {
        console.log(
          "Webhook verification failed - token not found in database"
        );
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: "Verification failed - invalid token",
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
    console.log("Webhook verification failed - invalid mode");
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Verification failed - invalid mode" }),
    };
  }
}

/**
 * Handle WhatsApp webhook events (POST request)
 * Validates signature against database and forwards to SQS
 */
async function handleWebhookEvent(event) {
  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    console.log("Webhook payload received:", JSON.stringify(body, null, 2));

    // Find organization and verify signature
    const organization = await findOrganizationFromWebhook(body);
    if (!organization) {
      console.log("Organization not found for webhook payload");
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Organization not found" }),
      };
    }

    console.log("Processing webhook for organization:", organization.name);

    // Verify webhook signature using organization's secret
    const signature =
      event.headers["x-hub-signature-256"] ||
      event.headers["X-Hub-Signature-256"];

    if (organization.whatsapp_app_secret) {
      if (
        !verifyWebhookSignature(
          event.body,
          signature,
          organization.whatsapp_app_secret
        )
      ) {
        console.log(
          "Webhook signature verification failed for organization:",
          organization.name
        );
        return {
          statusCode: 403,
          body: JSON.stringify({ error: "Invalid signature" }),
        };
      }
      console.log(
        "Webhook signature verified successfully for organization:",
        organization.name
      );
    } else {
      console.log(
        "No webhook secret configured for organization, skipping signature verification"
      );
    }

    // Extract metadata for SQS message attributes
    const metadata = extractWebhookMetadata(body);

    // Send to SQS for processing
    const sqsResult = await sendToSQS(body, metadata, event);

    console.log("Webhook payload sent to SQS:", sqsResult.MessageId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "success",
        messageId: sqsResult.MessageId,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error("Error handling webhook event:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process webhook",
        message: error.message,
      }),
    };
  }
}

/**
 * Send webhook payload to SQS
 */
async function sendToSQS(webhookPayload, metadata, originalEvent) {
  const queueUrl = process.env.SQS_QUEUE_URL;

  if (!queueUrl) {
    throw new Error("SQS_QUEUE_URL environment variable not set");
  }

  const messageBody = {
    webhookPayload: webhookPayload,
    metadata: metadata,
    receivedAt: new Date().toISOString(),
    headers: originalEvent.headers,
    sourceIp: originalEvent.requestContext?.identity?.sourceIp,
  };

  const params = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(messageBody),
    MessageAttributes: {
      eventType: {
        DataType: "String",
        StringValue: metadata.eventType || "unknown",
      },
      businessAccountId: {
        DataType: "String",
        StringValue: metadata.businessAccountId || "unknown",
      },
      phoneNumberId: {
        DataType: "String",
        StringValue: metadata.phoneNumberId || "unknown",
      },
      hasMessages: {
        DataType: "String",
        StringValue: metadata.hasMessages ? "true" : "false",
      },
      hasStatuses: {
        DataType: "String",
        StringValue: metadata.hasStatuses ? "true" : "false",
      },
      timestamp: {
        DataType: "String",
        StringValue: new Date().toISOString(),
      },
    },
  };

  return await sqs.sendMessage(params).promise();
}

/**
 * Extract metadata from webhook payload for SQS message attributes
 */
function extractWebhookMetadata(webhookPayload) {
  const metadata = {
    eventType: "webhook",
    businessAccountId: null,
    phoneNumberId: null,
    hasMessages: false,
    hasStatuses: false,
    messageCount: 0,
    statusCount: 0,
  };

  try {
    if (webhookPayload.entry && Array.isArray(webhookPayload.entry)) {
      for (const entry of webhookPayload.entry) {
        // Extract business account ID
        if (entry.id) {
          metadata.businessAccountId = entry.id;
        }

        // Process changes
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.field === "messages" && change.value) {
              // Extract phone number ID
              if (change.value.metadata?.phone_number_id) {
                metadata.phoneNumberId = change.value.metadata.phone_number_id;
              }

              // Count messages and statuses
              if (
                change.value.messages &&
                Array.isArray(change.value.messages)
              ) {
                metadata.hasMessages = true;
                metadata.messageCount += change.value.messages.length;
              }

              if (
                change.value.statuses &&
                Array.isArray(change.value.statuses)
              ) {
                metadata.hasStatuses = true;
                metadata.statusCount += change.value.statuses.length;
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error extracting webhook metadata:", error);
  }

  return metadata;
}

/**
 * Verify webhook signature using HMAC SHA256
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature) {
    return false;
  }

  try {
    // Remove 'sha256=' prefix if present
    const cleanSignature = signature.replace(/^sha256=/, "");

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex");

    // Compare signatures using timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
}

/**
 * Verify webhook token against organizations table
 */
async function verifyWebhookToken(token) {
  if (!token) {
    return false;
  }

  try {
    const query = `
      SELECT id, name FROM organizations
      WHERE whatsapp_webhook_verify_token = $1 AND status = 'active'
    `;
    const result = await pool.query(query, [token]);

    if (result.rows.length > 0) {
      console.log("Token verified for organization:", result.rows[0].name);
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error verifying webhook token:", error);
    return false;
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
        const org = await findOrganizationByBusinessAccountId(entry.id);
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
          const org = await findOrganizationByPhoneNumberId(
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
 * Find organization by WhatsApp Business Account ID
 */
async function findOrganizationByBusinessAccountId(businessAccountId) {
  try {
    const query = `
      SELECT * FROM organizations
      WHERE whatsapp_business_account_id = $1 AND status = 'active'
    `;
    const result = await pool.query(query, [businessAccountId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error finding organization by business account ID:", error);
    return null;
  }
}

/**
 * Find organization by WhatsApp Phone Number ID
 */
async function findOrganizationByPhoneNumberId(phoneNumberId) {
  try {
    const query = `
      SELECT * FROM organizations
      WHERE whatsapp_phone_number_id = $1 AND status = 'active'
    `;
    const result = await pool.query(query, [phoneNumberId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error finding organization by phone number ID:", error);
    return null;
  }
}
