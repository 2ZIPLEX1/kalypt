/**
 * Warmup mode
 */
export type WarmupMode = 'soft' | 'hard';

/**
 * Warmup transaction type
 */
export type WarmupTxType = 
  | 'transfer'      // SOL transfer between wallets
  | 'swap'          // Token swap (SOL ↔ USDC)
  | 'token_transfer' // Token transfer
  | 'nft_interaction' // NFT mint/transfer
  | 'random';       // Random activity

/**
 * Warmup configuration
 */
export interface WarmupConfig {
  projectId: number;
  walletIds: number[];
  mode: WarmupMode;
  transactionsPerWallet: {
    min: number;
    max: number;
  };
  amountRange: {
    min: number; // SOL
    max: number; // SOL
  };
  delayBetweenTx: {
    min: number; // seconds
    max: number; // seconds
  };
  txTypes?: WarmupTxType[]; // If not specified, uses random
}

/**
 * Warmup result
 */
export interface WarmupResult {
  walletResults: WalletWarmupResult[];
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalSpent: number;
  duration: number; // milliseconds
}

/**
 * Wallet warmup result
 */
export interface WalletWarmupResult {
  walletId: number;
  address: string;
  transactions: WarmupTransaction[];
  totalTx: number;
  successfulTx: number;
  failedTx: number;
  totalSpent: number;
}

/**
 * Warmup transaction
 */
export interface WarmupTransaction {
  type: WarmupTxType;
  signature: string;
  amount: number;
  from: string;
  to: string;
  success: boolean;
  error?: string;
  timestamp: Date;
}

/**
 * Warmup progress callback
 */
export type WarmupProgressCallback = (
  walletId: number,
  progress: number,
  currentTx: number,
  totalTx: number
) => void | Promise<void>;

/**
 * Warmup stats
 */
export interface WarmupStats {
  totalWallets: number;
  warmedWallets: number;
  averageTxPerWallet: number;
  totalSpent: number;
  estimatedTime: number; // seconds
}