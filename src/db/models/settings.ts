import db from '../connection';
import logger from '../../utils/logger';

/**
 * Launch preset interface
 */
export interface LaunchPreset {
  id: number;
  user_id: number;
  name: string;
  launch_mode: string;
  dev_buy_amount?: number;
  bundle_wallets?: number;
  bundle_sol_per_wallet?: number;
  sniper_wallets?: number;
  sniper_sol_min?: number;
  sniper_sol_max?: number;
  max_sniper_percentage?: number;
  risk_mode?: string;
  jito_tip?: number;
  preset_json?: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create launch preset input interface
 */
export interface CreateLaunchPresetInput {
  user_id: number;
  name: string;
  launch_mode: string;
  dev_buy_amount?: number;
  bundle_wallets?: number;
  bundle_sol_per_wallet?: number;
  sniper_wallets?: number;
  sniper_sol_min?: number;
  sniper_sol_max?: number;
  max_sniper_percentage?: number;
  risk_mode?: string;
  jito_tip?: number;
  preset_json?: any;
}

/**
 * Update launch preset input interface
 */
export interface UpdateLaunchPresetInput {
  name?: string;
  launch_mode?: string;
  dev_buy_amount?: number;
  bundle_wallets?: number;
  bundle_sol_per_wallet?: number;
  sniper_wallets?: number;
  sniper_sol_min?: number;
  sniper_sol_max?: number;
  max_sniper_percentage?: number;
  risk_mode?: string;
  jito_tip?: number;
  preset_json?: any;
}

/**
 * Launch Preset Model
 */
export class LaunchPresetModel {
  /**
   * Find preset by ID
   */
  static async findById(id: number): Promise<LaunchPreset | null> {
    try {
      const result = await db.query<LaunchPreset>(
        'SELECT * FROM launch_presets WHERE id = $1',
        [id]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find launch preset by id', { id, error });
      throw error;
    }
  }

  /**
   * Find all presets by user
   */
  static async findByUserId(userId: number): Promise<LaunchPreset[]> {
    try {
      const result = await db.query<LaunchPreset>(
        `SELECT * FROM launch_presets 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find launch presets by user_id', { userId, error });
      throw error;
    }
  }

  /**
   * Create new launch preset
   */
  static async create(input: CreateLaunchPresetInput): Promise<LaunchPreset> {
    try {
      const result = await db.query<LaunchPreset>(
        `INSERT INTO launch_presets (
          user_id, name, launch_mode, dev_buy_amount, 
          bundle_wallets, bundle_sol_per_wallet, 
          sniper_wallets, sniper_sol_min, sniper_sol_max,
          max_sniper_percentage, risk_mode, jito_tip, preset_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          input.user_id,
          input.name,
          input.launch_mode,
          input.dev_buy_amount,
          input.bundle_wallets,
          input.bundle_sol_per_wallet,
          input.sniper_wallets,
          input.sniper_sol_min,
          input.sniper_sol_max,
          input.max_sniper_percentage,
          input.risk_mode,
          input.jito_tip,
          input.preset_json ? JSON.stringify(input.preset_json) : null,
        ]
      );

      const preset = result.rows[0];

      logger.info('Launch preset created', {
        presetId: preset.id.toString(),
        name: preset.name,
        userId: preset.user_id.toString(),
      });

      return preset;
    } catch (error) {
      logger.error('Failed to create launch preset', { input, error });
      throw error;
    }
  }

  /**
   * Update launch preset
   */
  static async update(
    id: number,
    input: UpdateLaunchPresetInput
  ): Promise<LaunchPreset> {
    try {
      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(input.name);
      }
      if (input.launch_mode !== undefined) {
        updates.push(`launch_mode = $${paramIndex++}`);
        values.push(input.launch_mode);
      }
      if (input.dev_buy_amount !== undefined) {
        updates.push(`dev_buy_amount = $${paramIndex++}`);
        values.push(input.dev_buy_amount);
      }
      if (input.bundle_wallets !== undefined) {
        updates.push(`bundle_wallets = $${paramIndex++}`);
        values.push(input.bundle_wallets);
      }
      if (input.bundle_sol_per_wallet !== undefined) {
        updates.push(`bundle_sol_per_wallet = $${paramIndex++}`);
        values.push(input.bundle_sol_per_wallet);
      }
      if (input.sniper_wallets !== undefined) {
        updates.push(`sniper_wallets = $${paramIndex++}`);
        values.push(input.sniper_wallets);
      }
      if (input.sniper_sol_min !== undefined) {
        updates.push(`sniper_sol_min = $${paramIndex++}`);
        values.push(input.sniper_sol_min);
      }
      if (input.sniper_sol_max !== undefined) {
        updates.push(`sniper_sol_max = $${paramIndex++}`);
        values.push(input.sniper_sol_max);
      }
      if (input.max_sniper_percentage !== undefined) {
        updates.push(`max_sniper_percentage = $${paramIndex++}`);
        values.push(input.max_sniper_percentage);
      }
      if (input.risk_mode !== undefined) {
        updates.push(`risk_mode = $${paramIndex++}`);
        values.push(input.risk_mode);
      }
      if (input.jito_tip !== undefined) {
        updates.push(`jito_tip = $${paramIndex++}`);
        values.push(input.jito_tip);
      }
      if (input.preset_json !== undefined) {
        updates.push(`preset_json = $${paramIndex++}`);
        values.push(JSON.stringify(input.preset_json));
      }

      if (updates.length === 0) {
        // No updates, return current preset
        return (await this.findById(id))!;
      }

      values.push(id);

      const result = await db.query<LaunchPreset>(
        `UPDATE launch_presets SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      logger.info('Launch preset updated', {
        presetId: result.rows[0].id.toString(),
        name: result.rows[0].name,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update launch preset', { id, input, error });
      throw error;
    }
  }

  /**
   * Delete launch preset
   */
  static async delete(id: number): Promise<void> {
    try {
      await db.query('DELETE FROM launch_presets WHERE id = $1', [id]);

      logger.info('Launch preset deleted', {
        presetId: id.toString(),
      });
    } catch (error) {
      logger.error('Failed to delete launch preset', { id, error });
      throw error;
    }
  }

  /**
   * Count presets by user
   */
  static async countByUserId(userId: number): Promise<number> {
    try {
      const result = await db.query<{ count: string }>(
        'SELECT COUNT(*) FROM launch_presets WHERE user_id = $1',
        [userId]
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to count launch presets', { userId, error });
      throw error;
    }
  }
}