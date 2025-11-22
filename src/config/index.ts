import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';

// Load environment variables
dotenv.config();

/**
 * Validates that required environment variables are set
 */
function validateEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Gets optional environment variable with default value
 */
function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Gets numeric environment variable with default
 */
function getNumericEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

/**
 * Gets boolean environment variable
 */
function getBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Application Configuration
 */
export const config = {
  // Environment
  nodeEnv: getEnv('NODE_ENV', 'development'),
  isDevelopment: getEnv('NODE_ENV', 'development') === 'development',
  isProduction: getEnv('NODE_ENV', 'development') === 'production',

  // Solana Configuration
  solana: {
    rpcUrl: validateEnv('SOLANA_RPC_URL'),
    wsUrl: validateEnv('SOLANA_WS_URL'),
    network: getEnv('SOLANA_NETWORK', 'mainnet-beta'),
    commitment: 'confirmed' as const,
  },

  // Jito Configuration
  jito: {
    enabled: getBooleanEnv('JITO_MODE', true),
    blockEngineUrl: getEnv(
      'JITO_BLOCK_ENGINE_URL',
      'https://mainnet.block-engine.jito.wtf'
    ),
    // Regional endpoints for fallback
    regionalEndpoints: [
      'https://amsterdam.mainnet.block-engine.jito.wtf',
      'https://frankfurt.mainnet.block-engine.jito.wtf',
      'https://ny.mainnet.block-engine.jito.wtf',
      'https://tokyo.mainnet.block-engine.jito.wtf',
    ],
  },

  // Pump.Fun Configuration
  pumpFun: {
    programId: new PublicKey(
      getEnv('PUMPFUN_PROGRAM_ID', '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
    ),
    globalAddress: new PublicKey(
      getEnv('PUMPFUN_GLOBAL_ADDRESS', '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf')
    ),
    feeRecipient: new PublicKey(
      getEnv('PUMPFUN_FEE_RECIPIENT', 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM')
    ),
    eventAuthority: new PublicKey(
      getEnv('PUMPFUN_EVENT_AUTHORITY', 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1')
    ),
    mintAuthority: new PublicKey(
      getEnv('PUMPFUN_MINT_AUTHORITY', 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM')
    ),
  },

  // Compute Settings
  compute: {
    unitLimit: getNumericEnv('COMPUTE_UNIT_LIMIT', 200000),
    unitPrice: getNumericEnv('COMPUTE_UNIT_PRICE', 500000),
  },
  
  // Trading Settings
  trading: {
    buySlippage: getNumericEnv('BUY_SLIPPAGE', 15), // 15%
    sellSlippage: getNumericEnv('SELL_SLIPPAGE', 15), // 15%
    priorityFee: getNumericEnv('PRIORITY_FEE', 0.001), // SOL
  },

  // Wallet Configuration (optional for tests)
  wallet: {
    mainPrivateKey: getEnv('MAIN_WALLET_PRIVATE_KEY', ''),
    funderPrivateKey: getEnv('FUNDER_WALLET_PRIVATE_KEY', ''),
    encryptionPassword: validateEnv('WALLET_ENCRYPTION_PASSWORD'),
  },

  // Telegram Bot (optional for tests)
  telegram: {
    botToken: getEnv('TELEGRAM_BOT_TOKEN', ''),
    adminIds: getEnv('TELEGRAM_ADMIN_IDS', '')
      .split(',')
      .filter(id => id.trim())
      .map(id => parseInt(id.trim())),
  },

  // Database Configuration
  database: {
    url: getEnv('DATABASE_URL', ''),
    host: getEnv('DB_HOST', 'localhost'),
    port: getNumericEnv('DB_PORT', 5432),
    user: getEnv('DB_USER', 'postgres'),
    password: getEnv('DB_PASSWORD', ''),
    database: getEnv('DB_NAME', 'kalypt_bundler'),
    // Connection pool settings
    max: getNumericEnv('DB_MAX_CONNECTIONS', 20), // Maximum number of clients in pool
    idleTimeoutMillis: getNumericEnv('DB_IDLE_TIMEOUT', 30000), // Close idle clients after 30s
    connectionTimeoutMillis: getNumericEnv('DB_CONNECTION_TIMEOUT', 2000), // Return error after 2s if can't connect
  },

  // Redis Configuration
  redis: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: getNumericEnv('REDIS_PORT', 6379),
    password: getEnv('REDIS_PASSWORD', ''),
    db: getNumericEnv('REDIS_DB', 0),
    // Connection settings
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
  },

  // API Configuration (optional)
  api: {
    port: getNumericEnv('API_PORT', 3000),
    host: getEnv('API_HOST', '0.0.0.0'),
    corsOrigin: getEnv('API_CORS_ORIGIN', '*'),
  },

  // Logging Configuration
  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
    dir: getEnv('LOG_DIR', './logs'),
    maxFiles: 30, // Keep logs for 30 days
    maxSize: '20m', // Max 20MB per file
  },

  // Default Settings (can be overridden in bot per-user)
  defaults: {
    // These are DEFAULTS only - actual values stored per-user in DB
    jito: {
      maxTip: 0.01,
      autoTip: true,
      priorityFee: 0.0005,
    },
    trading: {
      buySlippage: 15,
      sellSlippage: 15,
      safeSettings: true,
    },
    warmup: {
      minTransactions: 5,
      maxTransactions: 15,
      minAmount: 0.01,
      maxAmount: 0.05,
    },
    disperser: {
      minSol: 0.05,
      maxSol: 3.0,
    },
    autoTp: {
      enabled: false,
      percentage: 100,
      marketCapTarget: 30000,
    },
    smartSell: {
      enabled: false,
      percentage: 50,
      minBuySol: 0.5,
      stopHoldPercentage: 5,
    },
    bundle: {
      maxWallets: 100,
      retryAttempts: 3,
      timeoutMs: 30000,
    },
  },
};

/**
 * Validates the configuration on startup
 */
export function validateConfig(): void {
  console.log('🔍 Validating configuration...');

  // Check Telegram admin IDs
  if (config.telegram.adminIds.length === 0) {
    console.warn('⚠️  Warning: No Telegram admin IDs configured');
  }

  // Check encryption password strength
  if (config.wallet.encryptionPassword.length < 32) {
    throw new Error('ENCRYPTION_PASSWORD must be at least 32 characters long');
  }

  // Validate RPC URLs
  try {
    new URL(config.solana.rpcUrl);
    new URL(config.solana.wsUrl);
  } catch (error) {
    throw new Error('Invalid Solana RPC or WebSocket URL format');
  }

  // Validate Jito URL
  if (config.jito.enabled) {
    try {
      new URL(config.jito.blockEngineUrl);
    } catch (error) {
      throw new Error('Invalid Jito Block Engine URL format');
    }
  }

  console.log('✅ Configuration validated successfully');
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🌐 Network: ${config.solana.network}`);
  console.log(`⚡ Jito Mode: ${config.jito.enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`🤖 Telegram Admins: ${config.telegram.adminIds.length}`);
}

/**
 * Type-safe config export
 */
export type Config = typeof config;

export default config;