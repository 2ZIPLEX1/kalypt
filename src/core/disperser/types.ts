import { Keypair } from '@solana/web3.js';

/**
 * Hard disperse configuration
 */
export interface HardDisperseConfig {
  projectId: number;
  targetWalletIds: number[]; // Wallets to fund
  totalAmount: number; // Total SOL to distribute
  minAmount: number; // Min SOL per wallet
  maxAmount: number; // Max SOL per wallet
}

/**
 * Temporary wallet info
 */
export interface TempWallet {
  keypair: Keypair;
  address: string;
  privateKey: string;
}

/**
 * Disperse result
 */
export interface DisperseResult {
  tempWallet: TempWallet;
  distributions: WalletDistribution[];
  totalDistributed: number;
  transactionSignatures: string[];
  success: boolean;
  error?: string;
}

/**
 * Wallet distribution
 */
export interface WalletDistribution {
  walletId: number;
  address: string;
  amount: number;
  signature?: string;
  success: boolean;
  error?: string;
}

/**
 * Distribution layer
 */
export interface DistributionLayer {
  layerNumber: number;
  wallets: LayerWallet[];
}

/**
 * Layer wallet
 */
export interface LayerWallet {
  keypair: Keypair;
  address: string;
  amountToReceive: number;
  targetsToFund: number[]; // Wallet IDs to fund in next layer
  amountsToSend: number[];
}

/**
 * Disperse preview
 */
export interface DispersePreview {
  totalAmount: number;
  walletCount: number;
  distributions: {
    walletId: number;
    address: string;
    amount: number;
  }[];
  averageAmount: number;
  minAmount: number;
  maxAmount: number;
}

/**
 * Get SOL back options
 */
export interface GetSolBackOptions {
  projectId: number;
  destinationAddress: string;
  includeWalletIds?: number[]; // If not provided, collects from all wallets
}

/**
 * Get SOL back result
 */
export interface GetSolBackResult {
  totalCollected: number;
  successfulTransfers: number;
  failedTransfers: number;
  transactionSignatures: string[];
  details: {
    walletId: number;
    address: string;
    amount: number;
    signature?: string;
    success: boolean;
    error?: string;
  }[];
}