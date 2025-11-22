import winston from 'winston';
import path from 'path';
import fs from 'fs';
import config from '../config';

// Ensure logs directory exists
const logsDir = config.logging.dir;
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom log format with timestamp and colors
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * Console format with colors
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    
    return msg;
  })
);

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'kalypt-bundler' },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 30,
    }),
    
    // Write errors to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 20 * 1024 * 1024,
      maxFiles: 30,
    }),
    
    // Write transaction logs separately
    new winston.transports.File({
      filename: path.join(logsDir, 'transactions.log'),
      level: 'info',
      maxsize: 50 * 1024 * 1024, // 50MB for transactions
      maxFiles: 30,
    }),
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
    }),
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
    }),
  ],
});

/**
 * Add console transport in development
 */
if (config.isDevelopment) {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

/**
 * Enhanced logger with additional methods
 */
export class Logger {
  private logger: winston.Logger;
  
  constructor(logger: winston.Logger) {
    this.logger = logger;
  }
  
  /**
   * Info level log
   */
  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }
  
  /**
   * Error level log
   */
  error(message: string, error?: Error | any): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        error: error.message,
        stack: error.stack,
        ...error,
      });
    } else {
      this.logger.error(message, error);
    }
  }
  
  /**
   * Warning level log
   */
  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }
  
  /**
   * Debug level log
   */
  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }
  
  /**
   * Transaction log (important events)
   */
  transaction(message: string, data: TransactionLogData): void {
    this.logger.info(`[TX] ${message}`, {
      type: 'transaction',
      ...data,
    });
  }
  
  /**
   * Bundle log
   */
  bundle(message: string, data: BundleLogData): void {
    this.logger.info(`[BUNDLE] ${message}`, {
      type: 'bundle',
      ...data,
    });
  }
  
  /**
   * Wallet operation log
   */
  wallet(message: string, data: WalletLogData): void {
    this.logger.info(`[WALLET] ${message}`, {
      type: 'wallet',
      ...data,
    });
  }
  
  /**
   * Project operation log
   */
  project(message: string, data: ProjectLogData): void {
    this.logger.info(`[PROJECT] ${message}`, {
      type: 'project',
      ...data,
    });
  }
  
  /**
   * Bot interaction log
   */
  bot(message: string, data?: BotLogData): void {
    this.logger.info(`[BOT] ${message}`, {
      type: 'bot',
      ...data,
    });
  }
  
  /**
   * Success log with emoji
   */
  success(message: string, meta?: any): void {
    this.logger.info(`✅ ${message}`, meta);
  }
  
  /**
   * Failure log with emoji
   */
  failure(message: string, meta?: any): void {
    this.logger.error(`❌ ${message}`, meta);
  }
  
  /**
   * Start operation log
   */
  start(operation: string, meta?: any): void {
    this.logger.info(`🚀 Starting: ${operation}`, meta);
  }
  
  /**
   * Complete operation log
   */
  complete(operation: string, meta?: any): void {
    this.logger.info(`✅ Completed: ${operation}`, meta);
  }
}

/**
 * Transaction log data interface
 */
export interface TransactionLogData {
  signature?: string;
  from?: string;
  to?: string;
  walletAddress?: string;
  amount?: number;
  tokenAddress?: string;
  type?: 'token_create' | 'token_deploy' | 'buy' | 'sell' | 'swap' | 'transfer_sol' | 'transfer_token' | 'disperse' | 'gather' | 'warmup' | 'other';
  status?: 'pending' | 'processing' | 'confirmed' | 'failed';
  error?: string;
  count?: number;
  metadata?: Record<string, any>;
}

/**
 * Bundle log data interface
 */
export interface BundleLogData {
  bundleId?: string;
  transactions?: number;
  wallets?: number;
  tipAmount?: number;
  status?: 'pending' | 'processing' | 'confirmed' | 'failed';
  endpoint?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Wallet log data interface
 */
export interface WalletLogData {
  walletId?: string;
  address?: string;
  projectId?: string;
  operation?: 'create' | 'import' | 'delete' | 'encrypt' | 'decrypt';
  balance?: number;
  count?: number;
  walletType?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Project log data interface
 */
export interface ProjectLogData {
  projectId?: string;
  projectName?: string;
  userId?: string;
  operation?: 'create' | 'update' | 'delete' | 'launch';
  tokenAddress?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Bot log data interface
 */
export interface BotLogData {
  userId?: number;
  username?: string;
  command?: string;
  chatId?: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Create logger instance
 */
const loggerInstance = new Logger(logger);

/**
 * Export logger
 */
export default loggerInstance;

/**
 * Export raw winston logger for advanced usage
 */
export { logger as winstonLogger };

/**
 * Log startup message
 */
loggerInstance.info('Logger initialized', {
  level: config.logging.level,
  directory: config.logging.dir,
  environment: config.nodeEnv,
});