import db from '../connection';
import logger from '../../utils/logger';

/**
 * Project interface
 */
export interface Project {
  id: number;
  user_id: number;
  name: string;
  ticker: string;
  description?: string;
  image_url?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  token_address?: string;
  token_metadata?: any;
  status: ProjectStatus;
  created_at: Date;
  updated_at: Date;
  launched_at?: Date;
}

/**
 * Project status constants
 */
export const ProjectStatus = {
  DRAFT: 'draft',
  READY: 'ready',
  LAUNCHING: 'launching',
  LAUNCHED: 'launched',
  FAILED: 'failed',
} as const;

export type ProjectStatus = typeof ProjectStatus[keyof typeof ProjectStatus];

/**
 * Create project input interface
 */
export interface CreateProjectInput {
  user_id: number;
  name: string;
  ticker: string;
  description?: string;
  image_url?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

/**
 * Update project input interface
 */
export interface UpdateProjectInput {
  name?: string;
  ticker?: string;
  description?: string;
  image_url?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  token_address?: string;
  token_metadata?: any;
  status?: ProjectStatus;
}

/**
 * Project Model
 */
export class ProjectModel {
  /**
   * Find project by ID
   */
  static async findById(id: number): Promise<Project | null> {
    try {
      const result = await db.query<Project>(
        'SELECT * FROM projects WHERE id = $1',
        [id]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find project by id', { id, error });
      throw error;
    }
  }

  /**
   * Find all projects by user
   */
  static async findByUserId(
    userId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<Project[]> {
    try {
      const result = await db.query<Project>(
        `SELECT * FROM projects 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find projects by user_id', { userId, error });
      throw error;
    }
  }

  /**
   * Find projects by status
   */
  static async findByStatus(
    userId: number,
    status: ProjectStatus
  ): Promise<Project[]> {
    try {
      const result = await db.query<Project>(
        `SELECT * FROM projects 
         WHERE user_id = $1 AND status = $2 
         ORDER BY created_at DESC`,
        [userId, status]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find projects by status', { userId, status, error });
      throw error;
    }
  }

  /**
   * Create new project
   */
  static async create(input: CreateProjectInput): Promise<Project> {
    try {
      const result = await db.query<Project>(
        `INSERT INTO projects (
          user_id, name, ticker, description, 
          image_url, website, twitter, telegram, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          input.user_id,
          input.name,
          input.ticker,
          input.description,
          input.image_url,
          input.website,
          input.twitter,
          input.telegram,
          ProjectStatus.DRAFT,
        ]
      );

      const project = result.rows[0];

      logger.project('Project created', {
        projectId: project.id.toString(),
        projectName: project.name,
        userId: project.user_id.toString(),
        operation: 'create',
      });

      return project;
    } catch (error) {
      logger.error('Failed to create project', { input, error });
      throw error;
    }
  }

  /**
   * Update project
   */
  static async update(
    id: number,
    input: UpdateProjectInput
  ): Promise<Project> {
    try {
      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(input.name);
      }
      if (input.ticker !== undefined) {
        updates.push(`ticker = $${paramIndex++}`);
        values.push(input.ticker);
      }
      if (input.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(input.description);
      }
      if (input.image_url !== undefined) {
        updates.push(`image_url = $${paramIndex++}`);
        values.push(input.image_url);
      }
      if (input.website !== undefined) {
        updates.push(`website = $${paramIndex++}`);
        values.push(input.website);
      }
      if (input.twitter !== undefined) {
        updates.push(`twitter = $${paramIndex++}`);
        values.push(input.twitter);
      }
      if (input.telegram !== undefined) {
        updates.push(`telegram = $${paramIndex++}`);
        values.push(input.telegram);
      }
      if (input.token_address !== undefined) {
        updates.push(`token_address = $${paramIndex++}`);
        values.push(input.token_address);
      }
      if (input.token_metadata !== undefined) {
        updates.push(`token_metadata = $${paramIndex++}`);
        values.push(JSON.stringify(input.token_metadata));
      }
      if (input.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(input.status);
      }

      if (updates.length === 0) {
        // No updates, return current project
        return (await this.findById(id))!;
      }

      values.push(id);

      const result = await db.query<Project>(
        `UPDATE projects SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      const project = result.rows[0];

      logger.project('Project updated', {
        projectId: project.id.toString(),
        projectName: project.name,
        operation: 'update',
      });

      return project;
    } catch (error) {
      logger.error('Failed to update project', { id, input, error });
      throw error;
    }
  }

  /**
   * Update project status
   */
  static async updateStatus(
    id: number,
    status: ProjectStatus
  ): Promise<Project> {
    try {
      const updateData: any = { status };

      // If status is launching or launched, update launched_at
      if (status === ProjectStatus.LAUNCHING || status === ProjectStatus.LAUNCHED) {
        const result = await db.query<Project>(
          `UPDATE projects 
           SET status = $1, launched_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [status, id]
        );
        return result.rows[0];
      }

      return await this.update(id, updateData);
    } catch (error) {
      logger.error('Failed to update project status', { id, status, error });
      throw error;
    }
  }

  /**
   * Set token address (after deployment)
   */
  static async setTokenAddress(
    id: number,
    tokenAddress: string,
    metadata?: any
  ): Promise<Project> {
    try {
      const result = await db.query<Project>(
        `UPDATE projects 
         SET token_address = $1, token_metadata = $2, status = $3
         WHERE id = $4
         RETURNING *`,
        [tokenAddress, JSON.stringify(metadata), ProjectStatus.LAUNCHED, id]
      );

      const project = result.rows[0];

      logger.project('Token address set', {
        projectId: project.id.toString(),
        tokenAddress,
        operation: 'launch',
      });

      return project;
    } catch (error) {
      logger.error('Failed to set token address', { id, tokenAddress, error });
      throw error;
    }
  }

  /**
   * Delete project (cascade deletes wallets, transactions, etc.)
   */
  static async delete(id: number): Promise<void> {
    try {
      await db.query('DELETE FROM projects WHERE id = $1', [id]);

      logger.project('Project deleted', {
        projectId: id.toString(),
        operation: 'delete',
      });
    } catch (error) {
      logger.error('Failed to delete project', { id, error });
      throw error;
    }
  }

  /**
   * Count projects by user
   */
  static async countByUserId(userId: number): Promise<number> {
    try {
      const result = await db.query<{ count: string }>(
        'SELECT COUNT(*) FROM projects WHERE user_id = $1',
        [userId]
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to count projects', { userId, error });
      throw error;
    }
  }

  /**
   * Get latest project by user
   */
  static async getLatest(userId: number): Promise<Project | null> {
    try {
      const result = await db.query<Project>(
        `SELECT * FROM projects 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get latest project', { userId, error });
      throw error;
    }
  }

  /**
   * Check if project belongs to user
   */
  static async belongsToUser(projectId: number, userId: number): Promise<boolean> {
    try {
      const result = await db.query<{ exists: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1 AND user_id = $2)',
        [projectId, userId]
      );

      return result.rows[0].exists;
    } catch (error) {
      logger.error('Failed to check project ownership', { projectId, userId, error });
      throw error;
    }
  }
}