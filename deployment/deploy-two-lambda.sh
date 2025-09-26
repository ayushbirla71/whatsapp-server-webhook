#!/bin/bash

# Two-Lambda WhatsApp Webhook Deployment Script
set -e

# Configuration
STACK_NAME="whatsapp-webhook-two-lambda-stack"
REGION="us-east-1"
ENVIRONMENT="development"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    print_status "AWS CLI found"
}

# Function to check if required environment variables are set
check_environment_variables() {
    required_vars=("DB_HOST" "DB_PASSWORD")
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            print_error "Environment variable $var is not set"
            print_error "Required environment variables:"
            print_error "  DB_HOST - Your PostgreSQL database host"
            print_error "  DB_PASSWORD - Your PostgreSQL database password"
            print_error "  DB_NAME (optional) - Database name (default: whatsapp_db)"
            print_error "  DB_USER (optional) - Database user (default: postgres)"
            print_error "  WEBHOOK_VERIFY_TOKEN (optional) - Webhook verification token"
            print_error "  WEBHOOK_SECRET (optional) - Webhook signature secret"
            exit 1
        fi
    done
    print_status "All required environment variables are set"
}

# Function to package Lambda functions
package_functions() {
    print_status "Packaging Lambda functions..."
    
    # Clean previous builds
    rm -f webhook-receiver-lambda.zip
    rm -f db-processor-lambda.zip
    
    # Package webhook receiver
    print_status "Packaging webhook receiver..."
    cd webhook-receiver
    npm install --production
    zip -r ../webhook-receiver-lambda.zip . -x "*.git*" -x "node_modules/.cache/*"
    cd ..
    
    # Package DB processor
    print_status "Packaging DB processor..."
    cd db-processor
    npm install --production
    zip -r ../db-processor-lambda.zip . -x "*.git*" -x "node_modules/.cache/*"
    cd ..
    
    print_status "Lambda functions packaged successfully"
}

# Function to deploy CloudFormation stack
deploy_infrastructure() {
    print_status "Deploying CloudFormation stack..."
    
    aws cloudformation deploy \
        --template-file deployment/two-lambda-infrastructure.yaml \
        --stack-name "$STACK_NAME" \
        --parameter-overrides \
            Environment="$ENVIRONMENT" \
            DBHost="$DB_HOST" \
            DBName="${DB_NAME:-whatsapp_db}" \
            DBUser="${DB_USER:-postgres}" \
            DBPassword="$DB_PASSWORD" \
            WebhookVerifyToken="${WEBHOOK_VERIFY_TOKEN:-your_webhook_verify_token}" \
            WebhookSecret="${WEBHOOK_SECRET:-your_webhook_secret}" \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$REGION"
    
    print_status "CloudFormation stack deployed successfully"
}

# Function to update Lambda function codes
update_function_codes() {
    print_status "Updating Lambda function codes..."
    
    # Get function names from CloudFormation outputs
    WEBHOOK_RECEIVER_FUNCTION=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`WebhookReceiverFunctionName`].OutputValue' \
        --output text)
    
    DB_PROCESSOR_FUNCTION=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`DBProcessorFunctionName`].OutputValue' \
        --output text)
    
    # Update webhook receiver function
    print_status "Updating webhook receiver function: $WEBHOOK_RECEIVER_FUNCTION"
    aws lambda update-function-code \
        --function-name "$WEBHOOK_RECEIVER_FUNCTION" \
        --zip-file fileb://webhook-receiver-lambda.zip \
        --region "$REGION"
    
    # Update DB processor function
    print_status "Updating DB processor function: $DB_PROCESSOR_FUNCTION"
    aws lambda update-function-code \
        --function-name "$DB_PROCESSOR_FUNCTION" \
        --zip-file fileb://db-processor-lambda.zip \
        --region "$REGION"
    
    print_status "Lambda function codes updated successfully"
}

# Function to get deployment information
get_deployment_info() {
    print_status "Getting deployment information..."
    
    WEBHOOK_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`WebhookUrl`].OutputValue' \
        --output text)
    
    SQS_QUEUE_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`SQSQueueUrl`].OutputValue' \
        --output text)
    
    print_status "=== DEPLOYMENT INFORMATION ==="
    print_status "Webhook URL: $WEBHOOK_URL"
    print_status "SQS Queue URL: $SQS_QUEUE_URL"
    print_status "Webhook Receiver Function: $WEBHOOK_RECEIVER_FUNCTION"
    print_status "DB Processor Function: $DB_PROCESSOR_FUNCTION"
    print_status "=============================="
    
    echo ""
    print_warning "Next Steps:"
    print_warning "1. Configure this webhook URL in your WhatsApp Business API:"
    print_warning "   $WEBHOOK_URL"
    print_warning "2. Set the verify token in WhatsApp to match your WEBHOOK_VERIFY_TOKEN"
    print_warning "3. Test the webhook verification"
    print_warning "4. Monitor CloudWatch logs for both Lambda functions"
}

# Function to test the deployment
test_deployment() {
    print_status "Testing deployment..."
    
    WEBHOOK_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`WebhookUrl`].OutputValue' \
        --output text)
    
    if [ -n "$WEBHOOK_URL" ]; then
        TEST_URL="${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${WEBHOOK_VERIFY_TOKEN:-your_webhook_verify_token}&hub.challenge=test123"
        
        print_status "Testing webhook verification..."
        RESPONSE=$(curl -s -w "%{http_code}" "$TEST_URL")
        HTTP_CODE="${RESPONSE: -3}"
        
        if [ "$HTTP_CODE" = "200" ]; then
            print_status "Webhook verification test passed"
        else
            print_warning "Webhook verification test failed with HTTP code: $HTTP_CODE"
            print_warning "Response: $RESPONSE"
        fi
    fi
}

# Function to show logs
show_logs() {
    print_status "Showing recent logs..."
    
    FUNCTION_NAME="$1"
    if [ -z "$FUNCTION_NAME" ]; then
        print_error "Please specify function name: webhook-receiver or db-processor"
        exit 1
    fi
    
    if [ "$FUNCTION_NAME" = "webhook-receiver" ]; then
        LOG_GROUP="/aws/lambda/whatsapp-webhook-receiver-${ENVIRONMENT}"
    elif [ "$FUNCTION_NAME" = "db-processor" ]; then
        LOG_GROUP="/aws/lambda/whatsapp-db-processor-${ENVIRONMENT}"
    else
        print_error "Invalid function name. Use 'webhook-receiver' or 'db-processor'"
        exit 1
    fi
    
    aws logs tail "$LOG_GROUP" \
        --region "$REGION" \
        --since 10m \
        --follow
}

# Main deployment function
main() {
    print_status "Starting Two-Lambda WhatsApp Webhook deployment..."
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --region)
                REGION="$2"
                shift 2
                ;;
            --stack-name)
                STACK_NAME="$2"
                shift 2
                ;;
            --logs)
                show_logs "$2"
                exit 0
                ;;
            --test)
                test_deployment
                exit 0
                ;;
            --info)
                get_deployment_info
                exit 0
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --environment ENV     Set deployment environment (default: development)"
                echo "  --region REGION       Set AWS region (default: us-east-1)"
                echo "  --stack-name NAME     Set CloudFormation stack name"
                echo "  --logs FUNCTION       Show logs (webhook-receiver or db-processor)"
                echo "  --test               Test the deployment"
                echo "  --info               Show deployment information"
                echo "  --help               Show this help message"
                echo ""
                echo "Required Environment Variables:"
                echo "  DB_HOST              Database host"
                echo "  DB_PASSWORD          Database password"
                echo "  DB_NAME              Database name (optional, default: whatsapp_db)"
                echo "  DB_USER              Database user (optional, default: postgres)"
                echo "  WEBHOOK_VERIFY_TOKEN Webhook verification token (optional)"
                echo "  WEBHOOK_SECRET       Webhook signature secret (optional)"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Run deployment steps
    check_aws_cli
    check_environment_variables
    package_functions
    deploy_infrastructure
    update_function_codes
    get_deployment_info
    test_deployment
    
    print_status "Two-Lambda deployment completed successfully!"
    print_status "Architecture: Webhook Receiver -> SQS -> DB Processor"
}

# Run main function
main "$@"
