import { 
  Connection, 
  PublicKey, 
  ParsedTransactionWithMeta,
  Logs,
  Context,
} from '@solana/web3.js';
import { WalletModel } from '../../db/models/wallet';
import { ProjectModel } from '../../db/models/project';
import SwapManager from '../../core/swap';
import logger from '../../utils/logger';
import {
  SmartSellConfig,
  SmartSellStatus,
  DetectedBuy,
  SmartSellTrigger,
  SmartSellExecution,
  MonitoringState,
  ParsedTransaction,
} from './types';

/**
 * Token Balance interface para parsing
 */
interface ParsedTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

/**
 * Smart Sell Service - PRODUCTION VERSION
 * 
 * Автоматически продаёт токены при обнаружении крупных покупок
 * 
 * Реализовано:
 * ✅ Реальный WebSocket мониторинг транзакций через onLogs
 * ✅ Полный парсинг swap транзакций (Raydium/Jupiter/Pump.Fun)
 * ✅ Расчёт реального % холдинга от total supply
 * ✅ Детекция крупных покупок в реальном времени
 * ✅ Whitelist, cooldown, stop conditions
 */
export class SmartSellService {
  private connection: Connection;
  private monitoringStates: Map<number, MonitoringState> = new Map();
  
  // Program IDs для мониторинга
  private readonly RAYDIUM_PROGRAM = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
  private readonly JUPITER_PROGRAM = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
  private readonly PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Запустить Smart Sell для проекта
   */
  async start(config: SmartSellConfig): Promise<SmartSellStatus> {
    try {
      this.validateConfig(config);

      if (this.monitoringStates.has(config.projectId)) {
        throw new Error('Smart Sell уже запущен для этого проекта');
      }

      const project = await ProjectModel.findById(config.projectId);
      if (!project) {
        throw new Error('Проект не найден');
      }

      if (!project.token_address) {
        throw new Error('У проекта нет токена. Сначала запустите токен.');
      }

      const state: MonitoringState = {
        projectId: config.projectId,
        tokenAddress: config.tokenAddress,
        isActive: true,
        config,
        stats: {
          totalTriggers: 0,
          totalSold: 0,
          totalSolReceived: 0,
        },
      };

      this.monitoringStates.set(config.projectId, state);

      await this.startMonitoring(state);

      logger.info('Smart Sell запущен', {
        projectId: config.projectId,
        tokenAddress: config.tokenAddress,
        minBuySol: config.minBuySol,
        sellPercentage: config.sellPercentage,
      });

      return {
        active: true,
        projectId: config.projectId,
        tokenAddress: config.tokenAddress,
        config,
        totalTriggers: 0,
        totalSold: 0,
        totalSolReceived: 0,
      };
    } catch (error) {
      logger.error('Ошибка запуска Smart Sell', { config, error });
      throw error;
    }
  }

  /**
   * Остановить Smart Sell
   */
  async stop(projectId: number): Promise<void> {
    const state = this.monitoringStates.get(projectId);

    if (!state) {
      throw new Error('Smart Sell не запущен для этого проекта');
    }

    if (state.subscriptionId !== undefined) {
      await this.connection.removeOnLogsListener(state.subscriptionId);
    }

    state.isActive = false;
    this.monitoringStates.delete(projectId);

    logger.info('Smart Sell остановлен', { projectId });
  }

  /**
   * Получить статус Smart Sell
   */
  async getStatus(projectId: number): Promise<SmartSellStatus | null> {
    const state = this.monitoringStates.get(projectId);

    if (!state) {
      return null;
    }

    return {
      active: state.isActive,
      projectId: state.projectId,
      tokenAddress: state.tokenAddress,
      config: state.config,
      totalTriggers: state.stats.totalTriggers,
      totalSold: state.stats.totalSold,
      totalSolReceived: state.stats.totalSolReceived,
      lastTrigger: state.stats.lastTrigger,
      lastCooldownEnd: state.stats.lastCooldownEnd,
    };
  }

  /**
   * Валидация конфига
   */
  private validateConfig(config: SmartSellConfig): void {
    if (!config.projectId) {
      throw new Error('projectId обязателен');
    }

    if (!config.tokenAddress) {
      throw new Error('tokenAddress обязателен');
    }

    if (!config.minBuySol || config.minBuySol <= 0) {
      throw new Error('minBuySol должен быть > 0');
    }

    if (!config.sellPercentage || config.sellPercentage <= 0 || config.sellPercentage > 100) {
      throw new Error('sellPercentage должен быть между 0 и 100');
    }

    if (config.stopHoldingPercentage < 0 || config.stopHoldingPercentage > 100) {
      throw new Error('stopHoldingPercentage должен быть между 0 и 100');
    }
  }

  /**
   * Запустить мониторинг транзакций - РЕАЛЬНАЯ ВЕРСИЯ
   */
  private async startMonitoring(state: MonitoringState): Promise<void> {
    try {
      const tokenMint = new PublicKey(state.tokenAddress);

      logger.info('Запуск WebSocket мониторинга транзакций', {
        tokenAddress: state.tokenAddress,
      });

      // Подписываемся на логи DEX программ (Raydium, Jupiter, Pump.Fun)
      const subscriptionId = this.connection.onLogs(
        'all',
        async (logs: Logs, _ctx: Context) => {
          try {
            // Проверяем что это транзакция с одной из DEX программ
            if (!this.isRelevantProgram(logs)) {
              return;
            }

            // Получаем полную транзакцию
            const tx = await this.connection.getParsedTransaction(
              logs.signature,
              {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
              }
            );

            if (!tx) {
              return;
            }

            // Проверяем что это транзакция с нашим токеном
            if (!this.involvesToken(tx, tokenMint)) {
              return;
            }

            // Обрабатываем транзакцию
            await this.handleTransaction(state, tx);

          } catch (error) {
            logger.error('Ошибка обработки лога', {
              signature: logs.signature,
              error,
            });
          }
        },
        'confirmed'
      );

      state.subscriptionId = subscriptionId;

      logger.info('WebSocket мониторинг активен', {
        projectId: state.projectId,
        subscriptionId,
      });

    } catch (error) {
      logger.error('Ошибка запуска мониторинга', {
        projectId: state.projectId,
        error,
      });
      throw error;
    }
  }

  /**
   * Проверить что это транзакция с DEX программой
   */
  private isRelevantProgram(logs: Logs): boolean {
    const programIds = [
      this.RAYDIUM_PROGRAM.toString(),
      this.JUPITER_PROGRAM.toString(),
      this.PUMP_PROGRAM.toString(),
    ];

    // Проверяем что хотя бы одна из программ участвует
    return logs.logs.some(log => 
      programIds.some(pid => log.includes(pid))
    );
  }

  /**
   * Проверить что транзакция включает наш токен
   */
  private involvesToken(tx: ParsedTransactionWithMeta, tokenMint: PublicKey): boolean {
    if (!tx.meta || !tx.transaction) {
      return false;
    }

    const accountKeys = tx.transaction.message.accountKeys;
    return accountKeys.some(key => key.pubkey.equals(tokenMint));
  }

  /**
   * Обработать обнаруженную транзакцию - РЕАЛЬНАЯ ВЕРСИЯ
   */
  private async handleTransaction(
    state: MonitoringState,
    tx: ParsedTransactionWithMeta
  ): Promise<void> {
    try {
      // Парсим транзакцию
      const parsed = this.parseTransaction(tx, state.tokenAddress);

      if (!parsed || parsed.type !== 'buy') {
        return;
      }

      logger.info('Обнаружена покупка', {
        signature: parsed.signature,
        buyer: parsed.buyer,
        amountSol: parsed.amountSol,
        amountTokens: parsed.amountTokens,
      });

      const detectedBuy: DetectedBuy = {
        signature: parsed.signature,
        buyer: parsed.buyer,
        amountSol: parsed.amountSol,
        amountTokens: parsed.amountTokens,
        timestamp: parsed.timestamp,
        isWhitelisted: this.isWhitelisted(parsed.buyer, state.config.whitelistAddresses),
      };

      const trigger = await this.checkTrigger(state, detectedBuy);

      if (trigger.triggered && trigger.sellExecuted) {
        state.stats.totalTriggers++;
        state.stats.lastTrigger = new Date();
        
        if (trigger.sellResult) {
          state.stats.totalSold += trigger.sellResult.totalTokensSold;
          state.stats.totalSolReceived += trigger.sellResult.totalSolReceived;
        }
      }

    } catch (error) {
      logger.error('Ошибка обработки транзакции', {
        projectId: state.projectId,
        error,
      });
    }
  }

  /**
   * Парсинг транзакции - РЕАЛЬНАЯ ВЕРСИЯ
   */
  private parseTransaction(
    tx: ParsedTransactionWithMeta,
    tokenAddress: string
  ): ParsedTransaction | null {
    try {
      if (!tx.meta || !tx.transaction || !tx.blockTime) {
        return null;
      }

      const tokenMint = new PublicKey(tokenAddress);
      const accountKeys = tx.transaction.message.accountKeys;

      // Находим изменения балансов SOL
      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;

      // Находим изменения балансов токена - ИСПРАВЛЕНО: используем правильный тип
      const preTokenBalances = (tx.meta.preTokenBalances || []) as ParsedTokenBalance[];
      const postTokenBalances = (tx.meta.postTokenBalances || []) as ParsedTokenBalance[];

      // Определяем покупателя - кто потратил SOL и получил токены
      let buyer: string | null = null;
      let amountSol = 0;
      let amountTokens = 0;

      // Проверяем каждый аккаунт
      for (let i = 0; i < accountKeys.length; i++) {
        const preBalance = preBalances[i];
        const postBalance = postBalances[i];
        const solDiff = (postBalance - preBalance) / 1e9; // Lamports to SOL

        // Если потратил SOL (отрицательная разница)
        if (solDiff < -0.001) { // Минимум 0.001 SOL
          const account = accountKeys[i].pubkey;

          // Ищем увеличение токенов у этого аккаунта
          const tokenIncrease = this.getTokenBalanceChange(
            account,
            tokenMint,
            preTokenBalances,
            postTokenBalances
          );

          if (tokenIncrease > 0) {
            buyer = account.toString();
            amountSol = Math.abs(solDiff);
            amountTokens = tokenIncrease;
            break;
          }
        }
      }

      if (!buyer) {
        return null; // Не нашли покупателя
      }

      return {
        signature: tx.transaction.signatures[0],
        buyer,
        tokenAddress,
        amountTokens,
        amountSol,
        type: 'buy',
        timestamp: new Date(tx.blockTime * 1000),
      };

    } catch (error) {
      logger.error('Ошибка парсинга транзакции', { error });
      return null;
    }
  }

  /**
   * Получить изменение баланса токена для аккаунта - ИСПРАВЛЕНО
   */
  private getTokenBalanceChange(
    account: PublicKey,
    tokenMint: PublicKey,
    preBalances: ParsedTokenBalance[],
    postBalances: ParsedTokenBalance[]
  ): number {
    // Находим pre balance
    const preBal = preBalances.find(b => 
      b.mint === tokenMint.toString() && 
      b.owner === account.toString()
    );

    // Находим post balance
    const postBal = postBalances.find(b =>
      b.mint === tokenMint.toString() &&
      b.owner === account.toString()
    );

    const preAmount = preBal?.uiTokenAmount?.uiAmount || 0;
    const postAmount = postBal?.uiTokenAmount?.uiAmount || 0;

    return postAmount - preAmount;
  }

  /**
   * Проверить триггер продажи
   */
  private async checkTrigger(
    state: MonitoringState,
    detectedBuy: DetectedBuy
  ): Promise<SmartSellTrigger> {
    try {
      const config = state.config;

      // Проверка 1: Whitelist
      if (detectedBuy.isWhitelisted) {
        return {
          triggered: false,
          reason: 'Покупатель в whitelist',
          detectedBuy,
          sellExecuted: false,
        };
      }

      // Проверка 2: Минимальный размер покупки
      if (detectedBuy.amountSol < config.minBuySol) {
        return {
          triggered: false,
          reason: `Покупка слишком маленькая (${detectedBuy.amountSol.toFixed(4)} < ${config.minBuySol} SOL)`,
          detectedBuy,
          sellExecuted: false,
        };
      }

      // Проверка 3: Cooldown
      if (state.stats.lastCooldownEnd) {
        const now = new Date();
        const cooldownSeconds = config.cooldownSeconds || 60;
        const cooldownEnd = new Date(state.stats.lastCooldownEnd.getTime() + cooldownSeconds * 1000);
        
        if (now < cooldownEnd) {
          const remainingSeconds = Math.ceil((cooldownEnd.getTime() - now.getTime()) / 1000);
          return {
            triggered: false,
            reason: `Cooldown активен (осталось ${remainingSeconds} сек)`,
            detectedBuy,
            sellExecuted: false,
          };
        }
      }

      // Проверка 4: Текущий холдинг
      const currentHoldingPercent = await this.getCurrentHoldingPercentage(
        state.projectId,
        state.tokenAddress
      );

      if (currentHoldingPercent <= config.stopHoldingPercentage) {
        return {
          triggered: false,
          reason: `Холдинг уже низкий (${currentHoldingPercent.toFixed(2)}% <= ${config.stopHoldingPercentage}%)`,
          detectedBuy,
          sellExecuted: false,
        };
      }

      // ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ - ВЫПОЛНЯЕМ ПРОДАЖУ
      logger.info('🚨 Smart Sell триггер сработал!', {
        projectId: state.projectId,
        buySize: detectedBuy.amountSol,
        buyer: detectedBuy.buyer,
      });

      const sellResult = await this.executeSell(state, detectedBuy);

      state.stats.lastCooldownEnd = new Date();

      return {
        triggered: true,
        reason: `Крупная покупка: ${detectedBuy.amountSol.toFixed(4)} SOL`,
        detectedBuy,
        sellExecuted: sellResult.success,
        sellResult,
      };

    } catch (error) {
      logger.error('Ошибка проверки триггера', {
        projectId: state.projectId,
        error,
      });

      return {
        triggered: false,
        reason: 'Ошибка: ' + (error instanceof Error ? error.message : 'Unknown'),
        detectedBuy,
        sellExecuted: false,
      };
    }
  }

  /**
   * Выполнить продажу
   */
  private async executeSell(
    state: MonitoringState,
    triggerBuy: DetectedBuy
  ): Promise<SmartSellExecution> {
    try {
      const config = state.config;

      const wallets = await WalletModel.findByProjectId(state.projectId);

      if (wallets.length === 0) {
        throw new Error('Нет кошельков для продажи');
      }

      const walletIds = wallets.map(w => w.id);

      logger.info('💰 Выполняем Smart Sell продажу', {
        projectId: state.projectId,
        walletCount: wallets.length,
        sellPercentage: config.sellPercentage,
      });

      const swapResult = await SwapManager.executeBatchSwap({
        projectId: state.projectId,
        walletIds,
        tokenAddress: state.tokenAddress,
        type: 'sell',
        percentage: config.sellPercentage,
        slippage: config.slippage || 15,
      });

      const totalTokensSold = swapResult.successful.reduce(
        (sum, s) => sum + s.amountIn,
        0
      );
      const totalSolReceived = swapResult.successful.reduce(
        (sum, s) => sum + s.amountOut,
        0
      );
      const signatures = swapResult.successful.map(s => s.signature);

      const remainingHoldingPercentage = await this.getCurrentHoldingPercentage(
        state.projectId,
        state.tokenAddress
      );

      logger.info('✅ Smart Sell продажа выполнена', {
        projectId: state.projectId,
        walletsSold: swapResult.totalSuccess,
        totalTokensSold,
        totalSolReceived,
        remainingHoldingPercentage: remainingHoldingPercentage.toFixed(2) + '%',
      });

      return {
        success: true,
        projectId: state.projectId,
        tokenAddress: state.tokenAddress,
        triggerBuy,
        walletsSold: swapResult.totalSuccess,
        totalTokensSold,
        totalSolReceived,
        signatures,
        remainingHoldingPercentage,
        timestamp: new Date(),
      };

    } catch (error) {
      logger.error('Ошибка выполнения Smart Sell продажи', {
        projectId: state.projectId,
        error,
      });

      return {
        success: false,
        projectId: state.projectId,
        tokenAddress: state.tokenAddress,
        triggerBuy,
        walletsSold: 0,
        totalTokensSold: 0,
        totalSolReceived: 0,
        signatures: [],
        remainingHoldingPercentage: 0,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Проверить whitelist
   */
  private isWhitelisted(address: string, whitelist: string[]): boolean {
    return whitelist.includes(address);
  }

  /**
   * Получить текущий процент холдинга - РЕАЛЬНАЯ ВЕРСИЯ
   */
  private async getCurrentHoldingPercentage(
    projectId: number,
    tokenAddress: string
  ): Promise<number> {
    try {
      const tokenMint = new PublicKey(tokenAddress);

      // 1. Получаем total supply
      const supply = await this.connection.getTokenSupply(tokenMint);
      const totalSupply = supply.value.uiAmount;

      if (!totalSupply || totalSupply === 0) {
        logger.warn('Total supply = 0', { tokenAddress });
        return 0;
      }

      // 2. Получаем балансы всех project wallets
      const wallets = await WalletModel.findByProjectId(projectId);
      let totalProjectBalance = 0;

      for (const wallet of wallets) {
        try {
          const walletPubkey = new PublicKey(wallet.address);
          
          // Получаем token accounts для этого кошелька
          const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
            walletPubkey,
            { mint: tokenMint }
          );

          // Суммируем балансы
          for (const account of tokenAccounts.value) {
            const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
            if (balance) {
              totalProjectBalance += balance;
            }
          }
        } catch (error) {
          logger.error('Ошибка получения баланса кошелька', {
            walletId: wallet.id,
            error,
          });
        }
      }

      // 3. Вычисляем процент
      const holdingPercentage = (totalProjectBalance / totalSupply) * 100;

      logger.debug('Холдинг рассчитан', {
        projectId,
        totalSupply,
        projectBalance: totalProjectBalance,
        holdingPercentage: holdingPercentage.toFixed(2) + '%',
      });

      return holdingPercentage;

    } catch (error) {
      logger.error('Ошибка получения холдинга', {
        projectId,
        tokenAddress,
        error,
      });
      return 0;
    }
  }

  /**
   * Получить все активные Smart Sell
   */
  getActiveMonitoring(): SmartSellStatus[] {
    const statuses: SmartSellStatus[] = [];

    for (const state of this.monitoringStates.values()) {
      if (state.isActive) {
        statuses.push({
          active: true,
          projectId: state.projectId,
          tokenAddress: state.tokenAddress,
          config: state.config,
          totalTriggers: state.stats.totalTriggers,
          totalSold: state.stats.totalSold,
          totalSolReceived: state.stats.totalSolReceived,
          lastTrigger: state.stats.lastTrigger,
          lastCooldownEnd: state.stats.lastCooldownEnd,
        });
      }
    }

    return statuses;
  }
}

// Экспортируем singleton instance
export default new SmartSellService(
  new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com')
);