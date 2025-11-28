import { VersionedTransaction } from '@solana/web3.js';

/**
 * Bundle type
 */
export type BundleType = 'buy' | 'sell' | 'mixed';

/**
 * Bundle configuration
 */
export interface BundleConfig {
  projectId: number;
  walletIds: number[];
  tokenAddress: string;
  type: BundleType;
  amountPerWallet?: number;
  jitoTipLamports?: number;
  maxRetries?: number;
}

/**
 * Bundle transaction
 */
export interface BundleTransaction {
  walletId: number;
  transaction: VersionedTransaction;
  description: string;
}

/**
 * Bundle result
 */
export interface BundleResult {
  bundleId: string;
  success: boolean;
  transactionSignatures: string[];
  landedSlot?: number;
  error?: string;
  details: BundleTransactionResult[];
}

/**
 * Individual transaction result in bundle
 */
export interface BundleTransactionResult {
  walletId: number;
  signature: string;
  success: boolean;
  error?: string;
}

/**
 * Jito bundle submission response
 */
export interface JitoBundleResponse {
  jsonrpc: string;
  result: string;
  id: number;
}

/**
 * Jito bundle status
 */
export interface JitoBundleStatus {
  context: {
    slot: number;
  };
  value: {
    bundle_id: string;
    transactions: string[];
    slot: number;
    confirmation_status: 'processed' | 'confirmed' | 'finalized';
    err: any;
  }[];
}

/**
 * Bundle buy configuration
 */
export interface BundleBuyConfig {
  projectId: number;
  tokenAddress: string;
  walletIds: number[];
  amountPerWallet: number;
  slippage?: number;
  jitoTip?: number;
}

/**
 * Bundle sell configuration
 */
export interface BundleSellConfig {
  projectId: number;
  tokenAddress: string;
  walletIds: number[];
  percentage: number;
  slippage?: number;
  jitoTip?: number;
}

/**
 * Smart bundle selection
 */
export interface SmartBundleSelection {
  selectedWallets: {
    walletId: number;
    address: string;
    balance: number;
    allocatedAmount: number;
    utilizationPercent: number;
  }[];
  totalAllocated: number;
  targetAmount: number;
  achievedPercent: number;
}