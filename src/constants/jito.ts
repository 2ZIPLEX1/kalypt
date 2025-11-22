import { PublicKey } from '@solana/web3.js';
import { LAMPORTS } from './solana';

/**
 * Jito Block Engine Endpoints
 * Source: jito-ts documentation and bundler references
 */
export const JITO_ENDPOINTS = {
  // Mainnet block engines (regional)
  MAINNET: {
    AMSTERDAM: 'https://amsterdam.mainnet.block-engine.jito.wtf',
    FRANKFURT: 'https://frankfurt.mainnet.block-engine.jito.wtf',
    NEW_YORK: 'https://ny.mainnet.block-engine.jito.wtf',
    SALT_LAKE_CITY: 'https://slc.mainnet.block-engine.jito.wtf',
    TOKYO: 'https://tokyo.mainnet.block-engine.jito.wtf',
  },
  
  // Default endpoint
  DEFAULT: 'https://mainnet.block-engine.jito.wtf',
  
  // All endpoints for fallback
  ALL_MAINNET: [
    'https://amsterdam.mainnet.block-engine.jito.wtf',
    'https://frankfurt.mainnet.block-engine.jito.wtf',
    'https://ny.mainnet.block-engine.jito.wtf',
    'https://slc.mainnet.block-engine.jito.wtf',
    'https://tokyo.mainnet.block-engine.jito.wtf',
  ],
};

/**
 * Jito Tip Accounts
 * These are the accounts that receive Jito tips for priority bundle execution
 * Updated periodically by Jito - check: https://jito-labs.gitbook.io/mev/jito-bundles/tip-accounts
 */
export const JITO_TIP_ACCOUNTS = [
  new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5'),
  new PublicKey('HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe'),
  new PublicKey('Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY'),
  new PublicKey('ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49'),
  new PublicKey('DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh'),
  new PublicKey('ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt'),
  new PublicKey('DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL'),
  new PublicKey('3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'),
];

/**
 * Get random tip account
 */
export function getRandomTipAccount(): PublicKey {
  const randomIndex = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return JITO_TIP_ACCOUNTS[randomIndex];
}

/**
 * Jito Bundle Configuration
 */
export const JITO_BUNDLE_CONFIG = {
  // Maximum transactions per bundle
  MAX_TRANSACTIONS_PER_BUNDLE: 5,
  
  // Minimum tip amount (lamports) - 0.0001 SOL
  MIN_TIP: 0.0001 * LAMPORTS.PER_SOL,
  
  // Default tip amount (lamports) - 0.01 SOL
  DEFAULT_TIP: 0.01 * LAMPORTS.PER_SOL,
  
  // Maximum tip amount (lamports) - 0.1 SOL
  MAX_TIP: 0.1 * LAMPORTS.PER_SOL,
  
  // Bundle timeout (ms)
  TIMEOUT: 30000,
  
  // Max retries for bundle submission
  MAX_RETRIES: 3,
  
  // Delay between retries (ms)
  RETRY_DELAY: 2000,
  
  // Status check interval (ms)
  STATUS_CHECK_INTERVAL: 1000,
  
  // Max status checks before timeout
  MAX_STATUS_CHECKS: 30,
};

/**
 * Jito Priority Fee Settings
 */
export const JITO_PRIORITY_FEE = {
  // Default priority fee (micro-lamports per compute unit)
  DEFAULT: 500000,
  
  // Minimum priority fee
  MIN: 100000,
  
  // Maximum priority fee
  MAX: 10000000,
  
  // Auto-tip multipliers based on network congestion
  AUTO_TIP_MULTIPLIERS: {
    LOW: 1.0,
    MEDIUM: 1.5,
    HIGH: 2.0,
    CRITICAL: 3.0,
  },
};

/**
 * Jito Bundle Status
 */
export enum JitoBundleStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  REJECTED = 'rejected',
  TIMEOUT = 'timeout',
}

/**
 * Jito Settings (user-configurable, stored in DB per-user)
 */
export interface JitoSettings {
  enabled: boolean;
  autoTip: boolean;
  maxTip: number; // in SOL
  priorityFee: number; // micro-lamports
  preferredEndpoint?: string;
}

/**
 * Default Jito Settings
 */
export const DEFAULT_JITO_SETTINGS: JitoSettings = {
  enabled: true,
  autoTip: true,
  maxTip: 0.01,
  priorityFee: 0.0005 * LAMPORTS.PER_SOL,
  preferredEndpoint: JITO_ENDPOINTS.DEFAULT,
};

/**
 * Jito API Paths
 */
export const JITO_API_PATHS = {
  SEND_BUNDLE: '/api/v1/bundles',
  GET_BUNDLE_STATUSES: '/api/v1/bundles',
  GET_TIP_ACCOUNTS: '/api/v1/bundles/tip_accounts',
};

/**
 * Jito Error Codes
 */
export const JITO_ERROR_CODES = {
  BUNDLE_TOO_LARGE: 'BUNDLE_TOO_LARGE',
  INVALID_BUNDLE: 'INVALID_BUNDLE',
  SIMULATION_FAILED: 'SIMULATION_FAILED',
  INSUFFICIENT_TIP: 'INSUFFICIENT_TIP',
  RATE_LIMITED: 'RATE_LIMITED',
  NETWORK_ERROR: 'NETWORK_ERROR',
};

/**
 * Calculate optimal tip based on transaction value
 */
export function calculateOptimalTip(
  transactionValue: number,
  maxTip: number,
  autoTip: boolean
): number {
  if (!autoTip) {
    return maxTip * LAMPORTS.PER_SOL;
  }
  
  // Calculate 0.1% of transaction value
  const calculatedTip = transactionValue * 0.001;
  
  // Cap at maxTip
  const tipInSol = Math.min(calculatedTip, maxTip);
  
  // Ensure minimum tip
  const finalTip = Math.max(
    tipInSol * LAMPORTS.PER_SOL,
    JITO_BUNDLE_CONFIG.MIN_TIP
  );
  
  return Math.floor(finalTip);
}

/**
 * Select best endpoint based on region/latency
 */
export function selectBestEndpoint(
  preferredRegion?: 'EU' | 'US' | 'ASIA'
): string {
  switch (preferredRegion) {
    case 'EU':
      return JITO_ENDPOINTS.MAINNET.FRANKFURT;
    case 'US':
      return JITO_ENDPOINTS.MAINNET.NEW_YORK;
    case 'ASIA':
      return JITO_ENDPOINTS.MAINNET.TOKYO;
    default:
      return JITO_ENDPOINTS.DEFAULT;
  }
}

/**
 * Get all endpoints for round-robin or fallback
 */
export function getAllEndpoints(): string[] {
  return JITO_ENDPOINTS.ALL_MAINNET;
}

/**
 * Validate tip amount
 */
export function validateTipAmount(tipLamports: number): boolean {
  return (
    tipLamports >= JITO_BUNDLE_CONFIG.MIN_TIP &&
    tipLamports <= JITO_BUNDLE_CONFIG.MAX_TIP
  );
}

/**
 * Format tip amount for display
 */
export function formatTip(tipLamports: number): string {
  const sol = tipLamports / LAMPORTS.PER_SOL;
  return `${sol.toFixed(6)} SOL`;
}

/**
 * Get tip account info
 */
export function getTipAccountInfo(index: number): {
  address: PublicKey;
  index: number;
  total: number;
} {
  return {
    address: JITO_TIP_ACCOUNTS[index % JITO_TIP_ACCOUNTS.length],
    index: index % JITO_TIP_ACCOUNTS.length,
    total: JITO_TIP_ACCOUNTS.length,
  };
}

/**
 * Jito Bundle Builder Helper
 */
export interface JitoBundleOptions {
  tip?: number; // in lamports, if not provided will use auto-calculation
  maxRetries?: number;
  timeout?: number;
  endpoint?: string;
  priorityFee?: number;
}

/**
 * Get default bundle options
 */
export function getDefaultBundleOptions(
  userSettings?: Partial<JitoSettings>
): JitoBundleOptions {
  return {
    tip: userSettings?.maxTip
      ? userSettings.maxTip * LAMPORTS.PER_SOL
      : JITO_BUNDLE_CONFIG.DEFAULT_TIP,
    maxRetries: JITO_BUNDLE_CONFIG.MAX_RETRIES,
    timeout: JITO_BUNDLE_CONFIG.TIMEOUT,
    endpoint: userSettings?.preferredEndpoint || JITO_ENDPOINTS.DEFAULT,
    priorityFee: userSettings?.priorityFee || JITO_PRIORITY_FEE.DEFAULT,
  };
}