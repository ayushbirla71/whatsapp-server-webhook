# Two-Lambda WhatsApp Webhook Deployment Script for Windows
param(
    [string]$Environment = "development",
    [string]$Region = "us-east-1",
    [string]$StackName = "whatsapp-webhook-two-lambda-stack",
    [string]$ShowLogs = "",
    [switch]$Test,
    [switch]$Info,
    [switch]$Help
)

# Configuration
$ErrorActionPreference = "Stop"

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Function to check if AWS CLI is installed
function Test-AwsCli {
    try {
        aws --version | Out-Null
        Write-Status "AWS CLI found"
        return $true
    }
    catch {
        Write-Error "AWS CLI is not installed. Please install it first."
        return $false
    }
}

# Function to check if required environment variables are set
function Test-EnvironmentVariables {
    $requiredVars = @("DB_HOST", "DB_PASSWORD")
    
    foreach ($var in $requiredVars) {
        if (-not (Get-Variable -Name $var -ErrorAction SilentlyContinue)) {
            Write-Error "Environment variable $var is not set"
            Write-Error "Required environment variables:"
            Write-Error "  `$env:DB_HOST - Your PostgreSQL database host"
            Write-Error "  `$env:DB_PASSWORD - Your PostgreSQL database password"
            Write-Error "  `$env:DB_NAME (optional) - Database name (default: whatsapp_db)"
            Write-Error "  `$env:DB_USER (optional) - Database user (default: postgres)"
            Write-Error "  `$env:WEBHOOK_VERIFY_TOKEN (optional) - Webhook verification token"
            Write-Error "  `$env:WEBHOOK_SECRET (optional) - Webhook signature secret"
            return $false
        }
    }
    Write-Status "All required environment variables are set"
    return $true
}

# Function to package Lambda functions
function New-LambdaPackages {
    Write-Status "Packaging Lambda functions..."
    
    # Clean previous builds
    if (Test-Path "webhook-receiver-lambda.zip") { Remove-Item "webhook-receiver-lambda.zip" }
    if (Test-Path "db-processor-lambda.zip") { Remove-Item "db-processor-lambda.zip" }
    
    # Package webhook receiver
    Write-Status "Packaging webhook receiver..."
    Set-Location "webhook-receiver"
    npm install --production
    if ($LASTEXITCODE -ne 0) { throw "npm install failed for webhook-receiver" }
    
    Compress-Archive -Path * -DestinationPath "../webhook-receiver-lambda.zip" -Force
    Set-Location ".."
    
    # Package DB processor
    Write-Status "Packaging DB processor..."
    Set-Location "db-processor"
    npm install --production
    if ($LASTEXITCODE -ne 0) { throw "npm install failed for db-processor" }
    
    Compress-Archive -Path * -DestinationPath "../db-processor-lambda.zip" -Force
    Set-Location ".."
    
    Write-Status "Lambda functions packaged successfully"
}

# Function to deploy CloudFormation stack
function Deploy-Infrastructure {
    Write-Status "Deploying CloudFormation stack..."
    
    $dbName = if ($env:DB_NAME) { $env:DB_NAME } else { "whatsapp_db" }
    $dbUser = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
    $webhookVerifyToken = if ($env:WEBHOOK_VERIFY_TOKEN) { $env:WEBHOOK_VERIFY_TOKEN } else { "your_webhook_verify_token" }
    $webhookSecret = if ($env:WEBHOOK_SECRET) { $env:WEBHOOK_SECRET } else { "your_webhook_secret" }
    
    aws cloudformation deploy `
        --template-file "deployment/two-lambda-infrastructure.yaml" `
        --stack-name $StackName `
        --parameter-overrides `
            "Environment=$Environment" `
            "DBHost=$env:DB_HOST" `
            "DBName=$dbName" `
            "DBUser=$dbUser" `
            "DBPassword=$env:DB_PASSWORD" `
            "WebhookVerifyToken=$webhookVerifyToken" `
            "WebhookSecret=$webhookSecret" `
        --capabilities CAPABILITY_NAMED_IAM `
        --region $Region
    
    if ($LASTEXITCODE -ne 0) { throw "CloudFormation deployment failed" }
    Write-Status "CloudFormation stack deployed successfully"
}

# Function to update Lambda function codes
function Update-FunctionCodes {
    Write-Status "Updating Lambda function codes..."
    
    # Get function names from CloudFormation outputs
    $webhookReceiverFunction = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`WebhookReceiverFunctionName`].OutputValue' `
        --output text
    
    $dbProcessorFunction = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`DBProcessorFunctionName`].OutputValue' `
        --output text
    
    # Update webhook receiver function
    Write-Status "Updating webhook receiver function: $webhookReceiverFunction"
    aws lambda update-function-code `
        --function-name $webhookReceiverFunction `
        --zip-file "fileb://webhook-receiver-lambda.zip" `
        --region $Region
    
    if ($LASTEXITCODE -ne 0) { throw "Failed to update webhook receiver function" }
    
    # Update DB processor function
    Write-Status "Updating DB processor function: $dbProcessorFunction"
    aws lambda update-function-code `
        --function-name $dbProcessorFunction `
        --zip-file "fileb://db-processor-lambda.zip" `
        --region $Region
    
    if ($LASTEXITCODE -ne 0) { throw "Failed to update DB processor function" }
    
    Write-Status "Lambda function codes updated successfully"
}

# Function to get deployment information
function Get-DeploymentInfo {
    Write-Status "Getting deployment information..."
    
    $webhookUrl = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`WebhookUrl`].OutputValue' `
        --output text
    
    $sqsQueueUrl = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`SQSQueueUrl`].OutputValue' `
        --output text
    
    $webhookReceiverFunction = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`WebhookReceiverFunctionName`].OutputValue' `
        --output text
    
    $dbProcessorFunction = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`DBProcessorFunctionName`].OutputValue' `
        --output text
    
    Write-Status "=== DEPLOYMENT INFORMATION ==="
    Write-Status "Webhook URL: $webhookUrl"
    Write-Status "SQS Queue URL: $sqsQueueUrl"
    Write-Status "Webhook Receiver Function: $webhookReceiverFunction"
    Write-Status "DB Processor Function: $dbProcessorFunction"
    Write-Status "=============================="
    
    Write-Host ""
    Write-Warning "Next Steps:"
    Write-Warning "1. Configure this webhook URL in your WhatsApp Business API:"
    Write-Warning "   $webhookUrl"
    Write-Warning "2. Set the verify token in WhatsApp to match your WEBHOOK_VERIFY_TOKEN"
    Write-Warning "3. Test the webhook verification"
    Write-Warning "4. Monitor CloudWatch logs for both Lambda functions"
    
    return @{
        WebhookUrl = $webhookUrl
        SQSQueueUrl = $sqsQueueUrl
        WebhookReceiverFunction = $webhookReceiverFunction
        DBProcessorFunction = $dbProcessorFunction
    }
}

# Function to test the deployment
function Test-Deployment {
    Write-Status "Testing deployment..."
    
    $webhookUrl = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`WebhookUrl`].OutputValue' `
        --output text
    
    if ($webhookUrl) {
        $webhookVerifyToken = if ($env:WEBHOOK_VERIFY_TOKEN) { $env:WEBHOOK_VERIFY_TOKEN } else { "your_webhook_verify_token" }
        $testUrl = "$webhookUrl" + "?hub.mode=subscribe&hub.verify_token=$webhookVerifyToken&hub.challenge=test123"
        
        Write-Status "Testing webhook verification..."
        try {
            $response = Invoke-WebRequest -Uri $testUrl -Method GET
            if ($response.StatusCode -eq 200) {
                Write-Status "Webhook verification test passed"
                Write-Status "Response: $($response.Content)"
            } else {
                Write-Warning "Webhook verification test failed with status code: $($response.StatusCode)"
            }
        }
        catch {
            Write-Warning "Webhook verification test failed: $($_.Exception.Message)"
        }
    }
}

# Function to show logs
function Show-Logs {
    param([string]$FunctionName)
    
    if (-not $FunctionName) {
        Write-Error "Please specify function name: webhook-receiver or db-processor"
        return
    }
    
    $logGroup = switch ($FunctionName) {
        "webhook-receiver" { "/aws/lambda/whatsapp-webhook-receiver-$Environment" }
        "db-processor" { "/aws/lambda/whatsapp-db-processor-$Environment" }
        default {
            Write-Error "Invalid function name. Use 'webhook-receiver' or 'db-processor'"
            return
        }
    }
    
    Write-Status "Showing logs for $FunctionName..."
    aws logs tail $logGroup `
        --region $Region `
        --since 10m `
        --follow
}

# Function to show help
function Show-Help {
    Write-Host "Two-Lambda WhatsApp Webhook Deployment Script"
    Write-Host ""
    Write-Host "Usage: .\deploy-two-lambda.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Environment ENV      Set deployment environment (default: development)"
    Write-Host "  -Region REGION        Set AWS region (default: us-east-1)"
    Write-Host "  -StackName NAME       Set CloudFormation stack name"
    Write-Host "  -ShowLogs FUNCTION    Show logs (webhook-receiver or db-processor)"
    Write-Host "  -Test                 Test the deployment"
    Write-Host "  -Info                 Show deployment information"
    Write-Host "  -Help                 Show this help message"
    Write-Host ""
    Write-Host "Required Environment Variables:"
    Write-Host "  `$env:DB_HOST              Database host"
    Write-Host "  `$env:DB_PASSWORD          Database password"
    Write-Host "  `$env:DB_NAME              Database name (optional, default: whatsapp_db)"
    Write-Host "  `$env:DB_USER              Database user (optional, default: postgres)"
    Write-Host "  `$env:WEBHOOK_VERIFY_TOKEN Webhook verification token (optional)"
    Write-Host "  `$env:WEBHOOK_SECRET       Webhook signature secret (optional)"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\deploy-two-lambda.ps1"
    Write-Host "  .\deploy-two-lambda.ps1 -Environment production -Region us-west-2"
    Write-Host "  .\deploy-two-lambda.ps1 -ShowLogs webhook-receiver"
    Write-Host "  .\deploy-two-lambda.ps1 -Test"
    Write-Host "  .\deploy-two-lambda.ps1 -Info"
}

# Main execution
try {
    if ($Help) {
        Show-Help
        exit 0
    }
    
    if ($ShowLogs) {
        Show-Logs -FunctionName $ShowLogs
        exit 0
    }
    
    if ($Test) {
        Test-Deployment
        exit 0
    }
    
    if ($Info) {
        Get-DeploymentInfo | Out-Null
        exit 0
    }
    
    # Main deployment
    Write-Status "Starting Two-Lambda WhatsApp Webhook deployment..."
    
    if (-not (Test-AwsCli)) { exit 1 }
    if (-not (Test-EnvironmentVariables)) { exit 1 }
    
    New-LambdaPackages
    Deploy-Infrastructure
    Update-FunctionCodes
    $deploymentInfo = Get-DeploymentInfo
    Test-Deployment
    
    Write-Status "Two-Lambda deployment completed successfully!"
    Write-Status "Architecture: Webhook Receiver -> SQS -> DB Processor"
}
catch {
    Write-Error "Deployment failed: $($_.Exception.Message)"
    exit 1
}
