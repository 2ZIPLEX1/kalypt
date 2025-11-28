import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { connection } from '../../utils/solana';
import { keypairFromPrivateKey, solToLamports } from '../../utils/solana';
import { WalletModel } from '../../db/models/wallet';
import { TransactionModel } from '../../db/models/transaction';
import { ProjectModel } from '../../db/models/project';
import { UserModel } from '../../db/models/user';
import FeeManager from '../fees';
import logger from '../../utils/logger';
import config from '../../config';
import {
  SwapOptions,
  SingleSwapOptions,
  SwapResult,
  BatchSwapResult,
  TokenBalance,
  SwapStats,
} from './types';

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

interface JupiterPriceData {
  data: {
    [key: string]: {
      id: string;
      type: string;
      price: number;
    };
  };
}

export class SwapManager {
  private readonly JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
  private readonly JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
  private readonly SOL_MINT = 'So11111111111111111111111111111111111111112';

  async executeBatchSwap(options: SwapOptions): Promise<BatchSwapResult> {
    try {
      logger.info('Starting batch swap', {
        projectId: options.projectId,
        walletCount: options.walletIds.length,
        type: options.type,
        amount: options.amountSol || options.percentage,
      });
      
      const successful: SwapResult[] = [];
      const failed: SwapResult[] = [];
      
      for (const walletId of options.walletIds) {
        try {
          const result = await this.executeSingleSwap({
            walletId,
            tokenAddress: options.tokenAddress,
            type: options.type,
            amountSol: options.amountSol,
            amountTokens: options.amountTokens,
            percentage: options.percentage,
            slippage: options.slippage,
          });
          
          successful.push(result);
          logger.info('Wallet swap successful', { walletId, signature: result.signature });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          failed.push({
            walletId,
            signature: '',
            type: options.type,
            amountIn: 0,
            amountOut: 0,
            success: false,
            error: errorMessage,
          });
          logger.error('Wallet swap failed', { walletId, error });
        }
      }
      
      logger.info('Batch swap complete', {
        successful: successful.length,
        failed: failed.length,
        total: options.walletIds.length,
      });
      
      return {
        successful,
        failed,
        totalSuccess: successful.length,
        totalFailed: failed.length,
      };
    } catch (error) {
      logger.error('Batch swap failed', { options, error });
      throw error;
    }
  }

  async executeSingleSwap(options: SingleSwapOptions): Promise<SwapResult> {
    try {
      const wallet = await WalletModel.getWithPrivateKey(options.walletId);
      if (!wallet || !wallet.private_key) {
        throw new Error('Cannot decrypt wallet');
      }
      
      const keypair = keypairFromPrivateKey(wallet.private_key);
      const project = await ProjectModel.findById(wallet.project_id);
      if (!project) {
        throw new Error('Project not found');
      }
      
      const user = await UserModel.findById(project.user_id);
      if (!user) {
        throw new Error('User not found');
      }
      
      if (options.type === 'buy') {
        return await this.executeBuy(keypair, wallet, options, user.id);
      } else {
        return await this.executeSell(keypair, wallet, options, user.id);
      }
    } catch (error) {
      logger.error('Single swap failed', { options, error });
      throw error;
    }
  }

  private async executeBuy(
    keypair: Keypair,
    wallet: any,
    options: SingleSwapOptions,
    userId: number
  ): Promise<SwapResult> {
    try {
      if (!options.amountSol) {
        throw new Error('Amount SOL is required for buy');
      }
      
      const { net: netAmount, fee: feeAmount } = await FeeManager.deductFee(options.amountSol, userId);
      
      logger.info('Buy swap', {
        walletId: options.walletId,
        grossAmount: options.amountSol,
        netAmount,
        fee: feeAmount,
      });
      
      if (feeAmount > 0) {
        await FeeManager.collectFee(keypair, feeAmount);
      }
      
      const amountLamports = solToLamports(netAmount);
      const slippageBps = (options.slippage || 15) * 100;
      
      const quote = await this.getJupiterQuote({
        inputMint: this.SOL_MINT,
        outputMint: options.tokenAddress,
        amount: amountLamports,
        slippageBps,
      });
      
      if (!quote) {
        throw new Error('Failed to get Jupiter quote');
      }
      
      logger.info('Jupiter quote received', {
        inputAmount: netAmount + ' SOL',
        outputAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct,
      });
      
      const swapTx = await this.getJupiterSwapTransaction(quote, keypair.publicKey.toString());
      if (!swapTx) {
        throw new Error('Failed to get swap transaction');
      }
      
      const transaction = VersionedTransaction.deserialize(Buffer.from(swapTx.swapTransaction, 'base64'));
      transaction.sign([keypair]);
      
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      
      logger.info('Buy transaction sent', { signature, walletId: options.walletId });
      await connection.confirmTransaction(signature, 'confirmed');
      
      const tokensReceived = parseInt(quote.outAmount) / Math.pow(10, 6);
      
      await TransactionModel.create({
        project_id: wallet.project_id,
        wallet_id: wallet.id,
        signature,
        type: 'buy',
        amount: netAmount,
        token_address: options.tokenAddress,
        status: 'confirmed',
        metadata: {
          inputMint: this.SOL_MINT,
          outputMint: options.tokenAddress,
          amountIn: netAmount,
          amountOut: tokensReceived,
          priceImpact: quote.priceImpactPct,
        },
      });
      
      return {
        walletId: wallet.id,
        signature,
        type: 'buy',
        amountIn: netAmount,
        amountOut: tokensReceived,
        success: true,
      };
    } catch (error) {
      logger.error('Buy execution failed', { wallet: wallet.id, error });
      throw error;
    }
  }

  private async executeSell(
    keypair: Keypair,
    wallet: any,
    options: SingleSwapOptions,
    userId: number
  ): Promise<SwapResult> {
    try {
      let amountToSell: number;
      
      if (options.amountTokens) {
        amountToSell = options.amountTokens;
      } else if (options.percentage) {
        const tokenBalance = await this.getTokenBalance(keypair.publicKey.toString(), options.tokenAddress);
        amountToSell = (tokenBalance * options.percentage) / 100;
      } else {
        throw new Error('Either amountTokens or percentage is required for sell');
      }
      
      if (amountToSell <= 0) {
        throw new Error('No tokens to sell');
      }
      
      logger.info('Sell swap', {
        walletId: options.walletId,
        amountTokens: amountToSell,
        percentage: options.percentage,
      });
      
      const amountBaseUnits = Math.floor(amountToSell * Math.pow(10, 6));
      const slippageBps = (options.slippage || 15) * 100;
      
      const quote = await this.getJupiterQuote({
        inputMint: options.tokenAddress,
        outputMint: this.SOL_MINT,
        amount: amountBaseUnits,
        slippageBps,
      });
      
      if (!quote) {
        throw new Error('Failed to get Jupiter quote');
      }
      
      const solToReceive = parseInt(quote.outAmount) / 1e9;
      
      logger.info('Jupiter sell quote received', {
        inputTokens: amountToSell,
        outputSOL: solToReceive,
        priceImpact: quote.priceImpactPct,
      });
      
      const swapTx = await this.getJupiterSwapTransaction(quote, keypair.publicKey.toString());
      if (!swapTx) {
        throw new Error('Failed to get swap transaction');
      }
      
      const transaction = VersionedTransaction.deserialize(Buffer.from(swapTx.swapTransaction, 'base64'));
      transaction.sign([keypair]);
      
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      
      logger.info('Sell transaction sent', { signature, walletId: options.walletId });
      await connection.confirmTransaction(signature, 'confirmed');
      
      const { net: netAmount, fee: feeAmount } = await FeeManager.deductFee(solToReceive, userId);
      
      if (feeAmount > 0) {
        await FeeManager.collectFee(keypair, feeAmount);
      }
      
      await TransactionModel.create({
        project_id: wallet.project_id,
        wallet_id: wallet.id,
        signature,
        type: 'sell',
        amount: netAmount,
        token_address: options.tokenAddress,
        status: 'confirmed',
        metadata: {
          inputMint: options.tokenAddress,
          outputMint: this.SOL_MINT,
          amountIn: amountToSell,
          amountOut: netAmount,
          priceImpact: quote.priceImpactPct,
        },
      });
      
      return {
        walletId: wallet.id,
        signature,
        type: 'sell',
        amountIn: amountToSell,
        amountOut: netAmount,
        success: true,
      };
    } catch (error) {
      logger.error('Sell execution failed', { wallet: wallet.id, error });
      throw error;
    }
  }

  private async getJupiterQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
  }): Promise<JupiterQuoteResponse | null> {
    try {
      const url = new URL(this.JUPITER_QUOTE_API);
      url.searchParams.append('inputMint', params.inputMint);
      url.searchParams.append('outputMint', params.outputMint);
      url.searchParams.append('amount', params.amount.toString());
      url.searchParams.append('slippageBps', params.slippageBps.toString());
      url.searchParams.append('onlyDirectRoutes', 'false');
      url.searchParams.append('asLegacyTransaction', 'false');
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        const error = await response.text();
        logger.error('Jupiter quote failed', { status: response.status, error });
        return null;
      }
      
      const quote = await response.json() as JupiterQuoteResponse;
      return quote;
    } catch (error) {
      logger.error('Failed to get Jupiter quote', { params, error });
      return null;
    }
  }

  private async getJupiterSwapTransaction(
    quote: JupiterQuoteResponse,
    userPublicKey: string
  ): Promise<JupiterSwapResponse | null> {
    try {
      const response = await fetch(this.JUPITER_SWAP_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: config.compute.unitPrice,
          dynamicComputeUnitLimit: true,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        logger.error('Jupiter swap transaction failed', { status: response.status, error });
        return null;
      }
      
      const swapResult = await response.json() as JupiterSwapResponse;
      return swapResult;
    } catch (error) {
      logger.error('Failed to get swap transaction', { error });
      return null;
    }
  }

  private async getTokenBalance(walletAddress: string, tokenAddress: string): Promise<number> {
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const tokenMint = new PublicKey(tokenAddress);
      
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, { mint: tokenMint });
      
      if (tokenAccounts.value.length === 0) {
        return 0;
      }
      
      let totalBalance = 0;
      for (const account of tokenAccounts.value) {
        const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
        if (balance) {
          totalBalance += balance;
        }
      }
      
      return totalBalance;
    } catch (error) {
      logger.error('Failed to get token balance', { walletAddress, tokenAddress, error });
      return 0;
    }
  }

  async getProjectBalances(projectId: number, tokenAddress: string): Promise<TokenBalance[]> {
    try {
      const wallets = await WalletModel.findByProjectId(projectId);
      const balances: TokenBalance[] = [];
      
      for (const wallet of wallets) {
        const publicKey = new PublicKey(wallet.address);
        const solBalanceLamports = await connection.getBalance(publicKey);
        const tokenBalance = await this.getTokenBalance(wallet.address, tokenAddress);
        const tokenValueSol = await this.calculateTokenValue(tokenBalance, tokenAddress);
        
        balances.push({
          walletId: wallet.id,
          address: wallet.address,
          solBalance: solBalanceLamports / 1e9,
          tokenBalance,
          tokenValueSol,
        });
      }
      
      return balances;
    } catch (error) {
      logger.error('Failed to get project balances', { projectId, error });
      throw error;
    }
  }

  async getStats(projectId: number, tokenAddress: string): Promise<SwapStats> {
    try {
      const transactions = await TransactionModel.findByProjectId(projectId);
      const tokenTxs = transactions.filter(tx => tx.token_address === tokenAddress);
      
      const buyTxs = tokenTxs.filter(tx => tx.type === 'buy');
      const sellTxs = tokenTxs.filter(tx => tx.type === 'sell');
      
      const totalBoughtSol = buyTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const totalSoldSol = sellTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      
      const balances = await this.getProjectBalances(projectId, tokenAddress);
      const worthSol = balances.reduce((sum: number, b: TokenBalance) => sum + b.tokenValueSol, 0);
      
      const holdingPercentage = await this.calculateHoldingPercentage(projectId, tokenAddress);
      
      const profit = worthSol + totalSoldSol - totalBoughtSol;
      const profitPercentage = totalBoughtSol > 0 ? (profit / totalBoughtSol) * 100 : 0;
      
      const solPriceUsd = await this.getSolPriceUSD();
      
      return {
        projectId,
        tokenAddress,
        totalBuys: buyTxs.length,
        totalSells: sellTxs.length,
        totalBoughtSol,
        totalSoldSol,
        totalVolumeUsd: (totalBoughtSol + totalSoldSol) * solPriceUsd,
        holdingPercentage,
        worthSol,
        worthUsd: worthSol * solPriceUsd,
        profit,
        profitUsd: profit * solPriceUsd,
        profitPercentage,
      };
    } catch (error) {
      logger.error('Failed to get swap stats', { projectId, error });
      throw error;
    }
  }

  private async calculateTokenValue(tokenAmount: number, tokenAddress: string): Promise<number> {
    try {
      const response = await fetch(`https://price.jup.ag/v4/price?ids=${tokenAddress}`);
      if (!response.ok) return 0;
      
      const data = await response.json() as JupiterPriceData;
      if (!data.data || !data.data[tokenAddress]) return 0;
      
      const priceUsd = data.data[tokenAddress].price;
      const solPriceUsd = await this.getSolPriceUSD();
      const priceInSol = priceUsd / solPriceUsd;
      
      return tokenAmount * priceInSol;
    } catch (error) {
      logger.error('Failed to calculate token value', { tokenAddress, error });
      return 0;
    }
  }

  private async calculateHoldingPercentage(projectId: number, tokenAddress: string): Promise<number> {
    try {
      const tokenMint = new PublicKey(tokenAddress);
      const supply = await connection.getTokenSupply(tokenMint);
      const totalSupply = supply.value.uiAmount;
      
      if (!totalSupply || totalSupply === 0) return 0;
      
      const wallets = await WalletModel.findByProjectId(projectId);
      let totalProjectBalance = 0;
      
      for (const wallet of wallets) {
        try {
          const balance = await this.getTokenBalance(wallet.address, tokenAddress);
          totalProjectBalance += balance;
        } catch (error) {
          logger.error('Error getting wallet balance', { walletId: wallet.id, error });
        }
      }
      
      return (totalProjectBalance / totalSupply) * 100;
    } catch (error) {
      logger.error('Failed to calculate holding percentage', { projectId, tokenAddress, error });
      return 0;
    }
  }

  private async getSolPriceUSD(): Promise<number> {
    try {
      const response = await fetch(`https://price.jup.ag/v4/price?ids=${this.SOL_MINT}`);
      if (!response.ok) return 180;
      
      const data = await response.json() as JupiterPriceData;
      return data.data[this.SOL_MINT]?.price || 180;
    } catch (error) {
      logger.error('Failed to get SOL price', { error });
      return 180;
    }
  }
}

export default new SwapManager();