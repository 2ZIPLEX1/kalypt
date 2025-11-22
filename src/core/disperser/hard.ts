import { Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { connection, keypairToBase58, keypairFromPrivateKey } from '../../utils/solana';
import { WalletModel } from '../../db/models/wallet';
import { ProjectModel } from '../../db/models/project';
import { UserModel } from '../../db/models/user';
import FeeManager from '../fees';
import logger from '../../utils/logger';
import {
  HardDisperseConfig,
  TempWallet,
  DisperseResult,
  WalletDistribution,
  DistributionLayer,
  LayerWallet,
  DispersePreview,
  GetSolBackOptions,
  GetSolBackResult,
} from './types';

/**
 * Hard Disperser
 * 
 * Implements multi-layer SOL distribution for maximum obfuscation:
 * 
 * Flow:
 * 1. User funds temporary wallet (W0)
 * 2. W0 distributes to intermediate wallets (Layer 1)
 * 3. Layer 1 wallets distribute to target wallets (Layer 2)
 * 4. Result: No direct connection between W0 and targets
 * 
 * This makes tracing impossible in bubble maps and chain explorers.
 */
export class HardDisperser {
  /**
   * Generate temporary wallet for user to fund
   */
  generateTempWallet(): TempWallet {
    const keypair = Keypair.generate();
    
    return {
      keypair,
      address: keypair.publicKey.toString(),
      privateKey: keypairToBase58(keypair),
    };
  }
  
  /**
   * Calculate distribution amounts
   * 
   * Randomly distributes total amount within min/max range
   */
  calculateDistribution(
    totalAmount: number,
    walletCount: number,
    minAmount: number,
    maxAmount: number
  ): number[] {
    const amounts: number[] = [];
    let remaining = totalAmount;
    
    for (let i = 0; i < walletCount - 1; i++) {
      // Calculate remaining wallets
      const remainingWallets = walletCount - i;
      
      // Random amount within constraints
      const min = Math.max(minAmount, remaining - (remainingWallets - 1) * maxAmount);
      const max = Math.min(maxAmount, remaining - (remainingWallets - 1) * minAmount);
      
      const amount = this.randomAmount(min, max);
      amounts.push(amount);
      remaining -= amount;
    }
    
    // Last wallet gets remaining
    amounts.push(remaining);
    
    return amounts;
  }
  
  /**
   * Generate random amount within range
   */
  private randomAmount(min: number, max: number): number {
    return Number((Math.random() * (max - min) + min).toFixed(9));
  }
  
  /**
   * Preview distribution before execution
   */
  async previewDistribution(config: HardDisperseConfig): Promise<DispersePreview> {
    try {
      // Get target wallets
      const wallets = await Promise.all(
        config.targetWalletIds.map(id => WalletModel.findById(id))
      );
      
      const validWallets = wallets.filter(w => w !== null);
      
      if (validWallets.length === 0) {
        throw new Error('No valid target wallets found');
      }
      
      // Calculate distribution
      const amounts = this.calculateDistribution(
        config.totalAmount,
        validWallets.length,
        config.minAmount,
        config.maxAmount
      );
      
      const distributions = validWallets.map((wallet, i) => ({
        walletId: wallet!.id,
        address: wallet!.address,
        amount: amounts[i],
      }));
      
      return {
        totalAmount: config.totalAmount,
        walletCount: validWallets.length,
        distributions,
        averageAmount: config.totalAmount / validWallets.length,
        minAmount: Math.min(...amounts),
        maxAmount: Math.max(...amounts),
      };
    } catch (error) {
      logger.error('Failed to preview distribution', { config, error });
      throw error;
    }
  }
  
  /**
   * Execute hard disperse
   * 
   * Multi-layer distribution flow:
   * Temp Wallet → Intermediate Wallets → Target Wallets
   */
  async executeHardDisperse(
    tempWallet: Keypair,
    config: HardDisperseConfig
  ): Promise<DisperseResult> {
    try {
      logger.info('Starting hard disperse', {
        projectId: config.projectId,
        targetWallets: config.targetWalletIds.length,
        totalAmount: config.totalAmount,
      });
      
      // Get project and user for fee calculation
      const project = await ProjectModel.findById(config.projectId);
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      const user = await UserModel.findById(project.user_id);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Calculate and collect fee
      const { net: netAmount, fee: feeAmount } = await FeeManager.deductFee(
        config.totalAmount,
        user.id
      );
      
      logger.info('Fee calculated', {
        gross: config.totalAmount,
        net: netAmount,
        fee: feeAmount,
      });
      
      // Collect fee if applicable
      if (feeAmount > 0) {
        await FeeManager.collectFee(tempWallet, feeAmount);
        logger.info('Fee collected', { amount: feeAmount });
      }
      
      // Get target wallets
      const targetWallets = await Promise.all(
        config.targetWalletIds.map(id => WalletModel.findById(id))
      );
      
      const validTargets = targetWallets.filter(w => w !== null);
      
      if (validTargets.length === 0) {
        throw new Error('No valid target wallets found');
      }
      
      // Calculate distribution amounts
      const amounts = this.calculateDistribution(
        netAmount,
        validTargets.length,
        config.minAmount,
        config.maxAmount
      );
      
      // Build multi-layer distribution
      const layers = this.buildLayers(validTargets, amounts);
      
      logger.info('Distribution layers built', {
        layerCount: layers.length,
        intermediateWallets: layers[0].wallets.length,
      });
      
      // Execute layer-by-layer
      const signatures: string[] = [];
      const distributions: WalletDistribution[] = [];
      
      // Layer 1: Temp wallet → Intermediates
      logger.info('Executing Layer 1: Temp → Intermediates');
      const layer1Sigs = await this.executeLayer(
        tempWallet,
        layers[0].wallets
      );
      signatures.push(...layer1Sigs);
      
      // Delay between layers
      await this.sleep(this.randomDelay(5, 15));
      
      // Layer 2: Intermediates → Targets
      logger.info('Executing Layer 2: Intermediates → Targets');
      
      for (let i = 0; i < layers[0].wallets.length; i++) {
        const intermediate = layers[0].wallets[i];
        
        for (let j = 0; j < intermediate.targetsToFund.length; j++) {
          const targetId = intermediate.targetsToFund[j];
          const amount = intermediate.amountsToSend[j];
          const targetWallet = validTargets.find(w => w!.id === targetId);
          
          if (!targetWallet) continue;
          
          try {
            const signature = await this.sendSol(
              intermediate.keypair,
              targetWallet.address,
              amount
            );
            
            signatures.push(signature);
            
            distributions.push({
              walletId: targetWallet.id,
              address: targetWallet.address,
              amount,
              signature,
              success: true,
            });
            
            logger.info('Target wallet funded', {
              walletId: targetWallet.id,
              amount,
              signature,
            });
            
            // Random delay between transfers
            await this.sleep(this.randomDelay(5, 15));
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            
            distributions.push({
              walletId: targetWallet.id,
              address: targetWallet.address,
              amount,
              success: false,
              error: errorMsg,
            });
            
            logger.error('Failed to fund target wallet', {
              walletId: targetWallet.id,
              error,
            });
          }
        }
      }
      
      const totalDistributed = distributions
        .filter(d => d.success)
        .reduce((sum, d) => sum + d.amount, 0);
      
      logger.info('Hard disperse complete', {
        totalDistributed,
        successfulTransfers: distributions.filter(d => d.success).length,
        failedTransfers: distributions.filter(d => !d.success).length,
      });
      
      return {
        tempWallet: {
          keypair: tempWallet,
          address: tempWallet.publicKey.toString(),
          privateKey: keypairToBase58(tempWallet),
        },
        distributions,
        totalDistributed,
        transactionSignatures: signatures,
        success: true,
      };
    } catch (error) {
      logger.error('Hard disperse failed', { config, error });
      
      return {
        tempWallet: {
          keypair: tempWallet,
          address: tempWallet.publicKey.toString(),
          privateKey: keypairToBase58(tempWallet),
        },
        distributions: [],
        totalDistributed: 0,
        transactionSignatures: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Build distribution layers
   */
  private buildLayers(
    targets: any[],
    amounts: number[]
  ): DistributionLayer[] {
    // Calculate number of intermediate wallets (2-3 targets per intermediate)
    const intermediateCount = Math.ceil(targets.length / 2);
    
    // Generate intermediate wallets
    const intermediates: LayerWallet[] = [];
    
    for (let i = 0; i < intermediateCount; i++) {
      const startIdx = i * 2;
      const endIdx = Math.min(startIdx + 2, targets.length);
      
      const targetsToFund = targets.slice(startIdx, endIdx).map(t => t.id);
      const amountsToSend = amounts.slice(startIdx, endIdx);
      const totalToReceive = amountsToSend.reduce((sum, a) => sum + a, 0);
      
      intermediates.push({
        keypair: Keypair.generate(),
        address: '',
        amountToReceive: totalToReceive + 0.001, // Extra for fees
        targetsToFund,
        amountsToSend,
      });
    }
    
    return [
      {
        layerNumber: 1,
        wallets: intermediates,
      },
    ];
  }
  
  /**
   * Execute a distribution layer
   */
  private async executeLayer(
    sourceKeypair: Keypair,
    targets: LayerWallet[]
  ): Promise<string[]> {
    const signatures: string[] = [];
    
    for (const target of targets) {
      try {
        const signature = await this.sendSol(
          sourceKeypair,
          target.keypair.publicKey.toString(),
          target.amountToReceive
        );
        
        signatures.push(signature);
        
        // Random delay
        await this.sleep(this.randomDelay(5, 15));
      } catch (error) {
        logger.error('Failed to send to intermediate', { error });
      }
    }
    
    return signatures;
  }
  
  /**
   * Send SOL transfer
   */
  private async sendSol(
    from: Keypair,
    toAddress: string,
    amount: number
  ): Promise<string> {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: Math.floor(amount * LAMPORTS_PER_SOL),
      })
    );
    
    transaction.feePayer = from.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    transaction.sign(from);
    
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      }
    );
    
    await connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  }
  
  /**
   * Random delay in seconds
   */
  private randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }
  
  /**
   * Sleep helper
   */
  private sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
  
  /**
   * Get SOL back from all project wallets
   */
  async getSolBack(options: GetSolBackOptions): Promise<GetSolBackResult> {
    try {
      logger.info('Getting SOL back', {
        projectId: options.projectId,
        destination: options.destinationAddress,
      });
      
      // Get wallets
      const allWallets = await WalletModel.findByProjectId(options.projectId);
      const targetWallets = options.includeWalletIds
        ? allWallets.filter(w => options.includeWalletIds!.includes(w.id))
        : allWallets;
      
      if (targetWallets.length === 0) {
        throw new Error('No wallets found');
      }
      
      const signatures: string[] = [];
      const details: GetSolBackResult['details'] = [];
      let totalCollected = 0;
      
      for (const wallet of targetWallets) {
        try {
          // Get wallet with private key
          const walletWithKey = await WalletModel.getWithPrivateKey(wallet.id);
          
          if (!walletWithKey || !walletWithKey.private_key) {
            throw new Error('Cannot decrypt wallet');
          }
          
          const keypair = keypairFromPrivateKey(walletWithKey.private_key);
          
          // Get balance
          const balance = await connection.getBalance(keypair.publicKey);
          const balanceSol = balance / LAMPORTS_PER_SOL;
          
          // Leave 0.001 SOL for rent
          const amountToSend = balanceSol - 0.001;
          
          if (amountToSend <= 0) {
            details.push({
              walletId: wallet.id,
              address: wallet.address,
              amount: 0,
              success: false,
              error: 'Insufficient balance',
            });
            continue;
          }
          
          // Send to destination
          const signature = await this.sendSol(
            keypair,
            options.destinationAddress,
            amountToSend
          );
          
          signatures.push(signature);
          totalCollected += amountToSend;
          
          details.push({
            walletId: wallet.id,
            address: wallet.address,
            amount: amountToSend,
            signature,
            success: true,
          });
          
          logger.info('SOL collected from wallet', {
            walletId: wallet.id,
            amount: amountToSend,
          });
          
          // Delay between transfers
          await this.sleep(2);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          
          details.push({
            walletId: wallet.id,
            address: wallet.address,
            amount: 0,
            success: false,
            error: errorMsg,
          });
          
          logger.error('Failed to collect SOL from wallet', {
            walletId: wallet.id,
            error,
          });
        }
      }
      
      logger.info('SOL collection complete', {
        totalCollected,
        successfulTransfers: details.filter(d => d.success).length,
        failedTransfers: details.filter(d => !d.success).length,
      });
      
      return {
        totalCollected,
        successfulTransfers: details.filter(d => d.success).length,
        failedTransfers: details.filter(d => !d.success).length,
        transactionSignatures: signatures,
        details,
      };
    } catch (error) {
      logger.error('Get SOL back failed', { options, error });
      throw error;
    }
  }
}

// Export singleton instance
export default new HardDisperser();