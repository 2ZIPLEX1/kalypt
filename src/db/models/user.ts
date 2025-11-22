import db from '../connection';
import logger from '../../utils/logger';
import { DEFAULT_JITO_SETTINGS } from '../../constants/jito';

/**
 * User interface
 */
export interface User {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_premium: boolean;
  premium_expires_at?: Date;
  created_at: Date;
  updated_at: Date;
  last_active_at: Date;
}

/**
 * User settings interface
 */
export interface UserSettings {
  id: number;
  user_id: number;
  jito_enabled: boolean;
  jito_auto_tip: boolean;
  jito_max_tip: number;
  jito_priority_fee: number;
  buy_slippage: number;
  sell_slippage: number;
  safe_settings: boolean;
  settings_json?: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create user input interface
 */
export interface CreateUserInput {
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Update user settings input interface
 */
export interface UpdateUserSettingsInput {
  jito_enabled?: boolean;
  jito_auto_tip?: boolean;
  jito_max_tip?: number;
  jito_priority_fee?: number;
  buy_slippage?: number;
  sell_slippage?: number;
  safe_settings?: boolean;
  settings_json?: any;
}

/**
 * User Model
 */
export class UserModel {
  /**
   * Find user by Telegram ID
   */
  static async findByTelegramId(telegramId: number): Promise<User | null> {
    try {
      const result = await db.query<User>(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find user by telegram_id', { telegramId, error });
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  static async findById(id: number): Promise<User | null> {
    try {
      const result = await db.query<User>(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find user by id', { id, error });
      throw error;
    }
  }

  /**
   * Create new user
   */
  static async create(input: CreateUserInput): Promise<User> {
    try {
      const result = await db.query<User>(
        `INSERT INTO users (telegram_id, username, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.telegram_id, input.username, input.first_name, input.last_name]
      );

      const user = result.rows[0];

      // Create default settings for new user
      await this.createDefaultSettings(user.id);

      logger.info('User created', {
        userId: user.id,
        telegramId: user.telegram_id,
      });

      return user;
    } catch (error) {
      logger.error('Failed to create user', { input, error });
      throw error;
    }
  }

  /**
   * Create or update user (upsert)
   */
  static async createOrUpdate(input: CreateUserInput): Promise<User> {
    try {
      const result = await db.query<User>(
        `INSERT INTO users (telegram_id, username, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (telegram_id) 
         DO UPDATE SET 
           username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           last_active_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [input.telegram_id, input.username, input.first_name, input.last_name]
      );

      const user = result.rows[0];

      // Ensure settings exist
      const settings = await this.getSettings(user.id);
      if (!settings) {
        await this.createDefaultSettings(user.id);
      }

      return user;
    } catch (error) {
      logger.error('Failed to create or update user', { input, error });
      throw error;
    }
  }

  /**
   * Update last active timestamp
   */
  static async updateLastActive(userId: number): Promise<void> {
    try {
      await db.query(
        'UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
      );
    } catch (error) {
      logger.error('Failed to update last active', { userId, error });
      // Non-critical error, don't throw
    }
  }

  /**
   * Create default settings for user
   */
  private static async createDefaultSettings(userId: number): Promise<void> {
    try {
      await db.query(
        `INSERT INTO user_settings (
          user_id, 
          jito_enabled, 
          jito_auto_tip, 
          jito_max_tip, 
          jito_priority_fee,
          buy_slippage,
          sell_slippage,
          safe_settings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          DEFAULT_JITO_SETTINGS.enabled,
          DEFAULT_JITO_SETTINGS.autoTip,
          DEFAULT_JITO_SETTINGS.maxTip,
          DEFAULT_JITO_SETTINGS.priorityFee,
          15, // buy_slippage
          15, // sell_slippage
          true, // safe_settings
        ]
      );

      logger.info('Default settings created', { userId });
    } catch (error) {
      logger.error('Failed to create default settings', { userId, error });
      throw error;
    }
  }

  /**
   * Get user settings
   */
  static async getSettings(userId: number): Promise<UserSettings | null> {
    try {
      const result = await db.query<UserSettings>(
        'SELECT * FROM user_settings WHERE user_id = $1',
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user settings', { userId, error });
      throw error;
    }
  }
  
  /**
   * Update user (for premium status, etc.)
   */
  static async update(
    userId: number,
    updates: Partial<Pick<User, 'is_premium' | 'premium_expires_at' | 'username' | 'first_name' | 'last_name'>>
  ): Promise<User> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (updates.is_premium !== undefined) {
        fields.push(`is_premium = $${paramIndex++}`);
        values.push(updates.is_premium);
      }
      if (updates.premium_expires_at !== undefined) {
        fields.push(`premium_expires_at = $${paramIndex++}`);
        values.push(updates.premium_expires_at);
      }
      if (updates.username !== undefined) {
        fields.push(`username = $${paramIndex++}`);
        values.push(updates.username);
      }
      if (updates.first_name !== undefined) {
        fields.push(`first_name = $${paramIndex++}`);
        values.push(updates.first_name);
      }
      if (updates.last_name !== undefined) {
        fields.push(`last_name = $${paramIndex++}`);
        values.push(updates.last_name);
      }
      
      fields.push(`updated_at = NOW()`);
      values.push(userId);
      
      const result = await db.query<User>(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      
      if (!result.rows[0]) {
        throw new Error('User not found');
      }
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user', { userId, updates, error });
      throw error;
    }
  }

  /**
   * Update user settings
   */
  static async updateSettings(
    userId: number,
    input: UpdateUserSettingsInput
  ): Promise<UserSettings> {
    try {
      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.jito_enabled !== undefined) {
        updates.push(`jito_enabled = $${paramIndex++}`);
        values.push(input.jito_enabled);
      }
      if (input.jito_auto_tip !== undefined) {
        updates.push(`jito_auto_tip = $${paramIndex++}`);
        values.push(input.jito_auto_tip);
      }
      if (input.jito_max_tip !== undefined) {
        updates.push(`jito_max_tip = $${paramIndex++}`);
        values.push(input.jito_max_tip);
      }
      if (input.jito_priority_fee !== undefined) {
        updates.push(`jito_priority_fee = $${paramIndex++}`);
        values.push(input.jito_priority_fee);
      }
      if (input.buy_slippage !== undefined) {
        updates.push(`buy_slippage = $${paramIndex++}`);
        values.push(input.buy_slippage);
      }
      if (input.sell_slippage !== undefined) {
        updates.push(`sell_slippage = $${paramIndex++}`);
        values.push(input.sell_slippage);
      }
      if (input.safe_settings !== undefined) {
        updates.push(`safe_settings = $${paramIndex++}`);
        values.push(input.safe_settings);
      }
      if (input.settings_json !== undefined) {
        updates.push(`settings_json = $${paramIndex++}`);
        values.push(JSON.stringify(input.settings_json));
      }

      if (updates.length === 0) {
        // No updates, return current settings
        return (await this.getSettings(userId))!;
      }

      values.push(userId);

      const result = await db.query<UserSettings>(
        `UPDATE user_settings SET ${updates.join(', ')}
         WHERE user_id = $${paramIndex}
         RETURNING *`,
        values
      );

      logger.info('User settings updated', { userId, updates: input });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user settings', { userId, input, error });
      throw error;
    }
  }

  /**
   * Delete user (cascade deletes all related data)
   */
  static async delete(userId: number): Promise<void> {
    try {
      await db.query('DELETE FROM users WHERE id = $1', [userId]);
      logger.info('User deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete user', { userId, error });
      throw error;
    }
  }

  /**
   * Get all users (admin function)
   */
  static async findAll(limit: number = 100, offset: number = 0): Promise<User[]> {
    try {
      const result = await db.query<User>(
        'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find all users', error);
      throw error;
    }
  }

  /**
   * Get user count
   */
  static async count(): Promise<number> {
    try {
      const result = await db.query<{ count: string }>(
        'SELECT COUNT(*) FROM users'
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to count users', error);
      throw error;
    }
  }
  
  /**
   * Check if user is premium
   */
  static async isPremium(userId: number): Promise<boolean> {
    try {
      const user = await this.findById(userId);
      
      if (!user || !user.is_premium) {
        return false;
      }
      
      // Check if premium expired
      if (user.premium_expires_at && user.premium_expires_at < new Date()) {
        // Expired - remove premium status
        await this.update(userId, { is_premium: false });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to check premium status', { userId, error });
      throw error;
    }
  }
  
  /**
   * Set user premium status
   */
  static async setPremium(
    userId: number,
    expiresAt?: Date
  ): Promise<User> {
    try {
      const result = await db.query<User>(
        `UPDATE users 
         SET is_premium = true,
             premium_expires_at = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [userId, expiresAt || null]
      );
      
      logger.info('User premium status set', {
        userId: userId.toString(),
        expiresAt: expiresAt?.toISOString() || 'never',
      });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to set premium status', { userId, error });
      throw error;
    }
  }
  
  /**
   * Remove user premium status
   */
  static async removePremium(userId: number): Promise<User> {
    try {
      const result = await db.query<User>(
        `UPDATE users 
         SET is_premium = false,
             premium_expires_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [userId]
      );
      
      logger.info('User premium status removed', {
        userId: userId.toString(),
      });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to remove premium status', { userId, error });
      throw error;
    }
  }
}