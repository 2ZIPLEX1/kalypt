import db from '../connection';
import logger from '../../utils/logger';

/**
 * Transaction interface
 */
export interface Transaction {
  id: number;
  project_id?: number;
  wallet_id?: number;
  signature: string;
  type: TransactionType;
  amount?: number;
  token_address?: string;
  status: TransactionStatus;
  error_message?: string;
  metadata?: any;
  created_at: Date;
  confirmed_at?: Date;
}

/**
 * Transaction type
 */
export type TransactionType = 
  | 'token_create'
  | 'token_deploy'
  | 'buy'
  | 'sell'
  | 'swap'
  | 'transfer_sol'
  | 'transfer_token'
  | 'disperse'
  | 'gather'
  | 'warmup'
  | 'other';

/**
 * Transaction status
 */
export type TransactionStatus = 
  | 'pending'
  | 'processing'
  | 'confirmed'
  | 'failed';

/**
 * Transaction type constants for easy access
 */
export const TransactionType = {
  TOKEN_CREATE: 'token_create' as const,
  TOKEN_DEPLOY: 'token_deploy' as const,
  BUY: 'buy' as const,
  SELL: 'sell' as const,
  SWAP: 'swap' as const,
  TRANSFER_SOL: 'transfer_sol' as const,
  TRANSFER_TOKEN: 'transfer_token' as const,
  DISPERSE: 'disperse' as const,
  GATHER: 'gather' as const,
  WARMUP: 'warmup' as const,
  OTHER: 'other' as const,
};

/**
 * Transaction status constants for easy access
 */
export const TransactionStatus = {
  PENDING: 'pending' as const,
  PROCESSING: 'processing' as const,
  CONFIRMED: 'confirmed' as const,
  FAILED: 'failed' as const,
};

/**
 * Create transaction input interface
 */
export interface CreateTransactionInput {
  project_id?: number;
  wallet_id?: number;
  signature: string;
  type: TransactionType;
  amount?: number;
  token_address?: string;
  status?: TransactionStatus;
  metadata?: any;
}

/**
 * Update transaction input interface
 */
export interface UpdateTransactionInput {
  status?: TransactionStatus;
  error_message?: string;
  metadata?: any;
}

/**
 * Transaction Model
 */
export class TransactionModel {
  /**
   * Find transaction by ID
   */
  static async findById(id: number): Promise<Transaction | null> {
    try {
      const result = await db.query<Transaction>(
        'SELECT * FROM transactions WHERE id = $1',
        [id]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find transaction by id', { id, error });
      throw error;
    }
  }

  /**
   * Find transaction by signature
   */
  static async findBySignature(signature: string): Promise<Transaction | null> {
    try {
      const result = await db.query<Transaction>(
        'SELECT * FROM transactions WHERE signature = $1',
        [signature]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find transaction by signature', { signature, error });
      throw error;
    }
  }

  /**
   * Find transactions by project
   */
  static async findByProjectId(
    projectId: number,
    limit: number = 100,
    offset: number = 0
  ): Promise<Transaction[]> {
    try {
      const result = await db.query<Transaction>(
        `SELECT * FROM transactions 
         WHERE project_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [projectId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find transactions by project_id', { projectId, error });
      throw error;
    }
  }

  /**
   * Find transactions by wallet
   */
  static async findByWalletId(
    walletId: number,
    limit: number = 100,
    offset: number = 0
  ): Promise<Transaction[]> {
    try {
      const result = await db.query<Transaction>(
        `SELECT * FROM transactions 
         WHERE wallet_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [walletId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find transactions by wallet_id', { walletId, error });
      throw error;
    }
  }

  /**
   * Find transactions by type
   */
  static async findByType(
    projectId: number,
    type: TransactionType
  ): Promise<Transaction[]> {
    try {
      const result = await db.query<Transaction>(
        `SELECT * FROM transactions 
         WHERE project_id = $1 AND type = $2 
         ORDER BY created_at DESC`,
        [projectId, type]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find transactions by type', { projectId, type, error });
      throw error;
    }
  }

  /**
   * Find transactions by status
   */
  static async findByStatus(
    projectId: number,
    status: TransactionStatus
  ): Promise<Transaction[]> {
    try {
      const result = await db.query<Transaction>(
        `SELECT * FROM transactions 
         WHERE project_id = $1 AND status = $2 
         ORDER BY created_at DESC`,
        [projectId, status]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find transactions by status', { projectId, status, error });
      throw error;
    }
  }

  /**
   * Create new transaction
   */
  static async create(input: CreateTransactionInput): Promise<Transaction> {
    try {
      const result = await db.query<Transaction>(
        `INSERT INTO transactions (
          project_id, wallet_id, signature, type, amount, 
          token_address, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          input.project_id,
          input.wallet_id,
          input.signature,
          input.type,
          input.amount,
          input.token_address,
          input.status || TransactionStatus.PENDING,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      const transaction = result.rows[0];

      logger.transaction('Transaction recorded', {
        signature: transaction.signature,
        type: transaction.type,
        status: transaction.status,
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to create transaction', { input, error });
      throw error;
    }
  }

  /**
   * Create multiple transactions (batch)
   */
  static async createBatch(
    transactions: CreateTransactionInput[]
  ): Promise<Transaction[]> {
    try {
      const client = await db.getClient();
      const results: Transaction[] = [];

      try {
        await client.query('BEGIN');

        for (const input of transactions) {
          const result = await client.query<Transaction>(
            `INSERT INTO transactions (
              project_id, wallet_id, signature, type, amount, 
              token_address, status, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
              input.project_id,
              input.wallet_id,
              input.signature,
              input.type,
              input.amount,
              input.token_address,
              input.status || TransactionStatus.PENDING,
              input.metadata ? JSON.stringify(input.metadata) : null,
            ]
          );

          results.push(result.rows[0]);
        }

        await client.query('COMMIT');

        logger.transaction('Batch transactions recorded', {
          count: results.length,
        });

        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to create batch transactions', { count: transactions.length, error });
      throw error;
    }
  }

  /**
   * Update transaction
   */
  static async update(
    id: number,
    input: UpdateTransactionInput
  ): Promise<Transaction> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(input.status);

        // If status is confirmed, set confirmed_at
        if (input.status === TransactionStatus.CONFIRMED) {
          updates.push(`confirmed_at = CURRENT_TIMESTAMP`);
        }
      }

      if (input.error_message !== undefined) {
        updates.push(`error_message = $${paramIndex++}`);
        values.push(input.error_message);
      }

      if (input.metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(input.metadata));
      }

      if (updates.length === 0) {
        return (await this.findById(id))!;
      }

      values.push(id);

      const result = await db.query<Transaction>(
        `UPDATE transactions SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update transaction', { id, input, error });
      throw error;
    }
  }

  /**
   * Update transaction by signature
   */
  static async updateBySignature(
    signature: string,
    input: UpdateTransactionInput
  ): Promise<Transaction> {
    try {
      const transaction = await this.findBySignature(signature);
      if (!transaction) {
        throw new Error(`Transaction not found: ${signature}`);
      }

      return await this.update(transaction.id, input);
    } catch (error) {
      logger.error('Failed to update transaction by signature', { signature, input, error });
      throw error;
    }
  }

  /**
   * Mark transaction as confirmed
   */
  static async confirm(id: number): Promise<Transaction> {
    return this.update(id, { status: TransactionStatus.CONFIRMED });
  }

  /**
   * Mark transaction as failed
   */
  static async fail(id: number, errorMessage: string): Promise<Transaction> {
    return this.update(id, {
      status: TransactionStatus.FAILED,
      error_message: errorMessage,
    });
  }

  /**
   * Get recent transactions
   */
  static async getRecent(
    limit: number = 50,
    projectId?: number
  ): Promise<Transaction[]> {
    try {
      if (projectId) {
        return this.findByProjectId(projectId, limit);
      }

      const result = await db.query<Transaction>(
        `SELECT * FROM transactions 
         ORDER BY created_at DESC 
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get recent transactions', { limit, projectId, error });
      throw error;
    }
  }

  /**
   * Count transactions by project
   */
  static async countByProjectId(projectId: number): Promise<number> {
    try {
      const result = await db.query<{ count: string }>(
        'SELECT COUNT(*) FROM transactions WHERE project_id = $1',
        [projectId]
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to count transactions', { projectId, error });
      throw error;
    }
  }

  /**
   * Get transaction statistics for project
   */
  static async getStats(projectId: number): Promise<{
    total: number;
    confirmed: number;
    pending: number;
    failed: number;
    totalVolume: number;
  }> {
    try {
      const result = await db.query<{
        total: string;
        confirmed: string;
        pending: string;
        failed: string;
        total_volume: string;
      }>(
        `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COALESCE(SUM(amount), 0) as total_volume
         FROM transactions 
         WHERE project_id = $1`,
        [projectId]
      );

      const stats = result.rows[0];

      return {
        total: parseInt(stats.total, 10),
        confirmed: parseInt(stats.confirmed, 10),
        pending: parseInt(stats.pending, 10),
        failed: parseInt(stats.failed, 10),
        totalVolume: parseFloat(stats.total_volume),
      };
    } catch (error) {
      logger.error('Failed to get transaction stats', { projectId, error });
      throw error;
    }
  }

  /**
   * Delete old transactions (cleanup)
   */
  static async deleteOld(daysOld: number = 90): Promise<number> {
    try {
      const result = await db.query(
        `DELETE FROM transactions 
         WHERE created_at < NOW() - INTERVAL '${daysOld} days'
         RETURNING id`
      );

      logger.info('Old transactions deleted', { count: result.rowCount });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Failed to delete old transactions', { daysOld, error });
      throw error;
    }
  }
}