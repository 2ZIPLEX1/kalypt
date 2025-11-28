/**
 * Launch mode types
 */
export type LaunchMode = 
  | 'basic'           // Simple launch without additional features
  | 'bundle'          // Launch with bundle buy
  | 'snipe'           // Launch with snipe
  | 'bundle_snipe';   // Launch with bundle + snipe

/**
 * Launch status
 */
export type LaunchStatus = 
  | 'preparing'
  | 'deploying'
  | 'bundling'
  | 'sniping'
  | 'completed'
  | 'failed';

/**
 * Base launch configuration
 */
export interface BaseLaunchConfig {
  projectId: number;
  mode: LaunchMode;
}

/**
 * Basic launch configuration
 */
export interface BasicLaunchConfig extends BaseLaunchConfig {
  mode: 'basic';
  devBuyAmount?: number; // Optional dev buy amount in SOL
}

/**
 * Bundle launch configuration
 */
export interface BundleLaunchConfig extends BaseLaunchConfig {
  mode: 'bundle';
  devBuyAmount: number; // Dev buy amount in SOL
  bundleWalletCount: number; // Number of wallets for bundle (max 15)
  bundleTotalAmount: number; // Total SOL for bundle
  jitoTip?: number; // Jito tip in SOL
}

/**
 * Snipe launch configuration
 */
export interface SnipeLaunchConfig extends BaseLaunchConfig {
  mode: 'snipe';
  devBuyAmount: number;
  sniperWalletCount: number; // Number of sniper wallets
  maxSnipeSpend: number; // Max SOL to spend on snipes
  snipeBuyRange: [number, number]; // [min, max] SOL per snipe
  maxSniperPercent: number; // Max % snipers can buy before auto-sell (0-100)
}

/**
 * Bundle + Snipe launch configuration
 */
export interface BundleSnipeLaunchConfig extends BaseLaunchConfig {
  mode: 'bundle_snipe';
  devBuyAmount: number;
  bundleWalletCount: number;
  bundleTotalAmount: number;
  sniperWalletCount: number;
  maxSnipeSpend: number;
  snipeBuyRange: [number, number];
  maxSniperPercent: number;
  jitoTip?: number;
}

/**
 * Union type for all launch configs
 */
export type LaunchConfig = 
  | BasicLaunchConfig
  | BundleLaunchConfig
  | SnipeLaunchConfig
  | BundleSnipeLaunchConfig;

/**
 * Launch result
 */
export interface LaunchResult {
  success: boolean;
  projectId: number;
  tokenAddress?: string;
  mode: LaunchMode;
  status: LaunchStatus;
  devBuySignature?: string;
  bundleId?: string;
  bundleSignatures?: string[];
  snipeSignatures?: string[];
  error?: string;
  details: LaunchDetails;
}

/**
 * Launch details
 */
export interface LaunchDetails {
  tokenDeployed: boolean;
  devBuyExecuted: boolean;
  bundleExecuted: boolean;
  snipesExecuted: boolean;
  totalSpent: number;
  tokensPurchased: number;
  walletsUsed: number;
  duration: number; // milliseconds
}

/**
 * Launch validation result
 */
export interface LaunchValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requirements: {
    minCreatorBalance: number;
    minBundleWallets: number;
    minSniperWallets: number;
    estimatedCost: number;
  };
}

/**
 * Launch progress callback
 */
export type LaunchProgressCallback = (
  status: LaunchStatus,
  message: string,
  progress: number
) => void | Promise<void>;