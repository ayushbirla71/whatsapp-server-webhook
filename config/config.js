/**
 * Configuration management for WhatsApp Webhook Lambda
 */

class Config {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.loadConfig();
  }

  loadConfig() {
    // Database configuration
    this.database = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      name: process.env.DB_NAME || 'whatsapp_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: this.environment === 'production' ? { rejectUnauthorized: false } : false,
      pool: {
        max: parseInt(process.env.DB_POOL_MAX) || 20,
        min: parseInt(process.env.DB_POOL_MIN) || 0,
        idle: parseInt(process.env.DB_POOL_IDLE) || 30000,
        acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 60000
      }
    };

    // WhatsApp webhook configuration
    this.webhook = {
      verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'your_verify_token_here',
      secret: process.env.WEBHOOK_SECRET || 'your_webhook_secret_here',
      enableSignatureVerification: process.env.ENABLE_SIGNATURE_VERIFICATION === 'true',
      maxPayloadSize: parseInt(process.env.MAX_PAYLOAD_SIZE) || 1048576 // 1MB
    };

    // WhatsApp API configuration
    this.whatsapp = {
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || ''
    };

    // Logging configuration
    this.logging = {
      level: process.env.LOG_LEVEL || 'info',
      enableStructuredLogging: process.env.ENABLE_STRUCTURED_LOGGING !== 'false',
      enablePerformanceLogging: process.env.ENABLE_PERFORMANCE_LOGGING === 'true'
    };

    // AWS configuration
    this.aws = {
      region: process.env.AWS_REGION || 'us-east-1',
      functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'whatsapp-webhook-handler',
      functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION || '$LATEST'
    };

    // Rate limiting and retry configuration
    this.rateLimit = {
      maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 100,
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
      retryDelay: parseInt(process.env.RETRY_DELAY) || 1000,
      backoffMultiplier: parseFloat(process.env.BACKOFF_MULTIPLIER) || 2
    };

    // Feature flags
    this.features = {
      enableIncomingMessageLogging: process.env.ENABLE_INCOMING_MESSAGE_LOGGING !== 'false',
      enableStatusUpdateLogging: process.env.ENABLE_STATUS_UPDATE_LOGGING !== 'false',
      enableErrorNotifications: process.env.ENABLE_ERROR_NOTIFICATIONS === 'true',
      enableMetrics: process.env.ENABLE_METRICS === 'true'
    };

    // Security configuration
    this.security = {
      enableCors: process.env.ENABLE_CORS !== 'false',
      allowedOrigins: process.env.ALLOWED_ORIGINS ? 
        process.env.ALLOWED_ORIGINS.split(',') : ['*'],
      enableRequestValidation: process.env.ENABLE_REQUEST_VALIDATION !== 'false'
    };
  }

  /**
   * Get database connection string
   */
  getDatabaseUrl() {
    const { host, port, name, user, password } = this.database;
    return `postgresql://${user}:${password}@${host}:${port}/${name}`;
  }

  /**
   * Validate required configuration
   */
  validate() {
    const errors = [];

    // Check required database config
    if (!this.database.host) errors.push('DB_HOST is required');
    if (!this.database.name) errors.push('DB_NAME is required');
    if (!this.database.user) errors.push('DB_USER is required');

    // Check webhook config
    if (this.webhook.verifyToken === 'your_verify_token_here') {
      errors.push('WEBHOOK_VERIFY_TOKEN must be set');
    }

    // Check WhatsApp API config for production
    if (this.environment === 'production') {
      if (!this.whatsapp.phoneNumberId) {
        errors.push('WHATSAPP_PHONE_NUMBER_ID is required in production');
      }
      if (!this.whatsapp.accessToken) {
        errors.push('WHATSAPP_ACCESS_TOKEN is required in production');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    return true;
  }

  /**
   * Get configuration for specific component
   */
  getComponentConfig(component) {
    const configs = {
      database: this.database,
      webhook: this.webhook,
      whatsapp: this.whatsapp,
      logging: this.logging,
      aws: this.aws,
      rateLimit: this.rateLimit,
      features: this.features,
      security: this.security
    };

    return configs[component] || null;
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(feature) {
    return this.features[feature] === true;
  }

  /**
   * Get environment-specific settings
   */
  getEnvironmentSettings() {
    const baseSettings = {
      environment: this.environment,
      debug: this.environment === 'development',
      production: this.environment === 'production'
    };

    switch (this.environment) {
      case 'development':
        return {
          ...baseSettings,
          enableDetailedLogging: true,
          enableDebugMode: true,
          strictValidation: false
        };
      
      case 'staging':
        return {
          ...baseSettings,
          enableDetailedLogging: true,
          enableDebugMode: false,
          strictValidation: true
        };
      
      case 'production':
        return {
          ...baseSettings,
          enableDetailedLogging: false,
          enableDebugMode: false,
          strictValidation: true
        };
      
      default:
        return baseSettings;
    }
  }
}

// Create and export singleton instance
const config = new Config();

module.exports = {
  Config,
  config
};
