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
/**
 * Wallet Warmup Types
 */

/**
 * Режим warmup
 */
export type WarmupMode = 'soft' | 'hard';

/**
 * Тип warmup транзакции
 */
export type WarmupTxType = 
  | 'transfer'       // Простой перевод SOL
  | 'swap'           // Swap токенов
  | 'token_transfer' // Перевод токенов
  | 'interact'       // Взаимодействие с контрактом
  | 'random';        // Случайный тип

/**
 * Конфигурация Wallet Warmup
 */
export interface WarmupConfig {
  projectId: number;
  walletIds: number[];
  mode: WarmupMode; // Режим: soft (простые tx) или hard (сложные)
  transactionsPerWallet: {
    min: number; // Минимальное количество транзакций на кошелёк
    max: number; // Максимальное количество транзакций на кошелёк
  };
  amountRange: {
    min: number; // Минимальная сумма SOL на транзакцию
    max: number; // Максимальная сумма SOL на транзакцию
  };
  delayBetweenTx: {
    min: number; // Минимальная задержка между транзакциями (мс)
    max: number; // Максимальная задержка между транзакциями (мс)
  };
  txTypes?: WarmupTxType[]; // Типы транзакций для выполнения
}

/**
 * Warmup транзакция
 */
export interface WarmupTransaction {
  type: WarmupTxType;
  from: string;
  to?: string; // Для transfer и token_transfer
  signature: string;
  amount: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

/**
 * Результат warmup одного кошелька
 */
export interface WalletWarmupResult {
  walletId: number;
  address: string;
  transactions: WarmupTransaction[];
  totalTx: number;
  successfulTx: number;
  failedTx: number;
  totalSpent: number;
  duration?: number; // Время выполнения в мс (опционально)
  success?: boolean; // Общий статус (опционально)
  error?: string;
}

/**
 * Общий результат Warmup
 */
export interface WarmupResult {
  projectId?: number; // Опционально
  totalWallets?: number; // Опционально
  successfulWallets?: number; // Опционально
  failedWallets?: number; // Опционально
  walletResults: WalletWarmupResult[];
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalSpent: number;
  duration: number; // Время выполнения в мс
  success?: boolean; // Опционально
}

/**
 * Callback для прогресса warmup
 */
export type WarmupProgressCallback = (
  walletId: number,
  progress: number, // 0-100
  currentTx: number,
  totalTx: number
) => void;

/**
 * Статистика Warmup
 */
export interface WarmupStats {
  projectId?: number; // Опционально - может не быть при estimate
  totalWallets: number;
  warmedWallets: number;
  averageTxPerWallet: number; // Среднее количество транзакций на кошелёк
  totalSpent: number;
  estimatedTime?: number; // Примерное время выполнения в секундах (опционально)
  lastWarmup?: Date;
}