# WhatsApp Webhook Lambda Function

An AWS Lambda function for handling WhatsApp Business API webhook events, designed to work with your campaign-based WhatsApp messaging system using Node.js/Express and PostgreSQL.

## Features

- ✅ Handle WhatsApp webhook verification
- ✅ Process message status updates (sent, delivered, read, failed)
- ✅ Track campaign audience message status
- ✅ Handle interactive message responses (buttons, lists)
- ✅ Log incoming messages with context tracking
- ✅ Support for template message tracking
- ✅ Multi-organization support
- ✅ Comprehensive error handling and logging
- ✅ Database integration with PostgreSQL
- ✅ Webhook signature verification
- ✅ CloudFormation infrastructure as code
- ✅ Automated deployment scripts

## Architecture

This Lambda function is designed to work with your campaign-based messaging system:

1. **Main Server**: Creates campaign audience entries and sends template messages
2. **Lambda Function**: Updates message status and tracks interactive responses
3. **Database**: Shared PostgreSQL database with campaign, audience, and message tracking
4. **Campaign Flow**: Templates → Audience → Messages → Status Updates → Interactive Responses

## Database Schema

The function integrates with your existing campaign-based database schema:

### Core Tables (from your main system)

- **Organizations**: Multi-tenant organization management
- **Users**: System users with role-based access
- **Templates**: WhatsApp message templates with approval workflow
- **Campaigns**: Campaign management with scheduling and approval
- **Campaign Audience**: Target audience for campaigns with message status tracking
- **Audience Master**: Global contact database

### Additional Tables (added by this Lambda)

- **Messages**: Detailed message content and interaction tracking
- **Webhook Events**: Complete webhook event logging and processing status
- **Incoming Messages**: Received message tracking with context linking

### Key Features

- **Campaign Audience Status**: Tracks sent/delivered/read/failed status per recipient
- **Message Content**: Stores actual message content, templates, and interactions
- **Interactive Tracking**: Handles button clicks, list selections, and responses
- **Multi-Organization**: Full support for multiple organizations
- **Context Linking**: Links incoming messages to original campaign messages

## Setup

### Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 18.x or later
- PostgreSQL database accessible from AWS Lambda
- WhatsApp Business API account

### Installation

1. Clone this repository:

```bash
git clone <repository-url>
cd whatsapp-server-webhook
```

2. Install dependencies:

```bash
npm install
```

3. Copy environment configuration:

```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`

### Database Setup

1. Run the database schema:

```bash
psql -h your-db-host -U your-username -d your-database -f db/schema.sql
```

### Deployment

1. Make the deployment script executable:

```bash
chmod +x deployment/deploy.sh
```

2. Set required environment variables:

```bash
export DB_HOST="your-database-host"
export DB_PASSWORD="your-database-password"
export WEBHOOK_VERIFY_TOKEN="your-verify-token"
export WEBHOOK_SECRET="your-webhook-secret"
```

3. Deploy to AWS:

```bash
./deployment/deploy.sh --environment production --region us-east-1
```

### WhatsApp Configuration

After deployment, configure your WhatsApp Business API webhook:

1. Get the webhook URL from the deployment output
2. In your WhatsApp Business API settings:
   - Set Webhook URL to: `https://your-api-gateway-url/webhook`
   - Set Verify Token to your `WEBHOOK_VERIFY_TOKEN`
   - Subscribe to `messages` events

## Environment Variables

| Variable               | Description                                  | Required |
| ---------------------- | -------------------------------------------- | -------- |
| `DB_HOST`              | PostgreSQL database host                     | Yes      |
| `DB_PASSWORD`          | Database password                            | Yes      |
| `WEBHOOK_VERIFY_TOKEN` | WhatsApp webhook verification token          | Yes      |
| `WEBHOOK_SECRET`       | Webhook signature verification secret        | Yes      |
| `NODE_ENV`             | Environment (development/staging/production) | No       |
| `LOG_LEVEL`            | Logging level (error/warn/info/debug)        | No       |

See `.env.example` for all available configuration options.

## Usage

### Webhook Events Handled

1. **Message Status Updates**

   - `sent`: Message sent to WhatsApp
   - `delivered`: Message delivered to recipient
   - `read`: Message read by recipient
   - `failed`: Message delivery failed

2. **Incoming Messages** (optional logging)
   - Text messages
   - Media messages (image, video, audio, document)
   - Location messages
   - Contact messages

### Database Operations

The Lambda function performs these database operations:

```javascript
// Update message status
await Message.updateStatus(whatsappMessageId, "delivered", timestamp);

// Handle failed messages
await Message.updateWithFailure(whatsappMessageId, failureReason);

// Log webhook events
await WebhookEvent.create({
  eventType: "message_status",
  whatsappMessageId: messageId,
  status: "delivered",
  rawPayload: webhookData,
});
```

## Monitoring

### CloudWatch Logs

View logs in AWS CloudWatch:

```bash
aws logs tail /aws/lambda/whatsapp-webhook-handler --follow
```

Or use the deployment script:

```bash
./deployment/deploy.sh --logs
```

### CloudWatch Alarms

The deployment creates alarms for:

- Lambda function errors
- Function duration/timeout
- High error rates

### Metrics

Monitor these key metrics:

- Message processing rate
- Error rate by event type
- Database connection health
- Webhook processing latency

## Testing

### Local Testing

Create a test file to simulate webhook events:

```javascript
// test-local.js
const { handler } = require("./index");

const testEvent = {
  httpMethod: "POST",
  body: JSON.stringify({
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              statuses: [
                {
                  id: "test-message-id",
                  status: "delivered",
                  timestamp: "1640995200",
                  recipient_id: "1234567890",
                },
              ],
            },
          },
        ],
      },
    ],
  }),
};

handler(testEvent).then(console.log).catch(console.error);
```

### Deployment Testing

Test the deployed function:

```bash
./deployment/deploy.sh --test
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**

   - Check VPC configuration if using RDS
   - Verify security group rules
   - Ensure Lambda has network access

2. **Webhook Verification Fails**

   - Verify `WEBHOOK_VERIFY_TOKEN` matches WhatsApp settings
   - Check API Gateway configuration

3. **Message Updates Not Working**
   - Ensure message exists in database before webhook
   - Check `whatsapp_message_id` matching
   - Verify database permissions

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
```

## Integration with Main Server

Your main server should create message entries when sending:

```javascript
// In your main server when sending a message
const message = await Message.create({
  whatsappMessageId: response.messages[0].id,
  senderId: userId,
  receiverId: recipientId,
  type: "text",
  content: messageText,
  status: "pending",
});
```

The Lambda function will then update the status based on webhook events.

## Security

- Webhook signature verification enabled by default
- Environment variables encrypted in AWS
- VPC support for database access
- IAM roles with minimal permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details
#   w h a t s a p p - s e r v e r - w e b h o o k  
 