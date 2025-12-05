import { Keypair, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { connection, keypairFromPrivateKey } from '../../utils/solana';
import { WalletModel } from '../../db/models/wallet';
import { solToLamports } from '../../constants/solana';
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
 * Manual implementation of getAssociatedTokenAddress for old @solana/spl-token version
 */
async function getAssociatedTokenAddressManual(
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const [address] = await PublicKey.findProgramAddress(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

/**
 * Wallet Warmup Service
 * 
 * Generates natural-looking transaction history to avoid bot detection:
 * 
 * Soft Mode:
 * - Simple SOL transfers between project wallets
 * - Random amounts and delays
 * - 5-10 transactions per wallet
 * 
 * Hard Mode:
 * - Multiple transaction types (transfers, swaps, token interactions)
 * - Variable amounts and delays
 * - 10-20 transactions per wallet
 * - More realistic patterns
 */
export class WalletWarmupService {
  /**
   * Execute wallet warmup
   */
  async warmup(
    config: WarmupConfig,
    callback?: WarmupProgressCallback
  ): Promise<WarmupResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting wallet warmup', {
        projectId: config.projectId,
        walletCount: config.walletIds.length,
        mode: config.mode,
      });
      
      const walletResults: WalletWarmupResult[] = [];
      
      // Warmup each wallet
      for (const walletId of config.walletIds) {
        try {
          const result = await this.warmupWallet(walletId, config, callback);
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
      
      // Calculate totals
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
      logger.error('Warmup failed', { config, error });
      throw error;
    }
  }
  
  /**
   * Warmup single wallet
   */
  private async warmupWallet(
    walletId: number,
    config: WarmupConfig,
    callback?: WarmupProgressCallback
  ): Promise<WalletWarmupResult> {
    const wallet = await WalletModel.getWithPrivateKey(walletId);
    
    if (!wallet || !wallet.private_key) {
      throw new Error('Cannot decrypt wallet');
    }
    
    const keypair = keypairFromPrivateKey(wallet.private_key);
    
    // Determine number of transactions
    const txCount = this.randomInRange(
      config.transactionsPerWallet.min,
      config.transactionsPerWallet.max
    );
    
    logger.info('Warming up wallet', {
      walletId,
      address: wallet.address,
      txCount,
    });
    
    const transactions: WarmupTransaction[] = [];
    let totalSpent = 0;
    
    // Execute transactions
    for (let i = 0; i < txCount; i++) {
      try {
        // Select random tx type
        const txType = this.selectTxType(config);
        
        // Execute transaction
        const tx = await this.executeWarmupTx(
          keypair,
          wallet.address,
          txType,
          config
        );
        
        transactions.push(tx);
        
        if (tx.success) {
          totalSpent += tx.amount;
        }
        
        // Progress callback
        if (callback) {
          await callback(walletId, (i + 1) / txCount, i + 1, txCount);
        }
        
        // Random delay before next tx
        if (i < txCount - 1) {
          const delay = this.randomInRange(
            config.delayBetweenTx.min,
            config.delayBetweenTx.max
          );
          await this.sleep(delay);
        }
      } catch (error) {
        logger.error('Warmup transaction failed', { walletId, error });
        
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
  
  /**
   * Select transaction type based on config
   */
  private selectTxType(config: WarmupConfig): WarmupTxType {
    if (!config.txTypes || config.txTypes.length === 0) {
      // Default types for each mode
      const types: WarmupTxType[] = config.mode === 'soft'
        ? ['transfer']
        : ['transfer', 'swap', 'token_transfer'];
      
      return types[Math.floor(Math.random() * types.length)];
    }
    
    return config.txTypes[Math.floor(Math.random() * config.txTypes.length)];
  }
  
  /**
   * Execute warmup transaction
   */
  private async executeWarmupTx(
    keypair: Keypair,
    fromAddress: string,
    txType: WarmupTxType,
    config: WarmupConfig
  ): Promise<WarmupTransaction> {
    const amount = this.randomInRange(
      config.amountRange.min,
      config.amountRange.max
    );
    
    try {
      switch (txType) {
        case 'transfer':
          return await this.executeTransfer(keypair, fromAddress, amount);
        
        case 'swap':
          return await this.executeSwap(keypair, fromAddress, amount);
        
        case 'token_transfer':
          return await this.executeTokenTransfer(keypair, fromAddress, amount);
        
        default:
          return await this.executeTransfer(keypair, fromAddress, amount);
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Execute SOL transfer (to self or random address)
   */
  private async executeTransfer(
    keypair: Keypair,
    fromAddress: string,
    amount: number
  ): Promise<WarmupTransaction> {
    try {
      // Transfer to self (looks like wallet activity)
      const toAddress = keypair.publicKey;
      
      const transaction = new Transaction().add(
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
      throw error;
    }
  }
  
  /**
   * Execute swap (placeholder - requires DEX integration)
   */
  private async executeSwap(
    keypair: Keypair,
    fromAddress: string,
    amount: number
  ): Promise<WarmupTransaction> {
    // TODO: Implement actual swap through Raydium/Jupiter
    logger.warn('Swap not implemented, falling back to transfer', {
      address: fromAddress,
    });
    
    return await this.executeTransfer(keypair, fromAddress, amount);
  }
  
  /**
   * Execute token transfer (placeholder)
   */
  private async executeTokenTransfer(
    keypair: Keypair,
    fromAddress: string,
    amount: number
  ): Promise<WarmupTransaction> {
    // TODO: Implement token transfer
    logger.warn('Token transfer not implemented, falling back to transfer', {
      address: fromAddress,
    });
    
    return await this.executeTransfer(keypair, fromAddress, amount);
  }
  
  /**
   * Calculate warmup stats
   */
  async calculateStats(config: WarmupConfig): Promise<WarmupStats> {
    const avgTx = (config.transactionsPerWallet.min + config.transactionsPerWallet.max) / 2;
    const avgAmount = (config.amountRange.min + config.amountRange.max) / 2;
    const avgDelay = (config.delayBetweenTx.min + config.delayBetweenTx.max) / 2;
    
    const totalWallets = config.walletIds.length;
    const totalTx = totalWallets * avgTx;
    const totalSpent = totalTx * avgAmount;
    const estimatedTime = totalTx * avgDelay;
    
    return {
      totalWallets,
      warmedWallets: 0, // Will be updated after warmup
      averageTxPerWallet: avgTx,
      totalSpent,
      estimatedTime,
    };
  }
  
  /**
   * Random number in range
   */
  private randomInRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
  
  /**
   * Sleep helper
   */
  private sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
}

// Export singleton instance
export default new WalletWarmupService();

// Export types
export * from './types';