import { ProjectStatus } from '../../db/models/project';

/**
 * Project creation options
 */
export interface CreateProjectOptions {
  userId: number;
  name: string;
  ticker: string;
  description?: string;
  imageUrl?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

/**
 * Project update options
 */
export interface UpdateProjectOptions {
  name?: string;
  ticker?: string;
  description?: string;
  imageUrl?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  tokenAddress?: string;
  tokenMetadata?: any;
  status?: ProjectStatus;
}

/**
 * Token metadata structure
 */
export interface TokenMetadata {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  extensions?: {
    website?: string;
    twitter?: string;
    telegram?: string;
  };
}

/**
 * Project with wallets
 */
export interface ProjectWithWallets {
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
  token_ca?: string;
  token_metadata?: TokenMetadata;
  status: ProjectStatus;
  created_at: Date;
  updated_at: Date;
  launched_at?: Date;
  wallets: {
    id: number;
    address: string;
    wallet_type: string;
    label?: string;
    balance_sol: number;
  }[];
  total_wallets: number;
  total_balance: number;
}

/**
 * Project statistics
 */
export interface ProjectStats {
  totalWallets: number;
  walletsByType: {
    dev: number;
    bundle: number;
    sniper: number;
  };
  totalBalance: number;
  tokenDeployed: boolean;
  status: ProjectStatus;
}

/**
 * Project list options
 */
export interface ProjectListOptions {
  userId: number;
  status?: ProjectStatus;
  limit?: number;
  offset?: number;
}

/**
 * Project list result
 */
export interface ProjectListResult {
  projects: any[]; // Project[]
  total: number;
  hasMore: boolean;
}