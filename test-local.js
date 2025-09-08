/**
 * Local testing script for WhatsApp Webhook Lambda
 * Run with: node test-local.js
 */

const { handler } = require('./index');

// Test webhook verification (GET request)
const testVerification = {
  httpMethod: 'GET',
  queryStringParameters: {
    'hub.mode': 'subscribe',
    'hub.verify_token': process.env.WEBHOOK_VERIFY_TOKEN || 'your_verify_token_here',
    'hub.challenge': 'test_challenge_123'
  }
};

// Test message status webhook (POST request)
const testMessageStatus = {
  httpMethod: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'business_account_id',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '1234567890',
            phone_number_id: 'phone_number_id'
          },
          statuses: [{
            id: 'wamid.test_message_id_123',
            status: 'delivered',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            recipient_id: '1234567890',
            conversation: {
              id: 'conversation_id',
              expiration_timestamp: Math.floor(Date.now() / 1000) + 86400
            },
            pricing: {
              billable: true,
              pricing_model: 'CBP',
              category: 'business_initiated'
            }
          }]
        }
      }]
    }]
  })
};

// Test incoming message webhook
const testIncomingMessage = {
  httpMethod: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'business_account_id',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '1234567890',
            phone_number_id: 'phone_number_id'
          },
          messages: [{
            id: 'wamid.incoming_message_123',
            from: '0987654321',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            text: {
              body: 'Hello, this is a test message!'
            }
          }]
        }
      }]
    }]
  })
};

// Test failed message status
const testFailedMessage = {
  httpMethod: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'business_account_id',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '1234567890',
            phone_number_id: 'phone_number_id'
          },
          statuses: [{
            id: 'wamid.failed_message_id_456',
            status: 'failed',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            recipient_id: '1234567890',
            errors: [{
              code: 131000,
              title: 'Recipient phone number not available',
              message: 'Phone number does not have an active WhatsApp account',
              error_data: {
                details: 'The recipient phone number is not registered with WhatsApp'
              }
            }]
          }]
        }
      }]
    }]
  })
};

async function runTests() {
  console.log('🧪 Starting WhatsApp Webhook Lambda Tests\n');

  try {
    // Test 1: Webhook Verification
    console.log('📋 Test 1: Webhook Verification (GET)');
    const verificationResult = await handler(testVerification);
    console.log('Status Code:', verificationResult.statusCode);
    console.log('Response:', verificationResult.body);
    console.log('✅ Verification test completed\n');

    // Test 2: Message Status Update
    console.log('📋 Test 2: Message Status Update (delivered)');
    const statusResult = await handler(testMessageStatus);
    console.log('Status Code:', statusResult.statusCode);
    console.log('Response:', statusResult.body);
    console.log('✅ Status update test completed\n');

    // Test 3: Incoming Message
    console.log('📋 Test 3: Incoming Message');
    const incomingResult = await handler(testIncomingMessage);
    console.log('Status Code:', incomingResult.statusCode);
    console.log('Response:', incomingResult.body);
    console.log('✅ Incoming message test completed\n');

    // Test 4: Failed Message
    console.log('📋 Test 4: Failed Message Status');
    const failedResult = await handler(testFailedMessage);
    console.log('Status Code:', failedResult.statusCode);
    console.log('Response:', failedResult.body);
    console.log('✅ Failed message test completed\n');

    // Test 5: Invalid Method
    console.log('📋 Test 5: Invalid HTTP Method');
    const invalidMethodTest = { ...testVerification, httpMethod: 'DELETE' };
    const invalidResult = await handler(invalidMethodTest);
    console.log('Status Code:', invalidResult.statusCode);
    console.log('Response:', invalidResult.body);
    console.log('✅ Invalid method test completed\n');

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Check if this script is being run directly
if (require.main === module) {
  // Load environment variables from .env file if it exists
  try {
    require('dotenv').config();
  } catch (e) {
    console.log('No dotenv package found, using environment variables as-is');
  }

  runTests();
}

module.exports = {
  testVerification,
  testMessageStatus,
  testIncomingMessage,
  testFailedMessage,
  runTests
};
