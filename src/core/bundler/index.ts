import {
  Keypair,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  PublicKey,
} from '@solana/web3.js';
import { connection, keypairFromPrivateKey } from '../../utils/solana';
import { WalletModel } from '../../db/models/wallet';
import { TransactionModel } from '../../db/models/transaction';
import { JITO_TIP_ACCOUNTS, JITO_BUNDLE_CONFIG } from '../../constants/jito';
import config from '../../config';
import logger from '../../utils/logger';
import {
  BundleConfig,
  BundleTransaction,
  BundleResult,
  BundleTransactionResult,
  JitoBundleResponse,
  JitoBundleStatus,
  BundleBuyConfig,
  BundleSellConfig,
  SmartBundleSelection,
} from './types';

/**
 * Bundle Creator
 * 
 * Handles Jito bundle operations for atomic transaction execution:
 * - Bundle buy (multiple wallets buy simultaneously)
 * - Bundle sell (multiple wallets sell simultaneously)
 * - Anti-MEV protection
 * - Smart wallet selection
 * - Bundle status tracking
 * 
 * Jito bundles ensure all transactions execute atomically or none execute.
 */
export class BundleCreator {
  private readonly JITO_ENDPOINTS = [
    'https://mainnet.block-engine.jito.wtf',
    'https://amsterdam.mainnet.block-engine.jito.wtf',
    'https://frankfurt.mainnet.block-engine.jito.wtf',
    'https://ny.mainnet.block-engine.jito.wtf',
    'https://tokyo.mainnet.block-engine.jito.wtf',
  ];
  
  private currentEndpointIndex = 0;
  
  /**
   * Get current Jito endpoint (with rotation)
   */
  private getJitoEndpoint(): string {
    const endpoint = this.JITO_ENDPOINTS[this.currentEndpointIndex];
    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.JITO_ENDPOINTS.length;
    return endpoint;
  }
  
  /**
   * Execute bundle buy
   * 
   * All wallets buy simultaneously in one atomic bundle
   */
  async executeBundleBuy(bundleConfig: BundleBuyConfig): Promise<BundleResult> {
    try {
      logger.info('Starting bundle buy', {
        projectId: bundleConfig.projectId,
        walletCount: bundleConfig.walletIds.length,
        amountPerWallet: bundleConfig.amountPerWallet,
      });
      
      // Build buy transactions for each wallet
      const bundleTxs: BundleTransaction[] = [];
      
      for (const walletId of bundleConfig.walletIds) {
        try {
          const tx = await this.buildBuyTransaction(
            walletId,
            bundleConfig.tokenAddress,
            bundleConfig.amountPerWallet,
            bundleConfig.slippage
          );
          
          bundleTxs.push(tx);
        } catch (error) {
          logger.error('Failed to build buy transaction', { walletId, error });
        }
      }
      
      if (bundleTxs.length === 0) {
        throw new Error('No valid transactions to bundle');
      }
      
      // Execute bundle
      return await this.executeBundle({
        projectId: bundleConfig.projectId,
        walletIds: bundleConfig.walletIds,
        tokenAddress: bundleConfig.tokenAddress,
        type: 'buy',
        amountPerWallet: bundleConfig.amountPerWallet,
        jitoTipLamports: bundleConfig.jitoTip ? bundleConfig.jitoTip * 1e9 : undefined,
      });
    } catch (error) {
      logger.error('Bundle buy failed', { bundleConfig, error });
      throw error;
    }
  }
  
  /**
   * Execute bundle sell
   */
  async executeBundleSell(bundleConfig: BundleSellConfig): Promise<BundleResult> {
    try {
      logger.info('Starting bundle sell', {
        projectId: bundleConfig.projectId,
        walletCount: bundleConfig.walletIds.length,
        percentage: bundleConfig.percentage,
      });
      
      // Build sell transactions
      const bundleTxs: BundleTransaction[] = [];
      
      for (const walletId of bundleConfig.walletIds) {
        try {
          const tx = await this.buildSellTransaction(
            walletId,
            bundleConfig.tokenAddress,
            bundleConfig.percentage,
            bundleConfig.slippage
          );
          
          bundleTxs.push(tx);
        } catch (error) {
          logger.error('Failed to build sell transaction', { walletId, error });
        }
      }
      
      if (bundleTxs.length === 0) {
        throw new Error('No valid transactions to bundle');
      }
      
      // Execute bundle
      return await this.executeBundle({
        projectId: bundleConfig.projectId,
        walletIds: bundleConfig.walletIds,
        tokenAddress: bundleConfig.tokenAddress,
        type: 'sell',
        jitoTipLamports: bundleConfig.jitoTip ? bundleConfig.jitoTip * 1e9 : undefined,
      });
    } catch (error) {
      logger.error('Bundle sell failed', { bundleConfig, error });
      throw error;
    }
  }
  
  /**
   * Execute bundle
   */
  private async executeBundle(bundleConfig: BundleConfig): Promise<BundleResult> {
    try {
      // Build transactions
      const transactions: Transaction[] = [];
      const walletKeypairs: Keypair[] = [];
      
      for (const walletId of bundleConfig.walletIds) {
        const wallet = await WalletModel.getWithPrivateKey(walletId);
        
        if (!wallet || !wallet.private_key) {
          logger.error('Cannot decrypt wallet', { walletId });
          continue;
        }
        
        const keypair = keypairFromPrivateKey(wallet.private_key);
        walletKeypairs.push(keypair);
        
        // Build transaction (mock for now)
        const tx = await this.buildMockTransaction(keypair);
        transactions.push(tx);
      }
      
      if (transactions.length === 0) {
        throw new Error('No valid transactions to bundle');
      }
      
      // Add Jito tip to last transaction
      const tipAmount = bundleConfig.jitoTipLamports || JITO_BUNDLE_CONFIG.DEFAULT_TIP;
      await this.addJitoTip(transactions[transactions.length - 1], walletKeypairs[walletKeypairs.length - 1], tipAmount);
      
      // Sign all transactions
      for (let i = 0; i < transactions.length; i++) {
        transactions[i].sign(walletKeypairs[i]);
      }
      
      // Send bundle to Jito
      logger.info('Sending bundle to Jito', {
        transactionCount: transactions.length,
        tipAmount,
      });
      
      const bundleId = await this.sendBundle(transactions);
      
      logger.info('Bundle sent', { bundleId });
      
      // Wait for bundle confirmation
      const confirmed = await this.waitForBundleConfirmation(bundleId);
      
      if (!confirmed) {
        throw new Error('Bundle confirmation timeout');
      }
      
      // Get transaction signatures
      const signatures = transactions.map(tx => {
        // Extract signature from transaction
        return tx.signature ? tx.signature.toString('base64') : '';
      });
      
      // Save transactions to DB
      for (let i = 0; i < bundleConfig.walletIds.length; i++) {
        await TransactionModel.create({
          project_id: bundleConfig.projectId,
          wallet_id: bundleConfig.walletIds[i],
          signature: signatures[i] || `bundle_${bundleId}_${i}`,
          type: bundleConfig.type === 'mixed' ? 'buy' : bundleConfig.type, // Convert mixed to buy
          amount: bundleConfig.amountPerWallet || 0,
          token_address: bundleConfig.tokenAddress,
          status: 'confirmed',
          metadata: { bundleId, bundleIndex: i },
        });
      }
      
      const details: BundleTransactionResult[] = bundleConfig.walletIds.map((walletId, i) => ({
        walletId,
        signature: signatures[i] || `bundle_${bundleId}_${i}`,
        success: true,
      }));
      
      return {
        bundleId,
        success: true,
        transactionSignatures: signatures,
        details,
      };
    } catch (error) {
      logger.error('Bundle execution failed', { bundleConfig, error });
      
      return {
        bundleId: '',
        success: false,
        transactionSignatures: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        details: [],
      };
    }
  }
  
  /**
   * Build buy transaction (mock)
   * 
   * TODO: Implement actual Jupiter/Raydium swap
   */
  private async buildBuyTransaction(
    walletId: number,
    _tokenAddress: string,
    _amount: number,
    _slippage?: number
  ): Promise<BundleTransaction> {
    const wallet = await WalletModel.getWithPrivateKey(walletId);
    
    if (!wallet || !wallet.private_key) {
      throw new Error('Cannot decrypt wallet');
    }
    
    const keypair = keypairFromPrivateKey(wallet.private_key);
    const transaction = await this.buildMockTransaction(keypair);
    
    return {
      walletId,
      transaction,
      description: 'Buy transaction',
    };
  }
  
  /**
   * Build sell transaction (mock)
   * 
   * TODO: Implement actual Jupiter/Raydium swap
   */
  private async buildSellTransaction(
    walletId: number,
    _tokenAddress: string,
    _percentage: number,
    _slippage?: number
  ): Promise<BundleTransaction> {
    const wallet = await WalletModel.getWithPrivateKey(walletId);
    
    if (!wallet || !wallet.private_key) {
      throw new Error('Cannot decrypt wallet');
    }
    
    const keypair = keypairFromPrivateKey(wallet.private_key);
    const transaction = await this.buildMockTransaction(keypair);
    
    return {
      walletId,
      transaction,
      description: 'Sell transaction',
    };
  }
  
  /**
   * Build mock transaction (placeholder)
   */
  private async buildMockTransaction(keypair: Keypair): Promise<Transaction> {
    const transaction = new Transaction();
    
    // Add compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: config.compute.unitLimit,
      })
    );
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.compute.unitPrice,
      })
    );
    
    // Mock transfer to self
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: keypair.publicKey,
        lamports: 1,
      })
    );
    
    // Set fee payer and blockhash
    transaction.feePayer = keypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    return transaction;
  }
  
  /**
   * Add Jito tip to transaction
   */
  private async addJitoTip(
    transaction: Transaction,
    payer: Keypair,
    tipLamports: number
  ): Promise<void> {
    // Jito tip addresses (random selection)
    const randomTipAccount = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: randomTipAccount,
        lamports: tipLamports,
      })
    );
  }
  
  /**
   * Send bundle to Jito
   */
  private async sendBundle(transactions: Transaction[]): Promise<string> {
    try {
      const endpoint = this.getJitoEndpoint();
      
      // Serialize transactions
      const serializedTxs = transactions.map(tx => 
        Buffer.from(tx.serialize()).toString('base64')
      );
      
      // Send to Jito
      const response = await fetch(`${endpoint}/api/v1/bundles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: [serializedTxs],
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Jito bundle submission failed: ${response.statusText}`);
      }
      
      const data = await response.json() as JitoBundleResponse;
      
      if (!data.result) {
        throw new Error('No bundle ID returned from Jito');
      }
      
      return data.result;
    } catch (error) {
      logger.error('Failed to send bundle to Jito', { error });
      throw error;
    }
  }
  
  /**
   * Wait for bundle confirmation
   */
  private async waitForBundleConfirmation(
    bundleId: string,
    maxAttempts: number = 30
  ): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await this.getBundleStatus(bundleId);
        
        if (status && status.value.length > 0) {
          const bundle = status.value[0];
          
          if (bundle.confirmation_status === 'confirmed' || bundle.confirmation_status === 'finalized') {
            logger.info('Bundle confirmed', {
              bundleId,
              slot: bundle.slot,
              status: bundle.confirmation_status,
            });
            return true;
          }
          
          if (bundle.err) {
            logger.error('Bundle failed', {
              bundleId,
              error: bundle.err,
            });
            return false;
          }
        }
        
        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error('Failed to check bundle status', { bundleId, error });
      }
    }
    
    logger.warn('Bundle confirmation timeout', { bundleId });
    return false;
  }
  
  /**
   * Get bundle status from Jito
   */
  private async getBundleStatus(bundleId: string): Promise<JitoBundleStatus | null> {
    try {
      const endpoint = this.getJitoEndpoint();
      
      const response = await fetch(`${endpoint}/api/v1/bundles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBundleStatuses',
          params: [[bundleId]],
        }),
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json() as { result: JitoBundleStatus };
      return data.result;
    } catch (error) {
      logger.error('Failed to get bundle status', { bundleId, error });
      return null;
    }
  }
  
  /**
   * Smart bundle selection
   * 
   * Selects best wallets for bundle based on balance
   */
  async selectWalletsForBundle(
    projectId: number,
    targetAmount: number,
    maxWallets: number = 15
  ): Promise<SmartBundleSelection> {
    try {
      // Get all project wallets
      const wallets = await WalletModel.findByProjectId(projectId);
      
      // Filter bundle wallets with balance
      const bundleWallets = wallets.filter(w => w.wallet_type === 'bundle');
      
      // Get balances
      const walletsWithBalance = await Promise.all(
        bundleWallets.map(async (w) => {
          const balance = await connection.getBalance(
            new PublicKey(w.address)
          );
          return {
            ...w,
            balance: balance / 1e9,
          };
        })
      );
      
      // Sort by balance descending
      walletsWithBalance.sort((a, b) => b.balance - a.balance);
      
      // Select top wallets
      const selected = walletsWithBalance.slice(0, maxWallets);
      
      // Calculate allocation (80% of balance per wallet)
      const utilizationPercent = 80;
      const allocations = selected.map(w => ({
        walletId: w.id,
        address: w.address,
        balance: w.balance,
        allocatedAmount: (w.balance * utilizationPercent) / 100,
        utilizationPercent,
      }));
      
      const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
      const achievedPercent = (totalAllocated / targetAmount) * 100;
      
      return {
        selectedWallets: allocations,
        totalAllocated,
        targetAmount,
        achievedPercent,
      };
    } catch (error) {
      logger.error('Failed to select wallets for bundle', { projectId, error });
      throw error;
    }
  }
}

// Export singleton instance
export default new BundleCreator();