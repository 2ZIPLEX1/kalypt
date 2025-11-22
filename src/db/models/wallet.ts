import db from '../connection';
import logger from '../../utils/logger';
import { encryptPrivateKey, decryptPrivateKey, EncryptedData } from '../../utils/crypto';
import { Keypair } from '@solana/web3.js';
import { generateKeypair, keypairToBase58 } from '../../utils/solana';
import bs58 from 'bs58';

/**
 * Wallet interface
 */
export interface Wallet {
  id: number;
  project_id: number;
  address: string;
  encrypted_private_key: string;
  iv: string;
  auth_tag: string;
  salt: string;
  wallet_type: WalletType;
  label?: string;
  balance_sol: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Wallet type
 */
export type WalletType = 'dev' | 'bundle' | 'sniper';

/**
 * Wallet type constants for easy access
 */
export const WalletType = {
  DEV: 'dev' as const,
  BUNDLE: 'bundle' as const,
  SNIPER: 'sniper' as const,
};

/**
 * Create wallet input interface
 */
export interface CreateWalletInput {
  project_id: number;
  keypair?: Keypair;
  wallet_type?: WalletType;
  label?: string;
}

/**
 * Wallet with decrypted key interface
 */
export interface WalletWithKey extends Wallet {
  private_key: string; // Decrypted Base58 private key
  keypair: Keypair;
}

/**
 * Wallet Model
 */
export class WalletModel {
  /**
   * Find wallet by ID
   */
  static async findById(id: number): Promise<Wallet | null> {
    try {
      const result = await db.query<Wallet>(
        'SELECT * FROM wallets WHERE id = $1',
        [id]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find wallet by id', { id, error });
      throw error;
    }
  }

  /**
   * Find wallet by address
   */
  static async findByAddress(address: string): Promise<Wallet | null> {
    try {
      const result = await db.query<Wallet>(
        'SELECT * FROM wallets WHERE address = $1',
        [address]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find wallet by address', { address, error });
      throw error;
    }
  }

  /**
   * Find all wallets by project
   */
  static async findByProjectId(projectId: number): Promise<Wallet[]> {
    try {
      const result = await db.query<Wallet>(
        `SELECT * FROM wallets 
         WHERE project_id = $1 
         ORDER BY 
           CASE wallet_type 
             WHEN 'dev' THEN 1 
             WHEN 'bundle' THEN 2 
             WHEN 'sniper' THEN 3 
           END,
           created_at ASC`,
        [projectId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find wallets by project_id', { projectId, error });
      throw error;
    }
  }

  /**
   * Find wallets by type
   */
  static async findByType(
    projectId: number,
    walletType: WalletType
  ): Promise<Wallet[]> {
    try {
      const result = await db.query<Wallet>(
        `SELECT * FROM wallets 
         WHERE project_id = $1 AND wallet_type = $2 AND is_active = true
         ORDER BY created_at ASC`,
        [projectId, walletType]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find wallets by type', { projectId, walletType, error });
      throw error;
    }
  }

  /**
   * Create new wallet
   */
  static async create(input: CreateWalletInput): Promise<Wallet> {
    try {
      // Generate keypair if not provided
      const keypair = input.keypair || generateKeypair();
      const address = keypair.publicKey.toString();
      const privateKey = keypairToBase58(keypair);

      // Encrypt private key
      const encrypted = encryptPrivateKey(privateKey);

      const result = await db.query<Wallet>(
        `INSERT INTO wallets (
          project_id, address, encrypted_private_key, 
          iv, auth_tag, salt, wallet_type, label
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          input.project_id,
          address,
          encrypted.encrypted,
          encrypted.iv,
          encrypted.authTag,
          encrypted.salt,
          input.wallet_type || WalletType.BUNDLE,
          input.label,
        ]
      );

      const wallet = result.rows[0];

      logger.wallet('Wallet created', {
        walletId: wallet.id.toString(),
        address: wallet.address,
        projectId: wallet.project_id.toString(),
        operation: 'create',
      });

      return wallet;
    } catch (error) {
      logger.error('Failed to create wallet', { input, error });
      throw error;
    }
  }

  /**
   * Create multiple wallets
   */
  static async createBatch(
    projectId: number,
    count: number,
    walletType: WalletType = WalletType.BUNDLE
  ): Promise<Wallet[]> {
    try {
      const wallets: Wallet[] = [];

      for (let i = 0; i < count; i++) {
        const wallet = await this.create({
          project_id: projectId,
          wallet_type: walletType,
          label: `${walletType.toUpperCase()} ${i + 1}`,
        });
        wallets.push(wallet);
      }

      logger.wallet('Batch wallets created', {
        projectId: projectId.toString(),
        count: count,
        walletType,
        operation: 'create',
      });

      return wallets;
    } catch (error) {
      logger.error('Failed to create batch wallets', { projectId, count, error });
      throw error;
    }
  }

  /**
   * Get wallet with decrypted private key
   */
  static async getWithPrivateKey(
    id: number,
    password?: string
  ): Promise<WalletWithKey | null> {
    try {
      const wallet = await this.findById(id);
      if (!wallet) return null;

      return this.decryptWallet(wallet, password);
    } catch (error) {
      logger.error('Failed to get wallet with private key', { id, error });
      throw error;
    }
  }

  /**
   * Get multiple wallets with decrypted keys
   */
  static async getMultipleWithPrivateKeys(
    ids: number[],
    password?: string
  ): Promise<WalletWithKey[]> {
    try {
      const result = await db.query<Wallet>(
        'SELECT * FROM wallets WHERE id = ANY($1)',
        [ids]
      );

      const walletsWithKeys = await Promise.all(
        result.rows.map(wallet => this.decryptWallet(wallet, password))
      );

      return walletsWithKeys;
    } catch (error) {
      logger.error('Failed to get multiple wallets with keys', { ids, error });
      throw error;
    }
  }

  /**
   * Get all project wallets with decrypted keys
   */
  static async getProjectWalletsWithKeys(
    projectId: number,
    password?: string
  ): Promise<WalletWithKey[]> {
    try {
      const wallets = await this.findByProjectId(projectId);

      const walletsWithKeys = await Promise.all(
        wallets.map(wallet => this.decryptWallet(wallet, password))
      );

      return walletsWithKeys;
    } catch (error) {
      logger.error('Failed to get project wallets with keys', { projectId, error });
      throw error;
    }
  }

  /**
   * Decrypt wallet private key
   */
  private static async decryptWallet(
    wallet: Wallet,
    password?: string
  ): Promise<WalletWithKey> {
    try {
      const encryptedData: EncryptedData = {
        encrypted: wallet.encrypted_private_key,
        iv: wallet.iv,
        authTag: wallet.auth_tag,
        salt: wallet.salt,
      };

      const privateKey = decryptPrivateKey(encryptedData, password);
      
      // Convert base58 to Uint8Array for Keypair
      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);

      return {
        ...wallet,
        private_key: privateKey,
        keypair,
      };
    } catch (error) {
      logger.error('Failed to decrypt wallet', { walletId: wallet.id, error });
      throw new Error('Failed to decrypt wallet - invalid password or corrupted data');
    }
  }

  /**
   * Update wallet balance
   */
  static async updateBalance(id: number, balanceSol: number): Promise<void> {
    try {
      await db.query(
        'UPDATE wallets SET balance_sol = $1 WHERE id = $2',
        [balanceSol, id]
      );

      logger.debug('Wallet balance updated', { walletId: id, balanceSol });
    } catch (error) {
      logger.error('Failed to update wallet balance', { id, balanceSol, error });
      throw error;
    }
  }

  /**
   * Update multiple wallet balances
   */
  static async updateBalances(
    balances: Array<{ id: number; balance: number }>
  ): Promise<void> {
    try {
      const client = await db.getClient();

      try {
        await client.query('BEGIN');

        for (const { id, balance } of balances) {
          await client.query(
            'UPDATE wallets SET balance_sol = $1 WHERE id = $2',
            [balance, id]
          );
        }

        await client.query('COMMIT');
        logger.debug('Multiple wallet balances updated', { count: balances.length });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update multiple balances', { balances, error });
      throw error;
    }
  }

  /**
   * Deactivate wallet
   */
  static async deactivate(id: number): Promise<void> {
    try {
      await db.query(
        'UPDATE wallets SET is_active = false WHERE id = $1',
        [id]
      );

      logger.wallet('Wallet deactivated', {
        walletId: id.toString(),
        operation: 'delete',
      });
    } catch (error) {
      logger.error('Failed to deactivate wallet', { id, error });
      throw error;
    }
  }

  /**
   * Delete wallet (soft delete - just deactivate)
   */
  static async delete(id: number): Promise<void> {
    return this.deactivate(id);
  }

  /**
   * Hard delete wallet (permanent removal)
   */
  static async hardDelete(id: number): Promise<void> {
    try {
      await db.query('DELETE FROM wallets WHERE id = $1', [id]);

      logger.wallet('Wallet hard deleted', {
        walletId: id.toString(),
        operation: 'delete',
      });
    } catch (error) {
      logger.error('Failed to hard delete wallet', { id, error });
      throw error;
    }
  }

  /**
   * Count wallets by project
   */
  static async countByProjectId(projectId: number): Promise<number> {
    try {
      const result = await db.query<{ count: string }>(
        'SELECT COUNT(*) FROM wallets WHERE project_id = $1 AND is_active = true',
        [projectId]
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to count wallets', { projectId, error });
      throw error;
    }
  }

  /**
   * Get total balance for project wallets
   */
  static async getTotalBalance(projectId: number): Promise<number> {
    try {
      const result = await db.query<{ total: string }>(
        `SELECT COALESCE(SUM(balance_sol), 0) as total 
         FROM wallets 
         WHERE project_id = $1 AND is_active = true`,
        [projectId]
      );

      return parseFloat(result.rows[0].total);
    } catch (error) {
      logger.error('Failed to get total balance', { projectId, error });
      throw error;
    }
  }
}