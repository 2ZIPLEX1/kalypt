import { WalletType } from '../../db/models/wallet';

/**
 * Wallet creation options
 */
export interface CreateWalletOptions {
  projectId: number;
  walletType?: WalletType;
  label?: string;
}

/**
 * Wallet import options
 */
export interface ImportWalletOptions {
  projectId: number;
  privateKey: string; // base58 encoded
  walletType?: WalletType;
  label?: string;
}

/**
 * Wallet export format
 */
export interface WalletExport {
  address: string;
  privateKey: string;
  label?: string;
  walletType?: string;
}

/**
 * Wallet balance info
 */
export interface WalletBalanceInfo {
  walletId: number;
  address: string;
  solBalance: number;
  tokenBalances?: TokenBalance[];
}

/**
 * Token balance
 */
export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  uiAmount: number;
}

/**
 * Batch wallet creation result
 */
export interface BatchCreateResult {
  success: number;
  failed: number;
  wallets: any[]; // Wallet[]
}

/**
 * Batch wallet import result
 */
export interface BatchImportResult {
  success: any[]; // Wallet[]
  failed: string[];
  errors: { key: string; error: string }[];
}