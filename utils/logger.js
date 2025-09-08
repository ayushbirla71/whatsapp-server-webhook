/**
 * Comprehensive logging and error handling utilities
 */

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Log levels hierarchy
   */
  static LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  /**
   * Check if log level should be output
   */
  shouldLog(level) {
    const currentLevel = Logger.LOG_LEVELS[this.logLevel] || Logger.LOG_LEVELS.info;
    const messageLevel = Logger.LOG_LEVELS[level] || Logger.LOG_LEVELS.info;
    return messageLevel <= currentLevel;
  }

  /**
   * Format log message with metadata
   */
  formatMessage(level, message, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      environment: this.environment,
      message: message,
      ...metadata
    };

    // Add AWS Lambda context if available
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      logEntry.lambda = {
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
        requestId: process.env.AWS_LAMBDA_LOG_GROUP_NAME
      };
    }

    return JSON.stringify(logEntry);
  }

  /**
   * Error logging
   */
  error(message, error = null, metadata = {}) {
    if (!this.shouldLog('error')) return;

    const errorMetadata = {
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code
      } : null
    };

    console.error(this.formatMessage('error', message, errorMetadata));
  }

  /**
   * Warning logging
   */
  warn(message, metadata = {}) {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message, metadata));
  }

  /**
   * Info logging
   */
  info(message, metadata = {}) {
    if (!this.shouldLog('info')) return;
    console.log(this.formatMessage('info', message, metadata));
  }

  /**
   * Debug logging
   */
  debug(message, metadata = {}) {
    if (!this.shouldLog('debug')) return;
    console.log(this.formatMessage('debug', message, metadata));
  }

  /**
   * Log webhook event specifically
   */
  logWebhookEvent(eventType, payload, status = 'processing', metadata = {}) {
    this.info(`Webhook event: ${eventType}`, {
      eventType,
      status,
      payloadSize: JSON.stringify(payload).length,
      ...metadata
    });
  }

  /**
   * Log database operation
   */
  logDatabaseOperation(operation, table, result = null, error = null, metadata = {}) {
    if (error) {
      this.error(`Database ${operation} failed on ${table}`, error, {
        operation,
        table,
        ...metadata
      });
    } else {
      this.debug(`Database ${operation} on ${table}`, {
        operation,
        table,
        result: result ? { rowCount: result.rowCount || result.length } : null,
        ...metadata
      });
    }
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation, duration, metadata = {}) {
    this.info(`Performance: ${operation}`, {
      operation,
      duration: `${duration}ms`,
      ...metadata
    });
  }
}

/**
 * Error handling utilities
 */
class ErrorHandler {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Handle and categorize errors
   */
  handleError(error, context = {}) {
    const errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      context
    };

    // Categorize error types
    if (this.isDatabaseError(error)) {
      this.logger.error('Database error occurred', error, { 
        category: 'database',
        ...context 
      });
      return this.createErrorResponse('DATABASE_ERROR', 'Database operation failed', 500);
    }

    if (this.isValidationError(error)) {
      this.logger.warn('Validation error occurred', { 
        error: errorInfo,
        category: 'validation',
        ...context 
      });
      return this.createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }

    if (this.isNetworkError(error)) {
      this.logger.error('Network error occurred', error, { 
        category: 'network',
        ...context 
      });
      return this.createErrorResponse('NETWORK_ERROR', 'Network operation failed', 502);
    }

    if (this.isAuthenticationError(error)) {
      this.logger.warn('Authentication error occurred', { 
        error: errorInfo,
        category: 'authentication',
        ...context 
      });
      return this.createErrorResponse('AUTH_ERROR', 'Authentication failed', 401);
    }

    // Generic error
    this.logger.error('Unhandled error occurred', error, { 
      category: 'generic',
      ...context 
    });
    return this.createErrorResponse('INTERNAL_ERROR', 'Internal server error', 500);
  }

  /**
   * Check if error is database-related
   */
  isDatabaseError(error) {
    return error.code && (
      error.code.startsWith('23') || // Integrity constraint violations
      error.code.startsWith('42') || // Syntax errors
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.message.includes('database') ||
      error.message.includes('connection')
    );
  }

  /**
   * Check if error is validation-related
   */
  isValidationError(error) {
    return error.name === 'ValidationError' ||
           error.message.includes('validation') ||
           error.message.includes('invalid') ||
           error.message.includes('required');
  }

  /**
   * Check if error is network-related
   */
  isNetworkError(error) {
    return error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT' ||
           error.code === 'ECONNREFUSED' ||
           error.message.includes('network') ||
           error.message.includes('timeout');
  }

  /**
   * Check if error is authentication-related
   */
  isAuthenticationError(error) {
    return error.message.includes('unauthorized') ||
           error.message.includes('authentication') ||
           error.message.includes('token') ||
           error.status === 401 ||
           error.status === 403;
  }

  /**
   * Create standardized error response
   */
  createErrorResponse(code, message, statusCode) {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: {
          code,
          message,
          timestamp: new Date().toISOString()
        }
      })
    };
  }

  /**
   * Async error wrapper for Lambda functions
   */
  wrapAsync(fn) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        return this.handleError(error, { function: fn.name });
      }
    };
  }
}

// Create singleton instances
const logger = new Logger();
const errorHandler = new ErrorHandler(logger);

module.exports = {
  Logger,
  ErrorHandler,
  logger,
  errorHandler
};
