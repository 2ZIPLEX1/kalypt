import {
  Keypair,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  PublicKey,
} from '@solana/web3.js';
import { connection, keypairFromPrivateKey } from '../../utils/solana';
import { WalletModel } from '../../db/models/wallet';
import { TransactionModel } from '../../db/models/transaction';
import { JITO_TIP_ACCOUNTS, JITO_BUNDLE_CONFIG } from '../../constants/jito';
import config from '../../config';
import logger from '../../utils/logger';
import type {
  BundleConfig,
  BundleTransaction,
  BundleResult,
  BundleTransactionResult,
  JitoBundleResponse,
  JitoBundleStatus,
  BundleBuyConfig,
  BundleSellConfig,
  SmartBundleSelection,
} from './types';

/**
 * Jupiter API interfaces
 */
interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | any;
  priceImpactPct: string;
  routePlan: any[];
}

interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

/**
 * Bundle Creator
 */
export class BundleCreator {
  private readonly JITO_ENDPOINTS = [
    'https://mainnet.block-engine.jito.wtf',
    'https://amsterdam.mainnet.block-engine.jito.wtf',
    'https://frankfurt.mainnet.block-engine.jito.wtf',
    'https://ny.mainnet.block-engine.jito.wtf',
    'https://tokyo.mainnet.block-engine.jito.wtf',
  ];
  
  private readonly JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
  private readonly JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
  private readonly SOL_MINT = 'So11111111111111111111111111111111111111112';
  
  private currentEndpointIndex = 0;
  
  private getJitoEndpoint(): string {
    const endpoint = this.JITO_ENDPOINTS[this.currentEndpointIndex];
    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.JITO_ENDPOINTS.length;
    return endpoint;
  }
  
  async executeBundleBuy(bundleConfig: BundleBuyConfig): Promise<BundleResult> {
    try {
      logger.info('Starting bundle buy', {
        projectId: bundleConfig.projectId,
        walletCount: bundleConfig.walletIds.length,
        amountPerWallet: bundleConfig.amountPerWallet,
      });
      
      return await this.executeBundle({
        projectId: bundleConfig.projectId,
        walletIds: bundleConfig.walletIds,
        tokenAddress: bundleConfig.tokenAddress,
        type: 'buy',
        amountPerWallet: bundleConfig.amountPerWallet,
        jitoTipLamports: bundleConfig.jitoTip ? bundleConfig.jitoTip * 1e9 : undefined,
      });
    } catch (error) {
      logger.error('Bundle buy failed', { bundleConfig, error });
      throw error;
    }
  }
  
  async executeBundleSell(bundleConfig: BundleSellConfig): Promise<BundleResult> {
    try {
      logger.info('Starting bundle sell', {
        projectId: bundleConfig.projectId,
        walletCount: bundleConfig.walletIds.length,
        percentage: bundleConfig.percentage,
      });
      
      return await this.executeBundle({
        projectId: bundleConfig.projectId,
        walletIds: bundleConfig.walletIds,
        tokenAddress: bundleConfig.tokenAddress,
        type: 'sell',
        jitoTipLamports: bundleConfig.jitoTip ? bundleConfig.jitoTip * 1e9 : undefined,
      });
    } catch (error) {
      logger.error('Bundle sell failed', { bundleConfig, error });
      throw error;
    }
  }
  
  private async executeBundle(bundleConfig: BundleConfig): Promise<BundleResult> {
    try {
      const transactions: VersionedTransaction[] = [];
      const walletKeypairs: Keypair[] = [];
      
      for (const walletId of bundleConfig.walletIds) {
        const wallet = await WalletModel.getWithPrivateKey(walletId);
        
        if (!wallet || !wallet.private_key) {
          logger.error('Cannot decrypt wallet', { walletId });
          continue;
        }
        
        const keypair = keypairFromPrivateKey(wallet.private_key);
        walletKeypairs.push(keypair);
        
        let bundleTx: BundleTransaction;
        
        if (bundleConfig.type === 'buy') {
          bundleTx = await this.buildBuyTransaction(
            walletId,
            bundleConfig.tokenAddress,
            bundleConfig.amountPerWallet || 0,
            15
          );
        } else {
          bundleTx = await this.buildSellTransaction(
            walletId,
            bundleConfig.tokenAddress,
            100,
            15
          );
        }
        
        transactions.push(bundleTx.transaction);
      }
      
      if (transactions.length === 0) {
        throw new Error('No valid transactions to bundle');
      }
      
      const tipAmount = bundleConfig.jitoTipLamports || JITO_BUNDLE_CONFIG.DEFAULT_TIP;
      const tipTx = await this.createJitoTipTransaction(
        walletKeypairs[walletKeypairs.length - 1],
        tipAmount
      );
      
      for (let i = 0; i < transactions.length; i++) {
        transactions[i].sign([walletKeypairs[i]]);
      }
      
      tipTx.sign([walletKeypairs[walletKeypairs.length - 1]]);
      transactions.push(tipTx);
      
      logger.info('Sending bundle to Jito', {
        transactionCount: transactions.length,
        tipAmount,
      });
      
      const bundleId = await this.sendBundle(transactions);
      logger.info('Bundle sent', { bundleId });
      
      const confirmed = await this.waitForBundleConfirmation(bundleId);
      
      if (!confirmed) {
        throw new Error('Bundle confirmation timeout');
      }
      
      const signatures = transactions.map((_tx, i) => `bundle_${bundleId}_tx${i}`);
      
      for (let i = 0; i < bundleConfig.walletIds.length; i++) {
        await TransactionModel.create({
          project_id: bundleConfig.projectId,
          wallet_id: bundleConfig.walletIds[i],
          signature: signatures[i],
          type: bundleConfig.type === 'mixed' ? 'buy' : bundleConfig.type,
          amount: bundleConfig.amountPerWallet || 0,
          token_address: bundleConfig.tokenAddress,
          status: 'confirmed',
          metadata: { bundleId, bundleIndex: i },
        });
      }
      
      const details: BundleTransactionResult[] = bundleConfig.walletIds.map((walletId: number, i: number) => ({
        walletId,
        signature: signatures[i],
        success: true,
      }));
      
      return {
        bundleId,
        success: true,
        transactionSignatures: signatures,
        details,
      };
    } catch (error) {
      logger.error('Bundle execution failed', { bundleConfig, error });
      
      return {
        bundleId: '',
        success: false,
        transactionSignatures: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        details: [],
      };
    }
  }
  
  private async createJitoTipTransaction(
    payer: Keypair,
    tipLamports: number
  ): Promise<VersionedTransaction> {
    try {
      const tipAccount = JITO_TIP_ACCOUNTS[
        Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)
      ];
      
      const tipInstruction = SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: tipAccount,
        lamports: tipLamports,
      });
      
      const { blockhash } = await connection.getLatestBlockhash();
      
      const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions: [tipInstruction],
      }).compileToV0Message();
      
      const versionedTx = new VersionedTransaction(messageV0);
      
      logger.info('Jito tip transaction created', {
        tipAccount: tipAccount.toString(),
        tipLamports,
      });
      
      return versionedTx;
    } catch (error) {
      logger.error('Failed to create Jito tip transaction', { error });
      throw error;
    }
  }
  
  private async buildBuyTransaction(
    walletId: number,
    tokenAddress: string,
    amountSol: number,
    slippage?: number
  ): Promise<BundleTransaction> {
    const wallet = await WalletModel.getWithPrivateKey(walletId);
    
    if (!wallet || !wallet.private_key) {
      throw new Error('Cannot decrypt wallet');
    }
    
    const keypair = keypairFromPrivateKey(wallet.private_key);
    
    try {
      const amountLamports = Math.floor(amountSol * 1e9);
      
      const quote = await this.getJupiterQuote(
        this.SOL_MINT,
        tokenAddress,
        amountLamports,
        slippage || 15
      );
      
      const swapTxBase64 = await this.getJupiterSwapTransaction(
        quote,
        keypair.publicKey.toString()
      );
      
      const swapTxBuffer = Buffer.from(swapTxBase64, 'base64');
      const versionedTx = VersionedTransaction.deserialize(swapTxBuffer);
      
      logger.info('Buy transaction built', {
        walletId,
        inputAmount: amountSol,
        outputAmount: parseInt(quote.outAmount),
      });
      
      return {
        walletId,
        transaction: versionedTx,
        description: `Buy ${amountSol} SOL worth of ${tokenAddress}`,
      };
    } catch (error) {
      logger.error('Failed to build buy transaction', { walletId, error });
      throw error;
    }
  }
  
  private async buildSellTransaction(
    walletId: number,
    tokenAddress: string,
    percentage: number,
    slippage?: number
  ): Promise<BundleTransaction> {
    const wallet = await WalletModel.getWithPrivateKey(walletId);
    
    if (!wallet || !wallet.private_key) {
      throw new Error('Cannot decrypt wallet');
    }
    
    const keypair = keypairFromPrivateKey(wallet.private_key);
    
    try {
      const tokenBalance = await this.getTokenBalance(
        keypair.publicKey,
        new PublicKey(tokenAddress)
      );
      
      if (tokenBalance === 0) {
        throw new Error('No token balance to sell');
      }
      
      const amountToSell = (tokenBalance * percentage) / 100;
      const amountBaseUnits = Math.floor(amountToSell * Math.pow(10, 6));
      
      const quote = await this.getJupiterQuote(
        tokenAddress,
        this.SOL_MINT,
        amountBaseUnits,
        slippage || 15
      );
      
      const swapTxBase64 = await this.getJupiterSwapTransaction(
        quote,
        keypair.publicKey.toString()
      );
      
      const swapTxBuffer = Buffer.from(swapTxBase64, 'base64');
      const versionedTx = VersionedTransaction.deserialize(swapTxBuffer);
      
      logger.info('Sell transaction built', {
        walletId,
        inputAmount: amountToSell,
        percentage,
      });
      
      return {
        walletId,
        transaction: versionedTx,
        description: `Sell ${percentage}% of ${tokenAddress}`,
      };
    } catch (error) {
      logger.error('Failed to build sell transaction', { walletId, error });
      throw error;
    }
  }
  
  private async getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number
  ): Promise<JupiterQuoteResponse> {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: (slippageBps * 100).toString(),
        onlyDirectRoutes: 'false',
        asLegacyTransaction: 'false',
      });
      
      const response = await fetch(`${this.JUPITER_QUOTE_API}?${params}`);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Jupiter quote failed: ${error}`);
      }
      
      return await response.json() as JupiterQuoteResponse;
    } catch (error) {
      logger.error('Failed to get Jupiter quote', { error });
      throw error;
    }
  }
  
  private async getJupiterSwapTransaction(
    quoteResponse: JupiterQuoteResponse,
    userPublicKey: string
  ): Promise<string> {
    try {
      const response = await fetch(this.JUPITER_SWAP_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: config.compute.unitPrice,
          dynamicComputeUnitLimit: true,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Jupiter swap transaction failed: ${error}`);
      }
      
      const data = await response.json() as JupiterSwapResponse;
      return data.swapTransaction;
    } catch (error) {
      logger.error('Failed to get Jupiter swap transaction', { error });
      throw error;
    }
  }
  
  private async getTokenBalance(
    walletPubkey: PublicKey,
    tokenMint: PublicKey
  ): Promise<number> {
    try {
      const accounts = await connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { mint: tokenMint }
      );
      
      if (accounts.value.length === 0) {
        return 0;
      }
      
      let totalBalance = 0;
      for (const account of accounts.value) {
        const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
        totalBalance += balance || 0;
      }
      
      return totalBalance;
    } catch (error) {
      logger.error('Failed to get token balance', { error });
      return 0;
    }
  }
  
  private async sendBundle(transactions: VersionedTransaction[]): Promise<string> {
    try {
      const endpoint = this.getJitoEndpoint();
      
      const serializedTxs = transactions.map(tx => 
        Buffer.from(tx.serialize()).toString('base64')
      );
      
      const response = await fetch(`${endpoint}/api/v1/bundles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: [serializedTxs],
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Jito bundle submission failed: ${response.statusText}`);
      }
      
      const data = await response.json() as JitoBundleResponse;
      
      if (!data.result) {
        throw new Error('No bundle ID returned from Jito');
      }
      
      return data.result;
    } catch (error) {
      logger.error('Failed to send bundle to Jito', { error });
      throw error;
    }
  }
  
  private async waitForBundleConfirmation(
    bundleId: string,
    maxAttempts: number = 30
  ): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await this.getBundleStatus(bundleId);
        
        if (status && status.value.length > 0) {
          const bundle = status.value[0];
          
          if (bundle.confirmation_status === 'confirmed' || bundle.confirmation_status === 'finalized') {
            logger.info('Bundle confirmed', {
              bundleId,
              slot: bundle.slot,
              status: bundle.confirmation_status,
            });
            return true;
          }
          
          if (bundle.err) {
            logger.error('Bundle failed', {
              bundleId,
              error: bundle.err,
            });
            return false;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error('Failed to check bundle status', { bundleId, error });
      }
    }
    
    logger.warn('Bundle confirmation timeout', { bundleId });
    return false;
  }
  
  private async getBundleStatus(bundleId: string): Promise<JitoBundleStatus | null> {
    try {
      const endpoint = this.getJitoEndpoint();
      
      const response = await fetch(`${endpoint}/api/v1/bundles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBundleStatuses',
          params: [[bundleId]],
        }),
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json() as { result: JitoBundleStatus };
      return data.result;
    } catch (error) {
      logger.error('Failed to get bundle status', { bundleId, error });
      return null;
    }
  }
  
  async selectWalletsForBundle(
    projectId: number,
    targetAmount: number,
    maxWallets: number = 15
  ): Promise<SmartBundleSelection> {
    try {
      const wallets = await WalletModel.findByProjectId(projectId);
      const bundleWallets = wallets.filter(w => w.wallet_type === 'bundle');
      
      const walletsWithBalance = await Promise.all(
        bundleWallets.map(async (w) => {
          const balance = await connection.getBalance(
            new PublicKey(w.address)
          );
          return {
            ...w,
            balance: balance / 1e9,
          };
        })
      );
      
      walletsWithBalance.sort((a, b) => b.balance - a.balance);
      
      const selected = walletsWithBalance.slice(0, maxWallets);
      
      const utilizationPercent = 80;
      const allocations = selected.map(w => ({
        walletId: w.id,
        address: w.address,
        balance: w.balance,
        allocatedAmount: (w.balance * utilizationPercent) / 100,
        utilizationPercent,
      }));
      
      const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
      const achievedPercent = (totalAllocated / targetAmount) * 100;
      
      return {
        selectedWallets: allocations,
        totalAllocated,
        targetAmount,
        achievedPercent,
      };
    } catch (error) {
      logger.error('Failed to select wallets for bundle', { projectId, error });
      throw error;
    }
  }
}

export default new BundleCreator();