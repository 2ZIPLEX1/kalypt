import { ProjectModel, Project } from '../../db/models/project';
import { WalletModel } from '../../db/models/wallet';
import db from '../../db/connection';
import WalletManager from '../wallet';
import logger from '../../utils/logger';
import {
  CreateProjectOptions,
  UpdateProjectOptions,
  TokenMetadata,
  ProjectWithWallets,
  ProjectStats,
  ProjectListOptions,
  ProjectListResult,
} from './types';

/**
 * Project Manager
 * 
 * Manages token launch projects:
 * - Create/update/delete projects
 * - Manage token metadata
 * - Track project status
 * - Link wallets to projects
 * - Get project statistics
 */
export class ProjectManager {
  /**
   * Create new project
   * 
   * Creates project with metadata and optional dev wallet
   */
  async createProject(options: CreateProjectOptions): Promise<Project> {
    try {
      const project = await ProjectModel.create({
        user_id: options.userId,
        name: options.name,
        ticker: options.ticker,
        description: options.description,
        image_url: options.imageUrl,
        website: options.website,
        twitter: options.twitter,
        telegram: options.telegram,
      });
      
      logger.info('Project created', {
        projectId: project.id,
        name: project.name,
        ticker: project.ticker,
        userId: options.userId,
      });
      
      // Auto-create dev wallet
      try {
        await WalletManager.createWallet({
          projectId: project.id,
          walletType: 'dev',
          label: 'Creator',
        });
        
        logger.info('Dev wallet auto-created', { projectId: project.id });
      } catch (error) {
        logger.error('Failed to create dev wallet', { projectId: project.id, error });
      }
      
      return project;
    } catch (error) {
      logger.error('Failed to create project', { options, error });
      throw error;
    }
  }
  
  /**
   * Get project by ID
   */
  async getProject(projectId: number): Promise<Project | null> {
    try {
      return await ProjectModel.findById(projectId);
    } catch (error) {
      logger.error('Failed to get project', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Get project with wallets
   */
  async getProjectWithWallets(projectId: number): Promise<ProjectWithWallets | null> {
    try {
      const project = await ProjectModel.findById(projectId);
      
      if (!project) {
        return null;
      }
      
      const wallets = await WalletModel.findByProjectId(projectId);
      const balances = await WalletManager.getProjectBalances(projectId);
      
      const walletsWithBalances = wallets.map(w => ({
        id: w.id,
        address: w.address,
        wallet_type: w.wallet_type,
        label: w.label,
        balance_sol: balances.get(w.id) || 0,
      }));
      
      const totalBalance = Array.from(balances.values()).reduce((sum, b) => sum + b, 0);
      
      return {
        ...project,
        wallets: walletsWithBalances,
        total_wallets: wallets.length,
        total_balance: totalBalance,
      };
    } catch (error) {
      logger.error('Failed to get project with wallets', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Update project
   */
  async updateProject(
    projectId: number,
    options: UpdateProjectOptions
  ): Promise<Project> {
    try {
      const project = await ProjectModel.update(projectId, options);
      
      logger.info('Project updated', {
        projectId,
        updates: Object.keys(options),
      });
      
      return project;
    } catch (error) {
      logger.error('Failed to update project', { projectId, options, error });
      throw error;
    }
  }
  
  /**
   * Update project metadata
   */
  async updateMetadata(
    projectId: number,
    metadata: Partial<TokenMetadata>
  ): Promise<Project> {
    try {
      const project = await ProjectModel.findById(projectId);
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      // Merge with existing metadata
      const currentMetadata = project.token_metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...metadata,
      };
      
      return await this.updateProject(projectId, {
        name: metadata.name || project.name,
        ticker: metadata.symbol || project.ticker,
        description: metadata.description || project.description,
        imageUrl: metadata.image || project.image_url,
        website: metadata.website || project.website,
        twitter: metadata.twitter || project.twitter,
        telegram: metadata.telegram || project.telegram,
        tokenMetadata: updatedMetadata,
      });
    } catch (error) {
      logger.error('Failed to update metadata', { projectId, metadata, error });
      throw error;
    }
  }
  
  /**
   * Set token address (after deployment)
   */
  async setTokenAddress(projectId: number, tokenAddress: string): Promise<Project> {
    try {
      const project = await this.updateProject(projectId, {
        tokenAddress,
        status: 'ready', // Changed from 'deployed' to 'ready'
      });
      
      logger.info('Token address set', {
        projectId,
        tokenAddress,
      });
      
      return project;
    } catch (error) {
      logger.error('Failed to set token address', { projectId, tokenAddress, error });
      throw error;
    }
  }
  
  /**
   * Mark project as launched
   */
  async markAsLaunched(projectId: number): Promise<Project> {
    try {
      const project = await ProjectModel.findById(projectId);
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      // Update status to launched
      const updated = await ProjectModel.update(projectId, {
        status: 'launched',
      });
      
      // Update launched_at timestamp manually
      await db.query(
        'UPDATE projects SET launched_at = NOW() WHERE id = $1',
        [projectId]
      );
      
      logger.info('Project marked as launched', { projectId });
      
      return updated;
    } catch (error) {
      logger.error('Failed to mark project as launched', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Get project statistics
   */
  async getStats(projectId: number): Promise<ProjectStats> {
    try {
      const project = await ProjectModel.findById(projectId);
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      const wallets = await WalletModel.findByProjectId(projectId);
      const totalBalance = await WalletManager.getTotalProjectBalance(projectId);
      
      const walletsByType = {
        dev: wallets.filter(w => w.wallet_type === 'dev').length,
        bundle: wallets.filter(w => w.wallet_type === 'bundle').length,
        sniper: wallets.filter(w => w.wallet_type === 'sniper').length,
      };
      
      return {
        totalWallets: wallets.length,
        walletsByType,
        totalBalance,
        tokenDeployed: !!project.token_address,
        status: project.status,
      };
    } catch (error) {
      logger.error('Failed to get project stats', { projectId, error });
      throw error;
    }
  }
  
  /**
   * List user projects
   */
  async listProjects(options: ProjectListOptions): Promise<ProjectListResult> {
    try {
      // Get all user projects
      const allProjects = await ProjectModel.findByUserId(options.userId);
      
      // Filter by status if provided
      const filteredProjects = options.status
        ? allProjects.filter(p => p.status === options.status)
        : allProjects;
      
      // Apply pagination
      const limit = options.limit || 10;
      const offset = options.offset || 0;
      
      const paginatedProjects = filteredProjects.slice(offset, offset + limit);
      const hasMore = filteredProjects.length > offset + limit;
      
      return {
        projects: paginatedProjects,
        total: filteredProjects.length,
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to list projects', { options, error });
      throw error;
    }
  }
  
  /**
   * Delete project
   * 
   * Deletes project and all associated wallets
   */
  async deleteProject(projectId: number): Promise<void> {
    try {
      const project = await ProjectModel.findById(projectId);
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      // Delete all project wallets
      const wallets = await WalletModel.findByProjectId(projectId);
      
      for (const wallet of wallets) {
        await WalletManager.deleteWallet(wallet.id);
      }
      
      // Delete project
      await ProjectModel.delete(projectId);
      
      logger.info('Project deleted', {
        projectId,
        walletsDeleted: wallets.length,
      });
    } catch (error) {
      logger.error('Failed to delete project', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Check if user owns project
   */
  async hasAccess(userId: number, projectId: number): Promise<boolean> {
    try {
      const project = await ProjectModel.findById(projectId);
      return project?.user_id === userId;
    } catch (error) {
      logger.error('Failed to check project access', { userId, projectId, error });
      return false;
    }
  }
  
  /**
   * Ensure user has access (throw error if not)
   */
  async ensureAccess(userId: number, projectId: number): Promise<void> {
    const hasAccess = await this.hasAccess(userId, projectId);
    
    if (!hasAccess) {
      throw new Error('Access denied: You do not own this project');
    }
  }
  
  /**
   * Get project by token address
   */
  async findByTokenAddress(tokenAddress: string): Promise<Project | null> {
    try {
      const result = await db.query<Project>(
        'SELECT *, token_address as token_ca FROM projects WHERE token_address = $1',
        [tokenAddress]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find project by token address', { tokenAddress, error });
      throw error;
    }
  }
  
  /**
   * Count user projects
   */
  async countUserProjects(userId: number): Promise<number> {
    try {
      const projects = await ProjectModel.findByUserId(userId);
      return projects.length;
    } catch (error) {
      logger.error('Failed to count user projects', { userId, error });
      throw error;
    }
  }
}

// Export singleton instance
export default new ProjectManager();