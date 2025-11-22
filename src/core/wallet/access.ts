import { WalletModel } from '../../db/models/wallet';
import { ProjectModel } from '../../db/models/project';
import { UserModel } from '../../db/models/user';
import logger from '../../utils/logger';

/**
 * Wallet Access Control
 * 
 * Ensures users can only access wallets they own
 */
export class WalletAccessControl {
  /**
   * Check if user owns the wallet
   */
  async canAccess(userId: number, walletId: number): Promise<boolean> {
    try {
      const wallet = await WalletModel.findById(walletId);
      
      if (!wallet) {
        return false;
      }
      
      const project = await ProjectModel.findById(wallet.project_id);
      
      if (!project) {
        return false;
      }
      
      return project.user_id === userId;
    } catch (error) {
      logger.error('Failed to check wallet access', { userId, walletId, error });
      return false;
    }
  }
  
  /**
   * Check if user can access all wallets in list
   */
  async canAccessAll(userId: number, walletIds: number[]): Promise<boolean> {
    const checks = await Promise.all(
      walletIds.map(id => this.canAccess(userId, id))
    );
    
    return checks.every(result => result === true);
  }
  
  /**
   * Get telegram user from user ID
   */
  async getTelegramUser(userId: number): Promise<number | null> {
    try {
      const user = await UserModel.findById(userId);
      return user?.telegram_id || null;
    } catch (error) {
      logger.error('Failed to get telegram user', { userId, error });
      return null;
    }
  }
  
  /**
   * Ensure user has access (throw error if not)
   */
  async ensureAccess(userId: number, walletId: number): Promise<void> {
    const hasAccess = await this.canAccess(userId, walletId);
    
    if (!hasAccess) {
      throw new Error('Access denied: You do not own this wallet');
    }
  }
  
  /**
   * Ensure user has access to all wallets (throw error if not)
   */
  async ensureAccessAll(userId: number, walletIds: number[]): Promise<void> {
    const hasAccess = await this.canAccessAll(userId, walletIds);
    
    if (!hasAccess) {
      throw new Error('Access denied: You do not own all these wallets');
    }
  }
}

// Export singleton instance
export default new WalletAccessControl();