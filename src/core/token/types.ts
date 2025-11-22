import { PublicKey } from '@solana/web3.js';

/**
 * Token deployment options
 */
export interface TokenDeployOptions {
  projectId: number;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  initialLiquiditySol?: number;
}

/**
 * Token metadata for IPFS
 */
export interface TokenMetadataIPFS {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: boolean;
  createdOn: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

/**
 * Token deployment result
 */
export interface TokenDeployResult {
  tokenAddress: string;
  signature: string;
  metadataUri?: string;
  bondingCurve?: string;
  associatedBondingCurve?: string;
}

/**
 * Pump.fun create params
 */
export interface PumpFunCreateParams {
  name: string;
  symbol: string;
  uri: string; // IPFS metadata URI
  mint: PublicKey; // Token mint address
}

/**
 * Token creation transaction
 */
export interface TokenCreationTx {
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  metadata: PublicKey;
  instructions: any[];
}

/**
 * IPFS upload result
 */
export interface IPFSUploadResult {
  uri: string;
  metadata: TokenMetadataIPFS;
}

/**
 * Token info from blockchain
 */
export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: number;
  metadataUri?: string;
}