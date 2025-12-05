import { 
  Keypair, 
  Transaction, 
  SystemProgram, 
  VersionedTransaction,
  PublicKey,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,  // ИСПРАВЛЕНО: Sync версия
  createTransferCheckedInstruction, // ИСПРАВЛЕНО: TransferChecked
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { connection, keypairFromPrivateKey } from '../../utils/solana';
import { WalletModel } from '../../db/models/wallet';
import { solToLamports } from '../../constants/solana';
import config from '../../config';
import logger from '../../utils/logger';
import {
  WarmupConfig,
  WarmupResult,
  WalletWarmupResult,
  WarmupTransaction,
  WarmupTxType,
  WarmupProgressCallback,
  WarmupStats,
} from './types';

/**
 * Jupiter API interfaces
 */
interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | any;
  priceImpactPct: string;
  routePlan: any[];
}

interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

/**
 * Wallet Warmup Service (Enhanced & Optimized)
 * 
 * Оптимизации комиссий:
 * - Минимальные compute units для transfers
 * - Приоритет transfers над swaps (дешевле в 50x)
 * - Задержки между транзакциями → низкий priority fee
 * - Batch processing вместо parallel
 */
export class WalletWarmupService {
  // Jupiter API
  private readonly JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
  private readonly JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
  
  // Token mints
  private readonly SOL_MINT = 'So11111111111111111111111111111111111111112';
  private readonly USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  
  // Retry settings
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_BASE = 2000;
  
  // Compute settings для минимизации комиссий
  private readonly COMPUTE_SETTINGS = {
    TRANSFER: {
      units: 600,      // Минимум для transfer
      price: 1,        // Lowest priority
    },
    SWAP: {
      units: 100000,
      price: 100000,   // Средний priority для swaps
    },
  };
  
  async warmup(
    warmupConfig: WarmupConfig,
    callback?: WarmupProgressCallback
  ): Promise<WarmupResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting wallet warmup', {
        projectId: warmupConfig.projectId,
        walletCount: warmupConfig.walletIds.length,
        mode: warmupConfig.mode,
      });
      
      const walletResults: WalletWarmupResult[] = [];
      
      for (const walletId of warmupConfig.walletIds) {
        try {
          const result = await this.warmupWallet(walletId, warmupConfig, callback);
          walletResults.push(result);
        } catch (error) {
          logger.error('Wallet warmup failed', { walletId, error });
          
          walletResults.push({
            walletId,
            address: '',
            transactions: [],
            totalTx: 0,
            successfulTx: 0,
            failedTx: 0,
            totalSpent: 0,
          });
        }
      }
      
      const totalTransactions = walletResults.reduce((sum, r) => sum + r.totalTx, 0);
      const successfulTransactions = walletResults.reduce((sum, r) => sum + r.successfulTx, 0);
      const failedTransactions = walletResults.reduce((sum, r) => sum + r.failedTx, 0);
      const totalSpent = walletResults.reduce((sum, r) => sum + r.totalSpent, 0);
      
      const duration = Date.now() - startTime;
      
      logger.info('Wallet warmup complete', {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        totalSpent,
        duration: `${duration}ms`,
      });
      
      return {
        walletResults,
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        totalSpent,
        duration,
      };
    } catch (error) {
      logger.error('Warmup failed', { warmupConfig, error });
      throw error;
    }
  }
  
  private async warmupWallet(
    walletId: number,
    warmupConfig: WarmupConfig,
    callback?: WarmupProgressCallback
  ): Promise<WalletWarmupResult> {
    const wallet = await WalletModel.getWithPrivateKey(walletId);
    
    if (!wallet || !wallet.private_key) {
      throw new Error('Cannot decrypt wallet');
    }
    
    const keypair = keypairFromPrivateKey(wallet.private_key);
    
    const txCount = Math.floor(this.randomInRange(
      warmupConfig.transactionsPerWallet.min,
      warmupConfig.transactionsPerWallet.max
    ));
    
    logger.info('Warming up wallet', {
      walletId,
      address: wallet.address,
      txCount,
      mode: warmupConfig.mode,
    });
    
    const transactions: WarmupTransaction[] = [];
    let totalSpent = 0;
    
    for (let i = 0; i < txCount; i++) {
      try {
        const txType = this.selectTxType(warmupConfig);
        const amount = this.randomInRange(
          warmupConfig.amountRange.min,
          warmupConfig.amountRange.max
        );
        
        const tx = await this.executeWarmupTx(
          keypair,
          wallet.address,
          txType,
          amount,
          warmupConfig
        );
        
        transactions.push(tx);
        
        if (tx.success) {
          totalSpent += tx.amount;
        }
        
        if (callback) {
          await callback(walletId, (i + 1) / txCount, i + 1, txCount);
        }
        
        if (i < txCount - 1) {
          const delay = this.randomInRange(
            warmupConfig.delayBetweenTx.min,
            warmupConfig.delayBetweenTx.max
          );
          await this.sleep(delay);
        }
      } catch (error) {
        logger.error('Warmup transaction failed', { walletId, i, error });
        
        transactions.push({
          type: 'random',
          signature: '',
          amount: 0,
          from: wallet.address,
          to: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }
    
    const successfulTx = transactions.filter(tx => tx.success).length;
    const failedTx = transactions.filter(tx => !tx.success).length;
    
    return {
      walletId,
      address: wallet.address,
      transactions,
      totalTx: txCount,
      successfulTx,
      failedTx,
      totalSpent,
    };
  }
  
  private selectTxType(warmupConfig: WarmupConfig): WarmupTxType {
    if (!warmupConfig.txTypes || warmupConfig.txTypes.length === 0) {
      const types: WarmupTxType[] = warmupConfig.mode === 'soft'
        ? ['transfer']
        : ['transfer', 'swap', 'token_transfer'];
      
      return types[Math.floor(Math.random() * types.length)];
    }
    
    return warmupConfig.txTypes[Math.floor(Math.random() * warmupConfig.txTypes.length)];
  }
  
  private async executeWarmupTx(
    keypair: Keypair,
    fromAddress: string,
    txType: WarmupTxType,
    amount: number, // ИСПРАВЛЕНО: добавлен параметр
    warmupConfig: WarmupConfig
  ): Promise<WarmupTransaction> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        logger.debug('Executing warmup tx', {
          type: txType,
          attempt,
          maxRetries: this.MAX_RETRIES,
        });
        
        switch (txType) {
          case 'transfer':
            return await this.executeTransfer(keypair, fromAddress, amount);
          
          case 'swap':
            return await this.executeSwap(keypair, fromAddress, amount);
          
          case 'token_transfer':
            return await this.executeTokenTransfer(keypair, fromAddress);
          
          default:
            return await this.executeTransfer(keypair, fromAddress, amount);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        logger.warn(`Warmup tx attempt ${attempt} failed`, {
          type: txType,
          attempt,
          error: lastError.message,
        });
        
        if (attempt < this.MAX_RETRIES) {
          const delay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
          await this.sleep(delay / 1000);
        }
      }
    }
    
    logger.error('All warmup tx retries failed, falling back to transfer', {
      type: txType,
      error: lastError?.message,
    });
    
    try {
      return await this.executeTransfer(keypair, fromAddress, amount * 0.1);
    } catch (error) {
      throw lastError || error;
    }
  }
  
  /**
   * Execute SOL transfer (оптимизирован для низких комиссий)
   */
  private async executeTransfer(
    keypair: Keypair,
    fromAddress: string,
    amount: number
  ): Promise<WarmupTransaction> {
    try {
      const toAddress = keypair.publicKey;
      
      const transaction = new Transaction();
      
      // ОПТИМИЗАЦИЯ: Минимальные compute units
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: this.COMPUTE_SETTINGS.TRANSFER.units,
        })
      );
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: this.COMPUTE_SETTINGS.TRANSFER.price,
        })
      );
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: toAddress,
          lamports: solToLamports(amount),
        })
      );
      
      transaction.feePayer = keypair.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      transaction.sign(keypair);
      
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }
      );
      
      await connection.confirmTransaction(signature, 'confirmed');
      
      logger.debug('Transfer executed', {
        signature,
        amount,
        from: fromAddress,
      });
      
      return {
        type: 'transfer',
        signature,
        amount,
        from: fromAddress,
        to: toAddress.toString(),
        success: true,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Transfer failed', { fromAddress, amount, error });
      throw error;
    }
  }
  
  private async executeSwap(
    keypair: Keypair,
    fromAddress: string,
    amount: number
  ): Promise<WarmupTransaction> {
    try {
      const swapDirection = Math.random() > 0.5 ? 'SOL_TO_USDC' : 'USDC_TO_SOL';
      
      let inputMint: string;
      let outputMint: string;
      let amountLamports: number;
      
      if (swapDirection === 'SOL_TO_USDC') {
        inputMint = this.SOL_MINT;
        outputMint = this.USDC_MINT;
        amountLamports = Math.floor(amount * 1e9);
      } else {
        const usdcBalance = await this.getTokenBalance(keypair.publicKey, new PublicKey(this.USDC_MINT));
        
        if (usdcBalance === 0) {
          logger.debug('No USDC balance, switching to SOL_TO_USDC');
          inputMint = this.SOL_MINT;
          outputMint = this.USDC_MINT;
          amountLamports = Math.floor(amount * 1e9);
        } else {
          inputMint = this.USDC_MINT;
          outputMint = this.SOL_MINT;
          const usdcToSwap = usdcBalance * (0.1 + Math.random() * 0.4);
          amountLamports = Math.floor(usdcToSwap * 1e6);
        }
      }
      
      logger.debug('Executing Jupiter swap', {
        direction: swapDirection,
        inputMint,
        outputMint,
        amount: amountLamports,
      });
      
      const quote = await this.getJupiterQuote(
        inputMint,
        outputMint,
        amountLamports,
        50
      );
      
      if (!quote) {
        throw new Error('Failed to get Jupiter quote');
      }
      
      const swapTxBase64 = await this.getJupiterSwapTransaction(
        quote,
        keypair.publicKey.toString()
      );
      
      if (!swapTxBase64) {
        throw new Error('Failed to get Jupiter swap transaction');
      }
      
      const swapTxBuffer = Buffer.from(swapTxBase64, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTxBuffer);
      
      transaction.sign([keypair]);
      
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        }
      );
      
      await connection.confirmTransaction(signature, 'confirmed');
      
      logger.info('Jupiter swap executed', {
        signature,
        direction: swapDirection,
        inputAmount: amountLamports,
        outputAmount: quote.outAmount,
      });
      
      return {
        type: 'swap',
        signature,
        amount,
        from: fromAddress,
        to: swapDirection === 'SOL_TO_USDC' ? 'USDC' : 'SOL',
        success: true,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Swap failed', { fromAddress, amount, error });
      throw error;
    }
  }
  
  /**
   * Execute token transfer (ИСПРАВЛЕНО)
   */
  private async executeTokenTransfer(
    keypair: Keypair,
    fromAddress: string
  ): Promise<WarmupTransaction> {
    try {
      const usdcMint = new PublicKey(this.USDC_MINT);
      const usdcBalance = await this.getTokenBalance(keypair.publicKey, usdcMint);
      
      if (usdcBalance === 0) {
        logger.debug('No USDC balance, cannot execute token transfer');
        throw new Error('No token balance available');
      }
      
      const transferPercent = 0.1 + Math.random() * 0.2;
      const amountToTransfer = Math.floor(usdcBalance * transferPercent * 1e6);
      
      if (amountToTransfer === 0) {
        throw new Error('Transfer amount too small');
      }
      
      // ИСПРАВЛЕНО: Sync версия
      const sourceATA = getAssociatedTokenAddressSync(
        usdcMint,
        keypair.publicKey
      );
      
      const destinationATA = getAssociatedTokenAddressSync(
        usdcMint,
        keypair.publicKey
      );
      
      // ИСПРАВЛЕНО: TransferChecked с decimals
      const transaction = new Transaction().add(
        createTransferCheckedInstruction(
          sourceATA,
          usdcMint,
          destinationATA,
          keypair.publicKey,
          amountToTransfer,
          6, // USDC decimals
          [],
          TOKEN_PROGRAM_ID
        )
      );
      
      transaction.feePayer = keypair.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      transaction.sign(keypair);
      
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }
      );
      
      await connection.confirmTransaction(signature, 'confirmed');
      
      logger.info('Token transfer executed', {
        signature,
        amount: amountToTransfer,
        token: 'USDC',
      });
      
      return {
        type: 'token_transfer',
        signature,
        amount: amountToTransfer / 1e6,
        from: fromAddress,
        to: fromAddress,
        success: true,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Token transfer failed', { fromAddress, error });
      throw error;
    }
  }
  
  private async getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number
  ): Promise<JupiterQuoteResponse | null> {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: (slippageBps * 100).toString(),
        onlyDirectRoutes: 'false',
        asLegacyTransaction: 'false',
      });
      
      const response = await fetch(`${this.JUPITER_QUOTE_API}?${params}`);
      
      if (!response.ok) {
        const error = await response.text();
        logger.warn('Jupiter quote failed', { status: response.status, error });
        return null;
      }
      
      const quote = await response.json() as JupiterQuoteResponse;
      return quote;
    } catch (error) {
      logger.error('Failed to get Jupiter quote', { error });
      return null;
    }
  }
  
  private async getJupiterSwapTransaction(
    quoteResponse: JupiterQuoteResponse,
    userPublicKey: string
  ): Promise<string | null> {
    try {
      const response = await fetch(this.JUPITER_SWAP_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: this.COMPUTE_SETTINGS.SWAP.price,
          dynamicComputeUnitLimit: true,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        logger.warn('Jupiter swap transaction failed', { status: response.status, error });
        return null;
      }
      
      const data = await response.json() as JupiterSwapResponse;
      return data.swapTransaction;
    } catch (error) {
      logger.error('Failed to get Jupiter swap transaction', { error });
      return null;
    }
  }
  
  private async getTokenBalance(
    walletPubkey: PublicKey,
    tokenMint: PublicKey
  ): Promise<number> {
    try {
      const accounts = await connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { mint: tokenMint }
      );
      
      if (accounts.value.length === 0) {
        return 0;
      }
      
      let totalBalance = 0;
      for (const account of accounts.value) {
        const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
        totalBalance += balance || 0;
      }
      
      return totalBalance;
    } catch (error) {
      logger.error('Failed to get token balance', { error });
      return 0;
    }
  }
  
  async calculateStats(warmupConfig: WarmupConfig): Promise<WarmupStats> {
    const avgTx = (warmupConfig.transactionsPerWallet.min + warmupConfig.transactionsPerWallet.max) / 2;
    const avgAmount = (warmupConfig.amountRange.min + warmupConfig.amountRange.max) / 2;
    const avgDelay = (warmupConfig.delayBetweenTx.min + warmupConfig.delayBetweenTx.max) / 2;
    
    const totalWallets = warmupConfig.walletIds.length;
    const totalTx = totalWallets * avgTx;
    const totalSpent = totalTx * avgAmount;
    const estimatedTime = totalTx * avgDelay;
    
    return {
      totalWallets,
      warmedWallets: 0,
      averageTxPerWallet: avgTx,
      totalSpent,
      estimatedTime,
    };
  }
  
  private randomInRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
  
  private sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
}

export default new WalletWarmupService();

export * from './types';