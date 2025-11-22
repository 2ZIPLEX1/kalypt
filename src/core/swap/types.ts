import { PublicKey } from '@solana/web3.js';

/**
 * Swap type
 */
export type SwapType = 'buy' | 'sell';

/**
 * Swap options
 */
export interface SwapOptions {
  projectId: number;
  walletIds: number[];
  tokenAddress: string;
  type: SwapType;
  amountSol?: number; // For buy
  amountTokens?: number; // For sell
  percentage?: number; // For sell (0-100)
  slippage?: number; // Slippage tolerance (0-100)
  useJito?: boolean;
  jitoTip?: number;
}

/**
 * Single wallet swap options
 */
export interface SingleSwapOptions {
  walletId: number;
  tokenAddress: string;
  type: SwapType;
  amountSol?: number;
  amountTokens?: number;
  percentage?: number;
  slippage?: number;
}

/**
 * Swap result
 */
export interface SwapResult {
  walletId: number;
  signature: string;
  type: SwapType;
  amountIn: number;
  amountOut: number;
  success: boolean;
  error?: string;
}

/**
 * Batch swap result
 */
export interface BatchSwapResult {
  successful: SwapResult[];
  failed: SwapResult[];
  totalSuccess: number;
  totalFailed: number;
}

/**
 * Token balance
 */
export interface TokenBalance {
  walletId: number;
  address: string;
  solBalance: number;
  tokenBalance: number;
  tokenValueSol: number;
}

/**
 * Swap statistics
 */
export interface SwapStats {
  projectId: number;
  tokenAddress: string;
  totalBuys: number;
  totalSells: number;
  totalBoughtSol: number;
  totalSoldSol: number;
  totalVolumeUsd: number;
  holdingPercentage: number;
  worthSol: number;
  worthUsd: number;
  profit: number;
  profitUsd: number;
  profitPercentage: number;
}

/**
 * Pool info (Raydium/Jupiter)
 */
export interface PoolInfo {
  address: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseReserve: number;
  quoteReserve: number;
  lpSupply: number;
  price: number;
}

/**
 * Quote result (from Jupiter)
 */
export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: number;
  outAmount: number;
  priceImpactPct: number;
  route: any[];
}

/**
 * Interval swap config
 */
export interface IntervalSwapConfig {
  projectId: number;
  walletIds: number[];
  tokenAddress: string;
  type: SwapType;
  amountPerSwap: number;
  intervalSeconds: number;
  totalSwaps: number;
}

/**
 * Interval swap status
 */
export interface IntervalSwapStatus {
  active: boolean;
  completed: number;
  remaining: number;
  nextSwapAt?: Date;
}