# Integration Guide: WhatsApp Webhook Lambda with Campaign System

This guide explains how to integrate the WhatsApp Webhook Lambda function with your existing campaign-based messaging system.

## Overview

Your system architecture:
- **Main Server**: Node.js/Express server handling campaigns, templates, and message sending
- **Lambda Function**: Handles WhatsApp webhook events and updates message status
- **Database**: PostgreSQL with your existing campaign schema + additional webhook tables

## Database Integration

### 1. Run the Additional Schema

Execute the `db/schema.sql` file to add the required tables:

```bash
psql -h your-db-host -U your-username -d your-database -f db/schema.sql
```

This adds:
- `messages` table for detailed message tracking
- `webhook_events` table for webhook event logging
- `incoming_messages` table for received message tracking

### 2. Update Your Main Server

When sending messages from your main server, create entries in both tables:

```javascript
// In your main server when sending a WhatsApp message
const campaignAudience = await db.query(`
  UPDATE campaign_audience 
  SET whatsapp_message_id = $1, message_status = 'sent', sent_at = CURRENT_TIMESTAMP
  WHERE id = $2
  RETURNING *
`, [whatsappMessageId, campaignAudienceId]);

// Also create a detailed message record
const message = await db.query(`
  INSERT INTO messages (
    organization_id, campaign_id, campaign_audience_id, whatsapp_message_id,
    from_number, to_number, message_type, message_content, template_name,
    template_language, template_parameters, is_incoming, message_status
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  RETURNING *
`, [
  organizationId, campaignId, campaignAudienceId, whatsappMessageId,
  fromNumber, toNumber, 'template', messageContent, templateName,
  templateLanguage, JSON.stringify(templateParams), false, 'sent'
]);
```

## Lambda Function Behavior

### 1. Message Status Updates

The Lambda function will automatically:
- Update `campaign_audience.message_status` (sent → delivered → read)
- Update `messages.message_status` with timestamps
- Update campaign statistics (`campaigns.total_sent`, `total_delivered`, etc.)
- Log all events in `webhook_events` table

### 2. Interactive Message Handling

For interactive templates (buttons, lists):
- Lambda logs the interaction data
- Updates `messages.interaction_data` with response details
- Creates webhook events for tracking

### 3. Incoming Message Processing

For incoming messages:
- Lambda creates entries in `incoming_messages` table
- Links responses to original campaign messages via context
- **TODO**: You need to implement the processing logic

## Integration Points

### 1. Incoming Message Handler

In your main server, create an endpoint to process incoming messages:

```javascript
// POST /api/webhooks/incoming-message
app.post('/api/webhooks/incoming-message', async (req, res) => {
  const { whatsappMessageId, from, content, interactionData, contextCampaignId } = req.body;
  
  // Your logic here:
  // - Check if it's a response to a campaign
  // - Update customer records
  // - Trigger follow-up actions
  // - Send next template in sequence
  
  res.json({ success: true });
});
```

### 2. Interactive Response Handler

For interactive template responses:

```javascript
// Handle button/list responses
app.post('/api/webhooks/interactive-response', async (req, res) => {
  const { whatsappMessageId, interactionData, campaignId } = req.body;
  
  if (interactionData.type === 'button_reply') {
    // Handle button click
    const buttonId = interactionData.button_id;
    // Trigger next action based on button selection
  }
  
  if (interactionData.type === 'list_reply') {
    // Handle list selection
    const listId = interactionData.list_id;
    // Process list selection
  }
  
  res.json({ success: true });
});
```

### 3. Campaign Statistics

Query updated statistics:

```javascript
// Get campaign performance
app.get('/api/campaigns/:id/stats', async (req, res) => {
  const campaign = await db.query(`
    SELECT 
      total_targeted_audience,
      total_sent,
      total_delivered,
      total_read,
      total_failed,
      (total_read::float / NULLIF(total_delivered, 0) * 100) as read_rate,
      (total_delivered::float / NULLIF(total_sent, 0) * 100) as delivery_rate
    FROM campaigns 
    WHERE id = $1
  `, [req.params.id]);
  
  res.json(campaign.rows[0]);
});
```

## Environment Variables

Set these in your Lambda environment:

```bash
# Database
DB_HOST=your-rds-endpoint.amazonaws.com
DB_NAME=your_database_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# WhatsApp
WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
WEBHOOK_SECRET=your_webhook_secret

# Organization (if single-tenant)
DEFAULT_ORGANIZATION_ID=your_org_uuid
```

## Deployment Steps

1. **Deploy Lambda Function**:
   ```bash
   ./deployment/deploy.sh --environment production
   ```

2. **Configure WhatsApp Webhook**:
   - Set webhook URL to your Lambda API Gateway endpoint
   - Subscribe to `messages` events

3. **Test Integration**:
   - Send a test campaign message
   - Verify status updates in database
   - Test interactive message responses

## Monitoring

### CloudWatch Logs
- Monitor Lambda execution logs
- Track webhook processing errors
- Monitor database connection issues

### Database Queries
```sql
-- Check recent webhook events
SELECT * FROM webhook_events 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check message status distribution
SELECT message_status, COUNT(*) 
FROM campaign_audience 
WHERE campaign_id = 'your-campaign-id'
GROUP BY message_status;

-- Check interactive responses
SELECT * FROM messages 
WHERE interaction_data IS NOT NULL
AND created_at > NOW() - INTERVAL '1 day';
```

## Troubleshooting

### Common Issues

1. **Messages not updating**: Check WhatsApp message ID matching
2. **Database connection errors**: Verify VPC/security group settings
3. **Webhook verification fails**: Check verify token configuration
4. **Interactive responses not tracked**: Verify template configuration

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=debug
```

## Next Steps

1. **Implement incoming message processing** in your main server
2. **Add interactive response handlers** for your specific use cases
3. **Set up monitoring and alerting** for webhook failures
4. **Implement follow-up campaign logic** based on responses
5. **Add analytics and reporting** for campaign performance

## Support

For issues with:
- **Lambda function**: Check CloudWatch logs and webhook events table
- **Database integration**: Verify schema and connection settings
- **WhatsApp API**: Check Meta Business documentation
- **Campaign logic**: Implement based on your business requirements
