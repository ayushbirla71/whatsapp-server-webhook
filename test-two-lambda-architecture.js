/**
 * Test script for Two-Lambda WhatsApp Webhook Architecture
 * This script tests the complete flow: Webhook Receiver -> SQS -> DB Processor
 */

const AWS = require("aws-sdk");
const crypto = require("crypto");

// Configuration
const config = {
  region: "us-east-1",
  webhookUrl:
    process.env.WEBHOOK_URL || "https://your-api-gateway-url/prod/webhook",
  verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || "unique_verify_token_12345", // Should match database
  webhookSecret: process.env.WEBHOOK_SECRET || "your_webhook_secret",
  sqsQueueUrl:
    process.env.SQS_QUEUE_URL ||
    "https://sqs.us-east-1.amazonaws.com/123456789/whatsapp-webhook-queue-development",
  businessAccountId:
    process.env.BUSINESS_ACCOUNT_ID || "your_business_account_id",
  phoneNumberId: process.env.PHONE_NUMBER_ID || "your_phone_number_id",
};

// Initialize AWS services
const sqs = new AWS.SQS({ region: config.region });
const lambda = new AWS.Lambda({ region: config.region });

/**
 * Test 1: Webhook Verification
 */
async function testWebhookVerification() {
  console.log("\n🧪 Testing Webhook Verification...");

  try {
    const testUrl = `${config.webhookUrl}?hub.mode=subscribe&hub.verify_token=${config.verifyToken}&hub.challenge=test123`;

    const response = await fetch(testUrl, { method: "GET" });
    const responseText = await response.text();

    if (response.status === 200 && responseText === "test123") {
      console.log("✅ Webhook verification test PASSED");
      return true;
    } else {
      console.log(
        `❌ Webhook verification test FAILED: ${response.status} - ${responseText}`
      );
      return false;
    }
  } catch (error) {
    console.log(`❌ Webhook verification test ERROR: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Message Status Update Webhook
 */
async function testMessageStatusWebhook() {
  console.log("\n🧪 Testing Message Status Webhook...");

  const webhookPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: config.businessAccountId,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: config.phoneNumberId,
              },
              statuses: [
                {
                  id: "wamid.test_message_status_123",
                  status: "delivered",
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  recipient_id: "15559876543",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  return await sendWebhookPayload(webhookPayload, "Message Status Update");
}

/**
 * Test 3: Incoming Text Message Webhook
 */
async function testIncomingTextMessage() {
  console.log("\n🧪 Testing Incoming Text Message...");

  const webhookPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: config.businessAccountId,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: config.phoneNumberId,
              },
              messages: [
                {
                  from: "15559876543",
                  id: "wamid.test_incoming_text_456",
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: {
                    body: "Hello, this is a test message!",
                  },
                  type: "text",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  return await sendWebhookPayload(webhookPayload, "Incoming Text Message");
}

/**
 * Test 4: Interactive Button Response
 */
async function testInteractiveButtonResponse() {
  console.log("\n🧪 Testing Interactive Button Response...");

  const webhookPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: config.businessAccountId,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: config.phoneNumberId,
              },
              messages: [
                {
                  from: "15559876543",
                  id: "wamid.test_button_response_789",
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: {
                      id: "btn_yes",
                      title: "Yes, I'm interested",
                    },
                  },
                  context: {
                    id: "wamid.original_campaign_message_123",
                  },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  return await sendWebhookPayload(
    webhookPayload,
    "Interactive Button Response"
  );
}

/**
 * Test 5: Media Message (Image)
 */
async function testMediaMessage() {
  console.log("\n🧪 Testing Media Message (Image)...");

  const webhookPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: config.businessAccountId,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: config.phoneNumberId,
              },
              messages: [
                {
                  from: "15559876543",
                  id: "wamid.test_image_message_101",
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: "image",
                  image: {
                    caption: "Check out this image!",
                    mime_type: "image/jpeg",
                    sha256: "test_sha256_hash",
                    id: "test_media_id_123",
                    file_size: 1024000,
                  },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  return await sendWebhookPayload(webhookPayload, "Media Message (Image)");
}

/**
 * Send webhook payload with signature
 */
async function sendWebhookPayload(payload, testName) {
  try {
    const payloadString = JSON.stringify(payload);

    // Generate signature
    const signature = crypto
      .createHmac("sha256", config.webhookSecret)
      .update(payloadString, "utf8")
      .digest("hex");

    const headers = {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": `sha256=${signature}`,
    };

    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: headers,
      body: payloadString,
    });

    const responseText = await response.text();

    if (response.status === 200) {
      console.log(`✅ ${testName} webhook PASSED`);
      console.log(`   Response: ${responseText}`);
      return true;
    } else {
      console.log(
        `❌ ${testName} webhook FAILED: ${response.status} - ${responseText}`
      );
      return false;
    }
  } catch (error) {
    console.log(`❌ ${testName} webhook ERROR: ${error.message}`);
    return false;
  }
}

/**
 * Test 6: Check SQS Queue
 */
async function testSQSQueue() {
  console.log("\n🧪 Testing SQS Queue...");

  try {
    const params = {
      QueueUrl: config.sqsQueueUrl,
      AttributeNames: ["All"],
    };

    const result = await sqs.getQueueAttributes(params).promise();
    const attributes = result.Attributes;

    console.log("✅ SQS Queue Status:");
    console.log(
      `   Messages Available: ${attributes.ApproximateNumberOfMessages}`
    );
    console.log(
      `   Messages In Flight: ${attributes.ApproximateNumberOfMessagesNotVisible}`
    );
    console.log(
      `   Messages Delayed: ${attributes.ApproximateNumberOfMessagesDelayed}`
    );

    return true;
  } catch (error) {
    console.log(`❌ SQS Queue test ERROR: ${error.message}`);
    return false;
  }
}

/**
 * Test 7: Check Lambda Function Logs
 */
async function checkLambdaLogs(functionName, minutes = 5) {
  console.log(
    `\n🧪 Checking ${functionName} Lambda Logs (last ${minutes} minutes)...`
  );

  try {
    const cloudWatchLogs = new AWS.CloudWatchLogs({ region: config.region });

    const logGroupName = `/aws/lambda/${functionName}`;
    const endTime = Date.now();
    const startTime = endTime - minutes * 60 * 1000;

    const params = {
      logGroupName: logGroupName,
      startTime: startTime,
      endTime: endTime,
      limit: 10,
    };

    const result = await cloudWatchLogs.filterLogEvents(params).promise();

    if (result.events && result.events.length > 0) {
      console.log(
        `✅ Found ${result.events.length} log events for ${functionName}`
      );
      result.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toISOString();
        console.log(
          `   ${index + 1}. [${timestamp}] ${event.message.substring(
            0,
            100
          )}...`
        );
      });
    } else {
      console.log(`⚠️  No recent log events found for ${functionName}`);
    }

    return true;
  } catch (error) {
    console.log(`❌ Lambda logs check ERROR: ${error.message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log("🚀 Starting Two-Lambda Architecture Tests...");
  console.log("Configuration:");
  console.log(`   Webhook URL: ${config.webhookUrl}`);
  console.log(`   SQS Queue: ${config.sqsQueueUrl}`);
  console.log(`   Business Account ID: ${config.businessAccountId}`);
  console.log(`   Phone Number ID: ${config.phoneNumberId}`);

  const results = [];

  // Run tests
  results.push(await testWebhookVerification());
  results.push(await testMessageStatusWebhook());
  results.push(await testIncomingTextMessage());
  results.push(await testInteractiveButtonResponse());
  results.push(await testMediaMessage());

  // Wait a bit for processing
  console.log("\n⏳ Waiting 10 seconds for message processing...");
  await new Promise((resolve) => setTimeout(resolve, 10000));

  results.push(await testSQSQueue());
  results.push(await checkLambdaLogs("whatsapp-webhook-receiver-development"));
  results.push(await checkLambdaLogs("whatsapp-db-processor-development"));

  // Summary
  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log("\n📊 Test Results Summary:");
  console.log(`   Passed: ${passed}/${total}`);
  console.log(`   Success Rate: ${Math.round((passed / total) * 100)}%`);

  if (passed === total) {
    console.log(
      "🎉 All tests PASSED! Your two-Lambda architecture is working correctly."
    );
  } else {
    console.log("⚠️  Some tests failed. Check the logs and configuration.");
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testWebhookVerification,
  testMessageStatusWebhook,
  testIncomingTextMessage,
  testInteractiveButtonResponse,
  testMediaMessage,
  testSQSQueue,
  checkLambdaLogs,
};
