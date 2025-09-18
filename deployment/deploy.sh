#!/bin/bash

# WhatsApp Webhook Lambda Deployment Script
set -e

# Configuration
FUNCTION_NAME="whatsapp-webhook-handler"
STACK_NAME="whatsapp-webhook-stack"
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
            exit 1
        fi
    done
    print_status "All required environment variables are set"
    print_warning "Note: Webhook tokens are now configured per organization in the database"
}

# Function to package Lambda function
package_function() {
    print_status "Packaging Lambda function..."
    
    # Clean previous builds
    rm -f whatsapp-webhook-lambda.zip
    
    # Install dependencies
    npm install --production
    
    # Create deployment package
    zip -r whatsapp-webhook-lambda.zip . \
        -x "*.git*" \
        -x "node_modules/.cache/*" \
        -x "tests/*" \
        -x "*.md" \
        -x "deployment/*" \
        -x "*.sh"
    
    print_status "Lambda function packaged successfully"
}

# Function to deploy CloudFormation stack
deploy_infrastructure() {
    print_status "Deploying CloudFormation stack..."
    
    aws cloudformation deploy \
        --template-file deployment/cloudformation.yaml \
        --stack-name "$STACK_NAME" \
        --parameter-overrides \
            FunctionName="$FUNCTION_NAME" \
            Environment="$ENVIRONMENT" \
            DBHost="$DB_HOST" \
            DBName="${DB_NAME:-whatsapp_db}" \
            DBUser="${DB_USER:-postgres}" \
            DBPassword="$DB_PASSWORD" \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$REGION"
    
    print_status "CloudFormation stack deployed successfully"
}

# Function to update Lambda function code
update_function_code() {
    print_status "Updating Lambda function code..."
    
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file fileb://whatsapp-webhook-lambda.zip \
        --region "$REGION"
    
    print_status "Lambda function code updated successfully"
}

# Function to get webhook URL
get_webhook_url() {
    print_status "Getting webhook URL..."
    
    WEBHOOK_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`WebhookUrl`].OutputValue' \
        --output text)
    
    print_status "Webhook URL: $WEBHOOK_URL"
    echo "Configure this URL in your WhatsApp Business API webhook settings"
}

# Function to test the deployment
test_deployment() {
    print_status "Testing deployment..."

    # Test webhook verification endpoint
    WEBHOOK_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`WebhookUrl`].OutputValue' \
        --output text)

    if [ -n "$WEBHOOK_URL" ]; then
        print_status "Webhook URL: $WEBHOOK_URL"
        print_warning "To test webhook verification, you need to:"
        print_warning "1. Configure an organization in your database with WhatsApp settings"
        print_warning "2. Use the organization's webhook verify token in the test URL"
        print_warning "Example: ${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=YOUR_ORG_VERIFY_TOKEN&hub.challenge=test123"
    fi
}

# Function to show logs
show_logs() {
    print_status "Showing recent logs..."
    
    aws logs tail "/aws/lambda/$FUNCTION_NAME" \
        --region "$REGION" \
        --since 10m \
        --follow
}

# Main deployment function
main() {
    print_status "Starting WhatsApp Webhook Lambda deployment..."
    
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
            --function-name)
                FUNCTION_NAME="$2"
                STACK_NAME="${FUNCTION_NAME}-stack"
                shift 2
                ;;
            --logs)
                show_logs
                exit 0
                ;;
            --test)
                test_deployment
                exit 0
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --environment ENV     Set deployment environment (default: development)"
                echo "  --region REGION       Set AWS region (default: us-east-1)"
                echo "  --function-name NAME  Set Lambda function name (default: whatsapp-webhook-handler)"
                echo "  --logs               Show recent logs"
                echo "  --test               Test the deployment"
                echo "  --help               Show this help message"
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
    package_function
    deploy_infrastructure
    update_function_code
    get_webhook_url
    test_deployment
    
    print_status "Deployment completed successfully!"
    print_status "Don't forget to configure the webhook URL in your WhatsApp Business API settings"
}

# Run main function
main "$@"
