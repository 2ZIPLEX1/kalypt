import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { WalletModel, Wallet, WalletType } from '../../db/models/wallet';
import { ProjectModel } from '../../db/models/project';
import { connection } from '../../utils/solana';
import { keypairFromPrivateKey } from '../../utils/solana';
import logger from '../../utils/logger';
import {
  CreateWalletOptions,
  ImportWalletOptions,
  WalletExport,
  WalletBalanceInfo,
  BatchCreateResult,
  BatchImportResult,
} from './types';

/**
 * Wallet Manager
 * 
 * Handles wallet operations with security:
 * - Creation with automatic encryption
 * - Import/export with validation
 * - Balance checking
 * - Transaction signing
 * - Access control
 * 
 * SECURITY PRINCIPLES:
 * 1. Never store plain text private keys
 * 2. Decrypt only when needed for signing
 * 3. Clear sensitive data from memory ASAP
 * 4. Log all sensitive operations
 * 5. Enforce access control
 */
export class WalletManager {
  /**
   * Create new wallet
   * 
   * Uses WalletModel.create which handles:
   * - Keypair generation
   * - Encryption with AES-256-GCM
   * - Database storage
   */
  async createWallet(options: CreateWalletOptions): Promise<Wallet> {
    try {
      const wallet = await WalletModel.create({
        project_id: options.projectId,
        wallet_type: options.walletType || 'bundle',
        label: options.label,
      });
      
      logger.info('Wallet created', {
        walletId: wallet.id,
        address: wallet.address,
        projectId: options.projectId,
        type: wallet.wallet_type,
      });
      
      return wallet;
    } catch (error) {
      logger.error('Failed to create wallet', { options, error });
      throw error;
    }
  }
  
  /**
   * Create multiple wallets
   */
  async createBatch(
    projectId: number,
    count: number,
    walletType: WalletType = 'bundle'
  ): Promise<BatchCreateResult> {
    logger.info('Creating batch wallets', {
      projectId,
      count,
      walletType,
    });
    
    const wallets: Wallet[] = [];
    let failed = 0;
    
    for (let i = 0; i < count; i++) {
      try {
        const wallet = await this.createWallet({
          projectId,
          walletType,
          label: `${walletType.toUpperCase()} W${i + 1}`,
        });
        wallets.push(wallet);
      } catch (error) {
        failed++;
        logger.error('Failed to create wallet in batch', { index: i, error });
      }
    }
    
    logger.info('Batch wallet creation complete', {
      success: wallets.length,
      failed,
      total: count,
    });
    
    return {
      success: wallets.length,
      failed,
      wallets,
    };
  }
  
  /**
   * Import wallet from private key
   * 
   * SECURITY: Validates key format before saving
   */
  async importWallet(options: ImportWalletOptions): Promise<Wallet> {
    try {
      // Validate private key format
      let keypair: Keypair;
      try {
        keypair = keypairFromPrivateKey(options.privateKey);
      } catch (error) {
        throw new Error('Invalid private key format. Must be base58 encoded.');
      }
      
      const publicKey = keypair.publicKey.toString();
      
      // Check if wallet already exists in this project
      const existing = await WalletModel.findByAddress(publicKey);
      if (existing && existing.project_id === options.projectId) {
        throw new Error('Wallet already exists in this project');
      }
      
      // Create wallet with the keypair
      const wallet = await WalletModel.create({
        project_id: options.projectId,
        keypair,
        wallet_type: options.walletType || 'bundle',
        label: options.label || 'Imported Wallet',
      });
      
      logger.info('Wallet imported', {
        walletId: wallet.id,
        address: publicKey,
        projectId: options.projectId,
      });
      
      return wallet;
    } catch (error) {
      logger.error('Failed to import wallet', { error });
      throw error;
    }
  }
  
  /**
   * Import multiple wallets from private keys
   */
  async importBatch(
    projectId: number,
    privateKeys: string[]
  ): Promise<BatchImportResult> {
    const success: Wallet[] = [];
    const failed: string[] = [];
    const errors: { key: string; error: string }[] = [];
    
    logger.info('Importing batch wallets', {
      projectId,
      count: privateKeys.length,
    });
    
    for (const privateKey of privateKeys) {
      try {
        const wallet = await this.importWallet({
          projectId,
          privateKey,
        });
        success.push(wallet);
      } catch (error) {
        failed.push(privateKey);
        errors.push({
          key: privateKey.substring(0, 10) + '...',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    logger.info('Batch wallet import complete', {
      success: success.length,
      failed: failed.length,
      total: privateKeys.length,
    });
    
    return { success, failed, errors };
  }
  
  /**
   * Export wallet private key
   * 
   * SECURITY:
   * - Only decrypt when explicitly requested
   * - Log all exports for audit
   * - Never cache decrypted keys
   */
  async exportWallet(walletId: number): Promise<WalletExport> {
    const wallet = await WalletModel.getWithPrivateKey(walletId);
    
    if (!wallet || !wallet.private_key) {
      throw new Error('Wallet not found or cannot decrypt');
    }
    
    // Log export (security audit)
    logger.warn('Private key exported', {
      walletId,
      address: wallet.address,
      operation: 'export',
    });
    
    return {
      address: wallet.address,
      privateKey: wallet.private_key,
      label: wallet.label,
      walletType: wallet.wallet_type,
    };
  }
  
  /**
   * Export all project wallets
   */
  async exportProjectWallets(projectId: number): Promise<WalletExport[]> {
    const wallets = await WalletModel.findByProjectId(projectId);
    const exports: WalletExport[] = [];
    
    for (const wallet of wallets) {
      try {
        const exported = await this.exportWallet(wallet.id);
        exports.push(exported);
      } catch (error) {
        logger.error('Failed to export wallet', {
          walletId: wallet.id,
          error,
        });
      }
    }
    
    logger.warn('Project wallets exported', {
      projectId,
      count: exports.length,
      operation: 'export',
    });
    
    return exports;
  }
  
  /**
   * Format exports as text file content
   */
  formatExportsAsText(exports: WalletExport[]): string {
    let text = '═══════════════════════════════════════\n';
    text += '       KALYPT WALLET EXPORT\n';
    text += '═══════════════════════════════════════\n\n';
    
    // Private keys only
    text += '📝 PRIVATE KEYS:\n';
    text += '───────────────────────────────────────\n';
    exports.forEach((exp, i) => {
      text += `${i + 1}. ${exp.privateKey}\n`;
    });
    
    text += '\n';
    
    // Addresses only
    text += '📍 WALLET ADDRESSES:\n';
    text += '───────────────────────────────────────\n';
    exports.forEach((exp, i) => {
      text += `${i + 1}. ${exp.address}\n`;
    });
    
    text += '\n';
    
    // Private key / address pairs
    text += '🔐 PRIVATE KEYS / ADDRESS PAIRS:\n';
    text += '───────────────────────────────────────\n';
    exports.forEach((exp, i) => {
      text += `\n${i + 1}. ${exp.label || 'Wallet'}\n`;
      text += `   Private Key: ${exp.privateKey}\n`;
      text += `   Address:     ${exp.address}\n`;
    });
    
    text += '\n═══════════════════════════════════════\n';
    text += '⚠️  KEEP THIS FILE SECURE!\n';
    text += '═══════════════════════════════════════\n';
    
    return text;
  }
  
  /**
   * Sign transaction with wallet
   * 
   * SECURITY:
   * - Decrypt in memory only
   * - Sign immediately
   * - Keypair garbage collected after function
   */
  async signTransaction(walletId: number, transaction: Transaction): Promise<Transaction> {
    const wallet = await WalletModel.getWithPrivateKey(walletId);
    
    if (!wallet || !wallet.private_key) {
      throw new Error('Cannot decrypt wallet for signing');
    }
    
    // Convert to Keypair (exists only in this scope)
    const keypair = keypairFromPrivateKey(wallet.private_key);
    
    // Sign
    transaction.sign(keypair);
    
    // keypair will be garbage collected after return
    return transaction;
  }
  
  /**
   * Get wallet balance (SOL)
   */
  async getBalance(walletId: number): Promise<number> {
    const wallet = await WalletModel.findById(walletId);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    const publicKey = new PublicKey(wallet.address);
    const balance = await connection.getBalance(publicKey);
    
    return balance / 1e9; // Convert lamports to SOL
  }
  
  /**
   * Get detailed balance info
   */
  async getBalanceInfo(walletId: number): Promise<WalletBalanceInfo> {
    const wallet = await WalletModel.findById(walletId);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    const publicKey = new PublicKey(wallet.address);
    const solBalance = await connection.getBalance(publicKey);
    
    // TODO: Get token balances
    
    return {
      walletId,
      address: wallet.address,
      solBalance: solBalance / 1e9,
      tokenBalances: [],
    };
  }
  
  /**
   * Get balances for all project wallets
   */
  async getProjectBalances(projectId: number): Promise<Map<number, number>> {
    const wallets = await WalletModel.findByProjectId(projectId);
    const balances = new Map<number, number>();
    
    await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const balance = await this.getBalance(wallet.id);
          balances.set(wallet.id, balance);
        } catch (error) {
          logger.error('Failed to get wallet balance', {
            walletId: wallet.id,
            error,
          });
          balances.set(wallet.id, 0);
        }
      })
    );
    
    return balances;
  }
  
  /**
   * Get total project balance
   */
  async getTotalProjectBalance(projectId: number): Promise<number> {
    const balances = await this.getProjectBalances(projectId);
    return Array.from(balances.values()).reduce((sum, bal) => sum + bal, 0);
  }
  
  /**
   * Delete wallet (soft delete)
   */
  async deleteWallet(walletId: number): Promise<void> {
    await WalletModel.deactivate(walletId);
    
    logger.info('Wallet deleted', {
      walletId,
      operation: 'delete',
    });
  }
  
  /**
   * Check if user has access to wallet
   */
  async hasAccess(userId: number, walletId: number): Promise<boolean> {
    const wallet = await WalletModel.findById(walletId);
    
    if (!wallet) return false;
    
    const project = await ProjectModel.findById(wallet.project_id);
    
    if (!project) return false;
    
    return project.user_id === userId;
  }
}

// Export singleton instance
export default new WalletManager();