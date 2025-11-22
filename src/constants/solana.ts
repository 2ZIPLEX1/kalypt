import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/**
 * Pump.Fun Program Constants
 * Source: cicere/pumpfun-bundler and Tru3Bliss bundler
 */
export const PUMPFUN_PROGRAM = {
  // Main program ID
  PROGRAM_ID: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
  
  // Global state account
  GLOBAL: new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf'),
  
  // Fee recipient
  FEE_RECIPIENT: new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM'),
  
  // Event authority
  EVENT_AUTHORITY: new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1'),
  
  // Mint authority
  MINT_AUTHORITY: new PublicKey('TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM'),
  
  // System program
  SYSTEM_PROGRAM: new PublicKey('11111111111111111111111111111111'),
  
  // Token program
  TOKEN_PROGRAM: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  
  // Associated token program
  ASSOCIATED_TOKEN_PROGRAM: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
  
  // Rent
  RENT: new PublicKey('SysvarRent111111111111111111111111111111111'),
};

/**
 * Token Standards
 */
export const TOKEN_STANDARD = {
  // Default decimals for Pump.Fun tokens
  DECIMALS: 6,
  
  // Default supply (1 billion tokens)
  DEFAULT_SUPPLY: new BN(1_000_000_000).mul(new BN(10).pow(new BN(6))),
  
  // Minimum mint amount
  MIN_MINT_AMOUNT: new BN(1),
};

/**
 * Trading Constants
 */
export const TRADING = {
  // Minimum SOL for transaction fees
  MIN_SOL_BALANCE: 0.001,
  
  // Minimum SOL for wallet operations
  MIN_WALLET_SOL: 0.005,
  
  // Default slippage (15%)
  DEFAULT_SLIPPAGE_BPS: 1500,
  
  // Max slippage (50%)
  MAX_SLIPPAGE_BPS: 5000,
  
  // Basis points
  BPS_DENOMINATOR: 10000,
};

/**
 * Bundle Constants
 */
export const BUNDLE = {
  // Maximum wallets in a single bundle (from Tru3Bliss)
  MAX_BUNDLE_SIZE: 5,
  
  // Maximum wallets per project
  MAX_PROJECT_WALLETS: 100,
  
  // Default bundle timeout (30 seconds)
  TIMEOUT_MS: 30000,
  
  // Max retry attempts
  MAX_RETRIES: 3,
  
  // Retry delay (ms)
  RETRY_DELAY_MS: 1000,
};

/**
 * Transaction Constants
 */
export const TRANSACTION = {
  // Recent blockhash expiry (150 blocks ≈ 60 seconds)
  BLOCKHASH_CACHE_TTL: 60000,
  
  // Transaction confirmation timeout
  CONFIRMATION_TIMEOUT: 60000,
  
  // Preflight check
  SKIP_PREFLIGHT: false,
  
  // Max retries for failed transactions
  MAX_RETRIES: 3,
};

/**
 * Compute Budget Constants
 */
export const COMPUTE_BUDGET = {
  // Default compute unit limit
  DEFAULT_UNIT_LIMIT: 200000,
  
  // Default compute unit price (micro-lamports)
  DEFAULT_UNIT_PRICE: 500000,
  
  // Max compute unit limit
  MAX_UNIT_LIMIT: 1400000,
};

/**
 * Account Size Constants (for rent calculation)
 */
export const ACCOUNT_SIZE = {
  // Token account size
  TOKEN_ACCOUNT: 165,
  
  // Mint account size
  MINT_ACCOUNT: 82,
  
  // Metadata account size (approximate)
  METADATA_ACCOUNT: 679,
};

/**
 * Lamports Constants
 */
export const LAMPORTS = {
  // 1 SOL in lamports
  PER_SOL: 1_000_000_000,
  
  // Minimum rent exempt balance for token account
  MIN_RENT_EXEMPT: 2_039_280,
};

/**
 * API Endpoints
 */
export const ENDPOINTS = {
  // Pump.Fun API (for metadata upload)
  PUMPFUN_API: 'https://pump.fun/api',
  
  // IPFS gateways
  IPFS_GATEWAYS: [
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
  ],
};

/**
 * Pump.Fun Token Creation Fees (in lamports)
 */
export const PUMPFUN_FEES = {
  // Token creation fee
  CREATE_FEE: 0.02 * LAMPORTS.PER_SOL,
  
  // Additional fee for metadata
  METADATA_FEE: 0,
};

/**
 * Delays and Timing
 */
export const TIMING = {
  // Delay between transactions in sequence (ms)
  TRANSACTION_DELAY: 1000,
  
  // Delay between wallet warmup transactions
  WARMUP_DELAY_MIN: 2000,
  WARMUP_DELAY_MAX: 5000,
  
  // Delay between bundle attempts
  BUNDLE_RETRY_DELAY: 2000,
  
  // Polling interval for transaction confirmation
  POLL_INTERVAL: 1000,
};

/**
 * Network Constants
 */
export const NETWORK = {
  // Commitment levels
  COMMITMENT: 'confirmed' as const,
  PREFLIGHT_COMMITMENT: 'processed' as const,
  
  // Cluster endpoints
  MAINNET_BETA: 'https://api.mainnet-beta.solana.com',
  DEVNET: 'https://api.devnet.solana.com',
  TESTNET: 'https://api.testnet.solana.com',
};

/**
 * Wallet Warmup Constants
 */
export const WARMUP = {
  // Minimum transactions to appear "warm"
  MIN_TRANSACTIONS: 5,
  
  // Maximum transactions
  MAX_TRANSACTIONS: 15,
  
  // Min amount per warmup transaction (SOL)
  MIN_AMOUNT: 0.01,
  
  // Max amount per warmup transaction (SOL)
  MAX_AMOUNT: 0.05,
  
  // Popular tokens for warmup swaps
  POPULAR_TOKENS: [
    // Add popular Pump.Fun token addresses here
    // These will be used for realistic warmup transactions
  ],
};

/**
 * SOL Disperser Constants
 */
export const DISPERSER = {
  // Minimum SOL per wallet
  MIN_SOL_PER_WALLET: 0.05,
  
  // Maximum SOL per wallet
  MAX_SOL_PER_WALLET: 3.0,
  
  // Hard disperse chain depth (W0 → W1 → W2 → ...)
  HARD_DISPERSE_DEPTH: 3,
  
  // Delay between hard disperse transactions (ms)
  HARD_DISPERSE_DELAY: 2000,
};

/**
 * Launch Mode Constants
 */
export const LAUNCH_MODE = {
  BASIC: 'basic',
  BUNDLE: 'bundle',
  SNIPE: 'snipe',
  BUNDLE_SNIPE: 'bundle_snipe',
} as const;

export type LaunchMode = typeof LAUNCH_MODE[keyof typeof LAUNCH_MODE];

/**
 * Helper Functions
 */

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS.PER_SOL);
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS.PER_SOL;
}

/**
 * Calculate slippage amount
 */
export function calculateSlippage(amount: number, slippageBps: number): number {
  return Math.floor((amount * slippageBps) / TRADING.BPS_DENOMINATOR);
}

/**
 * Get random delay in range
 */
export function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}