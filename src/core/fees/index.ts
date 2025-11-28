import { Keypair, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { UserModel } from '../../db/models/user';
import { connection } from '../../utils/solana';
import { solToLamports } from '../../constants/solana';
import logger from '../../utils/logger';

/**
 * Fee Manager
 * 
 * Handles fee collection for the platform:
 * - 0.7% fee for non-premium users
 * - 0% fee for premium users
 * 
 * Fees are collected on:
 * - Swap transactions (buy/sell)
 * - SOL disperser operations
 */
export class FeeManager {
  private readonly FEE_PERCENTAGE = 0.007; // 0.7%
  
  // TODO: Set production wallet address
  private readonly FEE_WALLET = new PublicKey(
    'ySBdM63uedRGavs5gQqb3c5thPCX7uHowdxN3mnTAih'
  );
  
  /**
   * Check if user is premium
   * 
   * Premium users:
   * - Have is_premium = true
   * - Have valid (not expired) premium_expires_at
   * 
   * Auto-removes expired premium status
   */
  async isPremium(userId: number): Promise<boolean> {
    try {
      return await UserModel.isPremium(userId);
    } catch (error) {
      logger.error('Failed to check premium status', { userId, error });
      // On error, assume not premium (safer)
      return false;
    }
  }
  
  /**
   * Calculate fee amount
   * 
   * @param amountSol - Amount in SOL
   * @param userId - User ID
   * @returns Fee amount in SOL
   */
  async calculateFee(amountSol: number, userId: number): Promise<number> {
    if (await this.isPremium(userId)) {
      return 0; // No fee for premium users
    }
    
    return amountSol * this.FEE_PERCENTAGE;
  }
  
  /**
   * Deduct fee from amount
   * 
   * Example:
   * - Input: 1.0 SOL
   * - Fee: 0.007 SOL (0.7%)
   * - Net: 0.993 SOL
   * 
   * @returns { net: amount after fee, fee: fee amount }
   */
  async deductFee(
    grossAmount: number,
    userId: number
  ): Promise<{ net: number; fee: number }> {
    const fee = await this.calculateFee(grossAmount, userId);
    
    return {
      net: grossAmount - fee,
      fee: fee,
    };
  }
  
  /**
   * Collect fee from wallet
   * 
   * Sends fee amount to platform fee collection wallet
   * 
   * @param fromKeypair - Wallet to collect fee from
   * @param feeAmount - Fee amount in SOL
   * @returns Transaction signature (empty string if no fee)
   */
  async collectFee(
    fromKeypair: Keypair,
    feeAmount: number
  ): Promise<string> {
    // Skip if no fee
    if (feeAmount === 0) {
      return '';
    }
    
    try {
      // Build transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: this.FEE_WALLET,
          lamports: solToLamports(feeAmount),
        })
      );
      
      // Set fee payer and recent blockhash
      transaction.feePayer = fromKeypair.publicKey;
      const { blockhash } = await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      
      // Sign transaction
      transaction.sign(fromKeypair);
      
      // Send transaction
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }
      );
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      logger.info('Fee collected', {
        amount: feeAmount,
        signature,
        from: fromKeypair.publicKey.toString(),
        to: this.FEE_WALLET.toString(),
      });
      
      return signature;
    } catch (error) {
      logger.error('Failed to collect fee', {
        feeAmount,
        from: fromKeypair.publicKey.toString(),
        error,
      });
      throw error;
    }
  }
  
  /**
   * Get fee percentage (for display)
   */
  getFeePercentage(): number {
    return this.FEE_PERCENTAGE * 100; // Returns 0.7
  }
  
  /**
   * Format fee for display
   * 
   * Example: formatFee(0.007) => "0.007 SOL (0.7%)"
   */
  formatFee(feeAmount: number): string {
    const percentage = this.getFeePercentage();
    return `${feeAmount.toFixed(6)} SOL (${percentage}%)`;
  }
}

// Export singleton instance
export default new FeeManager();