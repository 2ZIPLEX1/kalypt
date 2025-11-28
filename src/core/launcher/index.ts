import { connection } from '../../utils/solana';
import { WalletModel } from '../../db/models/wallet';
import { ProjectModel } from '../../db/models/project';
import TokenDeployer from '../token';
import BundleCreator from '../bundler';
import SwapManager from '../swap';
import logger from '../../utils/logger';
import {
  LaunchConfig,
  LaunchResult,
  LaunchStatus,
  LaunchValidation,
  LaunchProgressCallback,
  BasicLaunchConfig,
  BundleLaunchConfig,
  SnipeLaunchConfig,
  BundleSnipeLaunchConfig,
} from './types';

/**
 * Launcher
 * 
 * Главный оркестратор запуска токенов на Pump.fun
 * 
 * Режимы:
 * 1. BASIC - Простой деплой + опциональный dev buy
 * 2. BUNDLE - Деплой + атомарная мульти-кошелёвая покупка
 * 3. SNIPE - Деплой + снайперские покупки
 * 4. BUNDLE_SNIPE - Деплой + bundle + snipe (комбо)
 */
export class Launcher {
  /**
   * Запустить токен по конфигурации
   */
  async launch(
    config: LaunchConfig,
    onProgress?: LaunchProgressCallback
  ): Promise<LaunchResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting token launch', {
        projectId: config.projectId,
        mode: config.mode,
      });

      // Валидация конфигурации
      await this.reportProgress('preparing', 'Validating configuration...', 0, onProgress);
      const validation = await this.validateLaunchConfig(config);
      
      if (!validation.valid) {
        throw new Error(`Launch validation failed: ${validation.errors.join(', ')}`);
      }

      // Получение проекта и dev кошелька
      const project = await ProjectModel.findById(config.projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const wallets = await WalletModel.findByProjectId(config.projectId);
      const devWallet = wallets.find(w => w.wallet_type === 'dev');
      
      if (!devWallet) {
        throw new Error('Dev wallet not found');
      }

      // Деплой токена
      await this.reportProgress('deploying', 'Deploying token...', 20, onProgress);
      
      const deployResult = await TokenDeployer.deployToken({
        projectId: config.projectId,
        name: project.name,
        symbol: project.ticker,
        description: project.description,
        imageUrl: project.image_url,
        website: project.website,
        twitter: project.twitter,
        telegram: project.telegram,
      });

      logger.info('Token deployed', {
        tokenAddress: deployResult.tokenAddress,
        signature: deployResult.signature,
      });

      // Инициализация результата
      const result: LaunchResult = {
        success: false,
        projectId: config.projectId,
        tokenAddress: deployResult.tokenAddress,
        mode: config.mode,
        status: 'deploying',
        details: {
          tokenDeployed: true,
          devBuyExecuted: false,
          bundleExecuted: false,
          snipesExecuted: false,
          totalSpent: 0,
          tokensPurchased: 0,
          walletsUsed: 0,
          duration: 0,
        },
      };

      // Выполнение в зависимости от режима
      switch (config.mode) {
        case 'basic':
          await this.executeBasicLaunch(config as BasicLaunchConfig, result, onProgress);
          break;
        
        case 'bundle':
          await this.executeBundleLaunch(config as BundleLaunchConfig, result, onProgress);
          break;
        
        case 'snipe':
          await this.executeSnipeLaunch(config as SnipeLaunchConfig, result, onProgress);
          break;
        
        case 'bundle_snipe':
          await this.executeBundleSnipeLaunch(config as BundleSnipeLaunchConfig, result, onProgress);
          break;
      }

      // Завершение
      result.status = 'completed';
      result.success = true;
      result.details.duration = Date.now() - startTime;

      await this.reportProgress('completed', 'Launch completed!', 100, onProgress);

      logger.info('Token launch completed', {
        projectId: config.projectId,
        mode: config.mode,
        duration: result.details.duration,
      });

      return result;

    } catch (error) {
      logger.error('Token launch failed', { config, error });

      await this.reportProgress('failed', 'Launch failed', 0, onProgress);

      return {
        success: false,
        projectId: config.projectId,
        mode: config.mode,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          tokenDeployed: false,
          devBuyExecuted: false,
          bundleExecuted: false,
          snipesExecuted: false,
          totalSpent: 0,
          tokensPurchased: 0,
          walletsUsed: 0,
          duration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * BASIC LAUNCH - простой деплой + опциональный dev buy
   */
  private async executeBasicLaunch(
    config: BasicLaunchConfig,
    result: LaunchResult,
    onProgress?: LaunchProgressCallback
  ): Promise<void> {
    if (!config.devBuyAmount || config.devBuyAmount === 0) {
      logger.info('Basic launch - no dev buy');
      return;
    }

    await this.reportProgress('deploying', 'Executing dev buy...', 60, onProgress);

    const devWallet = await this.getDevWallet(config.projectId);
    
    const swapResult = await SwapManager.executeSingleSwap({
      walletId: devWallet.id,
      tokenAddress: result.tokenAddress!,
      type: 'buy',
      amountSol: config.devBuyAmount,
      slippage: 15,
    });

    result.devBuySignature = swapResult.signature;
    result.details.devBuyExecuted = true;
    result.details.totalSpent = config.devBuyAmount;
    result.details.walletsUsed = 1;

    logger.info('Dev buy executed', {
      signature: swapResult.signature,
      amount: config.devBuyAmount,
    });
  }

  /**
   * BUNDLE LAUNCH - деплой + атомарная покупка через Jito
   */
  private async executeBundleLaunch(
    config: BundleLaunchConfig,
    result: LaunchResult,
    onProgress?: LaunchProgressCallback
  ): Promise<void> {
    // Dev buy
    await this.reportProgress('deploying', 'Executing dev buy...', 40, onProgress);
    
    const devWallet = await this.getDevWallet(config.projectId);
    
    const devBuyResult = await SwapManager.executeSingleSwap({
      walletId: devWallet.id,
      tokenAddress: result.tokenAddress!,
      type: 'buy',
      amountSol: config.devBuyAmount,
      slippage: 15,
    });

    result.devBuySignature = devBuyResult.signature;
    result.details.devBuyExecuted = true;
    result.details.totalSpent = config.devBuyAmount;

    // Bundle buy
    await this.reportProgress('bundling', 'Executing bundle buy...', 70, onProgress);
    result.status = 'bundling';

    const bundleWallets = await WalletModel.findByType(config.projectId, 'bundle');
    const walletIds = bundleWallets.slice(0, config.bundleWalletCount).map(w => w.id);

    if (walletIds.length === 0) {
      throw new Error('No bundle wallets available');
    }

    const amountPerWallet = config.bundleTotalAmount / walletIds.length;

    const bundleResult = await BundleCreator.executeBundleBuy({
      projectId: config.projectId,
      tokenAddress: result.tokenAddress!,
      walletIds,
      amountPerWallet,
      slippage: 15,
      jitoTip: config.jitoTip,
    });

    result.bundleId = bundleResult.bundleId;
    result.bundleSignatures = bundleResult.transactionSignatures;
    result.details.bundleExecuted = true;
    result.details.totalSpent += config.bundleTotalAmount;
    result.details.walletsUsed = 1 + walletIds.length;

    logger.info('Bundle buy executed', {
      bundleId: bundleResult.bundleId,
      wallets: walletIds.length,
      totalAmount: config.bundleTotalAmount,
    });
  }

  /**
   * SNIPE LAUNCH - деплой + снайперские покупки
   */
  private async executeSnipeLaunch(
    config: SnipeLaunchConfig,
    result: LaunchResult,
    onProgress?: LaunchProgressCallback
  ): Promise<void> {
    // Dev buy
    await this.reportProgress('deploying', 'Executing dev buy...', 40, onProgress);
    
    const devWallet = await this.getDevWallet(config.projectId);
    
    const devBuyResult = await SwapManager.executeSingleSwap({
      walletId: devWallet.id,
      tokenAddress: result.tokenAddress!,
      type: 'buy',
      amountSol: config.devBuyAmount,
      slippage: 15,
    });

    result.devBuySignature = devBuyResult.signature;
    result.details.devBuyExecuted = true;
    result.details.totalSpent = config.devBuyAmount;

    // Snipe buys
    await this.reportProgress('sniping', 'Executing snipe buys...', 70, onProgress);
    result.status = 'sniping';

    const sniperWallets = await WalletModel.findByType(config.projectId, 'sniper');
    const walletIds = sniperWallets.slice(0, config.sniperWalletCount).map(w => w.id);

    if (walletIds.length === 0) {
      throw new Error('No sniper wallets available');
    }

    // Рандомные суммы в диапазоне
    const snipeSignatures: string[] = [];
    let totalSnipeSpent = 0;

    for (const walletId of walletIds) {
      if (totalSnipeSpent >= config.maxSnipeSpend) break;

      const amount = this.randomAmount(
        config.snipeBuyRange[0],
        config.snipeBuyRange[1]
      );

      const remaining = config.maxSnipeSpend - totalSnipeSpent;
      const finalAmount = Math.min(amount, remaining);

      try {
        const snipeResult = await SwapManager.executeSingleSwap({
          walletId,
          tokenAddress: result.tokenAddress!,
          type: 'buy',
          amountSol: finalAmount,
          slippage: 20, // Higher slippage for snipes
        });

        snipeSignatures.push(snipeResult.signature);
        totalSnipeSpent += finalAmount;

        // Random delay between snipes
        await this.sleep(this.randomDelay(500, 2000));
      } catch (error) {
        logger.error('Snipe buy failed', { walletId, error });
      }
    }

    result.snipeSignatures = snipeSignatures;
    result.details.snipesExecuted = true;
    result.details.totalSpent += totalSnipeSpent;
    result.details.walletsUsed = 1 + snipeSignatures.length;

    logger.info('Snipe buys executed', {
      snipes: snipeSignatures.length,
      totalSpent: totalSnipeSpent,
    });
  }

  /**
   * BUNDLE + SNIPE LAUNCH - комбо режим
   */
  private async executeBundleSnipeLaunch(
    config: BundleSnipeLaunchConfig,
    result: LaunchResult,
    onProgress?: LaunchProgressCallback
  ): Promise<void> {
    // Dev buy
    await this.reportProgress('deploying', 'Executing dev buy...', 30, onProgress);
    
    const devWallet = await this.getDevWallet(config.projectId);
    
    const devBuyResult = await SwapManager.executeSingleSwap({
      walletId: devWallet.id,
      tokenAddress: result.tokenAddress!,
      type: 'buy',
      amountSol: config.devBuyAmount,
      slippage: 15,
    });

    result.devBuySignature = devBuyResult.signature;
    result.details.devBuyExecuted = true;
    result.details.totalSpent = config.devBuyAmount;

    // Bundle buy
    await this.reportProgress('bundling', 'Executing bundle buy...', 55, onProgress);
    result.status = 'bundling';

    const bundleWallets = await WalletModel.findByType(config.projectId, 'bundle');
    const bundleWalletIds = bundleWallets.slice(0, config.bundleWalletCount).map(w => w.id);

    const amountPerWallet = config.bundleTotalAmount / bundleWalletIds.length;

    const bundleResult = await BundleCreator.executeBundleBuy({
      projectId: config.projectId,
      tokenAddress: result.tokenAddress!,
      walletIds: bundleWalletIds,
      amountPerWallet,
      slippage: 15,
      jitoTip: config.jitoTip,
    });

    result.bundleId = bundleResult.bundleId;
    result.bundleSignatures = bundleResult.transactionSignatures;
    result.details.bundleExecuted = true;
    result.details.totalSpent += config.bundleTotalAmount;

    // Snipe buys
    await this.reportProgress('sniping', 'Executing snipe buys...', 80, onProgress);
    result.status = 'sniping';

    const sniperWallets = await WalletModel.findByType(config.projectId, 'sniper');
    const sniperWalletIds = sniperWallets.slice(0, config.sniperWalletCount).map(w => w.id);

    const snipeSignatures: string[] = [];
    let totalSnipeSpent = 0;

    for (const walletId of sniperWalletIds) {
      if (totalSnipeSpent >= config.maxSnipeSpend) break;

      const amount = this.randomAmount(
        config.snipeBuyRange[0],
        config.snipeBuyRange[1]
      );

      const remaining = config.maxSnipeSpend - totalSnipeSpent;
      const finalAmount = Math.min(amount, remaining);

      try {
        const snipeResult = await SwapManager.executeSingleSwap({
          walletId,
          tokenAddress: result.tokenAddress!,
          type: 'buy',
          amountSol: finalAmount,
          slippage: 20,
        });

        snipeSignatures.push(snipeResult.signature);
        totalSnipeSpent += finalAmount;

        await this.sleep(this.randomDelay(500, 2000));
      } catch (error) {
        logger.error('Snipe buy failed', { walletId, error });
      }
    }

    result.snipeSignatures = snipeSignatures;
    result.details.snipesExecuted = true;
    result.details.totalSpent += totalSnipeSpent;
    result.details.walletsUsed = 1 + bundleWalletIds.length + snipeSignatures.length;

    logger.info('Bundle + Snipe launch completed', {
      bundleWallets: bundleWalletIds.length,
      snipes: snipeSignatures.length,
      totalSpent: result.details.totalSpent,
    });
  }

  /**
   * Валидация конфигурации запуска
   */
  async validateLaunchConfig(config: LaunchConfig): Promise<LaunchValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Проверка проекта
      const project = await ProjectModel.findById(config.projectId);
      if (!project) {
        errors.push('Project not found');
        return { valid: false, errors, warnings, requirements: this.getEmptyRequirements() };
      }

      // Проверка dev кошелька
      const wallets = await WalletModel.findByProjectId(config.projectId);
      const devWallet = wallets.find(w => w.wallet_type === 'dev');
      
      if (!devWallet) {
        errors.push('Dev wallet not found');
      }

      // Получение баланса dev кошелька
      const devBalance = devWallet ? await connection.getBalance(
        new (await import('@solana/web3.js')).PublicKey(devWallet.address)
      ) / 1e9 : 0;

      // Расчёт требований в зависимости от режима
      let minCreatorBalance = 0.05; // Минимум для деплоя
      let minBundleWallets = 0;
      let minSniperWallets = 0;
      let estimatedCost = 0.05;

      switch (config.mode) {
        case 'basic':
          const basicConfig = config as BasicLaunchConfig;
          if (basicConfig.devBuyAmount) {
            minCreatorBalance += basicConfig.devBuyAmount;
            estimatedCost += basicConfig.devBuyAmount;
          }
          break;

        case 'bundle':
          const bundleConfig = config as BundleLaunchConfig;
          minCreatorBalance += bundleConfig.devBuyAmount;
          estimatedCost += bundleConfig.devBuyAmount + bundleConfig.bundleTotalAmount;
          minBundleWallets = bundleConfig.bundleWalletCount;

          const bundleWallets = wallets.filter(w => w.wallet_type === 'bundle');
          if (bundleWallets.length < minBundleWallets) {
            errors.push(`Need ${minBundleWallets} bundle wallets, found ${bundleWallets.length}`);
          }
          break;

        case 'snipe':
          const snipeConfig = config as SnipeLaunchConfig;
          minCreatorBalance += snipeConfig.devBuyAmount;
          estimatedCost += snipeConfig.devBuyAmount + snipeConfig.maxSnipeSpend;
          minSniperWallets = snipeConfig.sniperWalletCount;

          const sniperWallets = wallets.filter(w => w.wallet_type === 'sniper');
          if (sniperWallets.length < minSniperWallets) {
            errors.push(`Need ${minSniperWallets} sniper wallets, found ${sniperWallets.length}`);
          }
          break;

        case 'bundle_snipe':
          const comboConfig = config as BundleSnipeLaunchConfig;
          minCreatorBalance += comboConfig.devBuyAmount;
          estimatedCost += comboConfig.devBuyAmount + comboConfig.bundleTotalAmount + comboConfig.maxSnipeSpend;
          minBundleWallets = comboConfig.bundleWalletCount;
          minSniperWallets = comboConfig.sniperWalletCount;

          const comboBundleWallets = wallets.filter(w => w.wallet_type === 'bundle');
          const comboSniperWallets = wallets.filter(w => w.wallet_type === 'sniper');
          
          if (comboBundleWallets.length < minBundleWallets) {
            errors.push(`Need ${minBundleWallets} bundle wallets, found ${comboBundleWallets.length}`);
          }
          if (comboSniperWallets.length < minSniperWallets) {
            errors.push(`Need ${minSniperWallets} sniper wallets, found ${comboSniperWallets.length}`);
          }
          break;
      }

      // Проверка баланса dev кошелька
      if (devBalance < minCreatorBalance) {
        errors.push(`Insufficient dev wallet balance. Need ${minCreatorBalance} SOL, have ${devBalance.toFixed(4)} SOL`);
      }

      // Предупреждения
      if (devBalance < minCreatorBalance + 0.1) {
        warnings.push('Dev wallet balance is close to minimum required');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        requirements: {
          minCreatorBalance,
          minBundleWallets,
          minSniperWallets,
          estimatedCost,
        },
      };

    } catch (error) {
      logger.error('Launch validation failed', { config, error });
      errors.push('Validation error: ' + (error instanceof Error ? error.message : 'Unknown'));
      
      return {
        valid: false,
        errors,
        warnings,
        requirements: this.getEmptyRequirements(),
      };
    }
  }

  /**
   * Получить dev кошелёк
   */
  private async getDevWallet(projectId: number): Promise<any> {
    const wallets = await WalletModel.findByProjectId(projectId);
    const devWallet = wallets.find(w => w.wallet_type === 'dev');
    
    if (!devWallet) {
      throw new Error('Dev wallet not found');
    }
    
    return devWallet;
  }

  /**
   * Репорт прогресса
   */
  private async reportProgress(
    status: LaunchStatus,
    message: string,
    progress: number,
    callback?: LaunchProgressCallback
  ): Promise<void> {
    logger.info(`Launch progress: ${status} - ${message} (${progress}%)`);
    
    if (callback) {
      await callback(status, message, progress);
    }
  }

  /**
   * Рандомная сумма в диапазоне
   */
  private randomAmount(min: number, max: number): number {
    return Number((Math.random() * (max - min) + min).toFixed(6));
  }

  /**
   * Рандомная задержка
   */
  private randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Пустые требования (fallback)
   */
  private getEmptyRequirements() {
    return {
      minCreatorBalance: 0,
      minBundleWallets: 0,
      minSniperWallets: 0,
      estimatedCost: 0,
    };
  }
}

export default new Launcher();