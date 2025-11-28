import { Connection } from '@solana/web3.js';
import { WalletModel } from '../../db/models/wallet';
import SwapManager from '../../core/swap';
import logger from '../../utils/logger';
import {
  AutoTPConfig,
  AutoTPStatus,
  AutoTPResult,
  MonitoringState,
  SellExecution,
} from './types';

/**
 * Auto Take Profit Service
 * 
 * Автоматически продает токены при достижении целевой капитализации рынка
 * 
 * Функции:
 * - Мониторинг market cap токена
 * - Автоматическая продажа при достижении target_mcap
 * - Продажа заданного % от holdings
 * - Поддержка нескольких стратегий выхода
 */
export class AutoTPService {
  private connection: Connection;
  private monitoringStates: Map<number, MonitoringState> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Запустить Auto TP для проекта
   */
  async start(config: AutoTPConfig): Promise<AutoTPStatus> {
    try {
      // Валидация конфига
      this.validateConfig(config);

      // Проверяем, что не запущен уже
      if (this.monitoringStates.has(config.projectId)) {
        throw new Error('Auto TP уже запущен для этого проекта');
      }

      // Получаем адрес токена
      const tokenAddress = await this.getTokenAddress(config);

      // Создаем состояние мониторинга
      const state: MonitoringState = {
        projectId: config.projectId,
        tokenAddress,
        isActive: true,
        targetMcap: config.targetMcap,
        sellPercentage: config.sellPercentage,
        currentMcap: 0,
        lastCheck: new Date(),
        checkCount: 0,
      };

      this.monitoringStates.set(config.projectId, state);

      // Запускаем мониторинг
      this.startMonitoring(state, config);

      logger.info('Auto TP запущен', {
        projectId: config.projectId,
        tokenAddress,
        targetMcap: config.targetMcap,
      });

      return {
        active: true,
        projectId: config.projectId,
        tokenAddress,
        targetMcap: config.targetMcap,
        sellPercentage: config.sellPercentage,
        currentMcap: 0,
        startedAt: new Date(),
      };
    } catch (error) {
      logger.error('Ошибка запуска Auto TP', { config, error });
      throw error;
    }
  }

  /**
   * Остановить Auto TP
   */
  async stop(projectId: number): Promise<void> {
    const state = this.monitoringStates.get(projectId);

    if (!state) {
      throw new Error('Auto TP не запущен для этого проекта');
    }

    state.isActive = false;
    this.monitoringStates.delete(projectId);

    logger.info('Auto TP остановлен', { projectId });
  }

  /**
   * Получить статус Auto TP
   */
  async getStatus(projectId: number): Promise<AutoTPStatus | null> {
    const state = this.monitoringStates.get(projectId);

    if (!state) {
      return null;
    }

    return {
      active: state.isActive,
      projectId: state.projectId,
      tokenAddress: state.tokenAddress,
      targetMcap: state.targetMcap,
      sellPercentage: state.sellPercentage,
      currentMcap: state.currentMcap,
      startedAt: new Date(), // TODO: сохранять время старта
      lastCheck: state.lastCheck,
    };
  }

  /**
   * Валидация конфига
   */
  private validateConfig(config: AutoTPConfig): void {
    if (!config.projectId) {
      throw new Error('projectId обязателен');
    }

    if (!config.tokenAddress) {
      throw new Error('tokenAddress обязателен');
    }

    if (!config.targetMcap || config.targetMcap <= 0) {
      throw new Error('targetMcap должен быть > 0');
    }

    if (!config.sellPercentage || config.sellPercentage <= 0 || config.sellPercentage > 100) {
      throw new Error('sellPercentage должен быть между 0 и 100');
    }
  }

  /**
   * Получить адрес токена из конфига
   */
  private async getTokenAddress(config: AutoTPConfig): Promise<string> {
    // Токен адрес приходит в конфиге
    return config.tokenAddress;
  }

  /**
   * Запустить мониторинг market cap
   */
  private startMonitoring(state: MonitoringState, config: AutoTPConfig): void {
    const checkInterval = config.checkInterval || 30000; // 30 секунд по умолчанию

    const intervalId = setInterval(async () => {
      if (!state.isActive) {
        clearInterval(intervalId);
        return;
      }

      try {
        await this.checkAndExecute(state, config);
      } catch (error) {
        logger.error('Ошибка проверки Auto TP', {
          projectId: state.projectId,
          error,
        });
      }
    }, checkInterval);
  }

  /**
   * Проверить market cap и выполнить продажу если нужно
   */
  private async checkAndExecute(
    state: MonitoringState,
    config: AutoTPConfig
  ): Promise<void> {
    state.checkCount++;
    state.lastCheck = new Date();

    // Получаем текущий market cap
    const currentMcap = await this.getCurrentMarketCap(state.tokenAddress);
    state.currentMcap = currentMcap;

    logger.debug('Auto TP проверка', {
      projectId: state.projectId,
      currentMcap,
      targetMcap: state.targetMcap,
      checkCount: state.checkCount,
    });

    // Проверяем условие
    if (currentMcap >= state.targetMcap) {
      logger.info('Auto TP триггер сработал', {
        projectId: state.projectId,
        currentMcap,
        targetMcap: state.targetMcap,
      });

      // Выполняем продажу
      await this.executeSell(state, config);

      // Останавливаем мониторинг
      state.isActive = false;
    }
  }

  /**
   * Получить текущий market cap токена
   */
  private async getCurrentMarketCap(tokenAddress: string): Promise<number> {
    try {
      // TODO: Реализовать получение реального market cap
      // Варианты:
      // 1. Jupiter API - https://quote-api.jup.ag/v6/quote
      // 2. CoinGecko API - https://api.coingecko.com/api/v3/simple/token_price/solana
      // 3. Pump.Fun API - специфичный для платформы
      // 4. Raydium pool stats - через on-chain данные
      
      // Используем connection для проверки что токен существует и сеть доступна
      const slot = await this.connection.getSlot();
      
      // Можно также проверить что токен mint существует:
      // const mintInfo = await this.connection.getAccountInfo(new PublicKey(tokenAddress));
      // if (!mintInfo) throw new Error('Token not found');

      logger.warn('Используется моковый market cap', { 
        tokenAddress,
        currentSlot: slot,
      });

      // Пока возвращаем случайное значение для тестирования
      // В реальной версии здесь будет API запрос
      return Math.random() * 100000;
    } catch (error) {
      logger.error('Ошибка получения market cap', { tokenAddress, error });
      return 0;
    }
  }

  /**
   * Выполнить продажу
   */
  private async executeSell(
    state: MonitoringState,
    config: AutoTPConfig
  ): Promise<AutoTPResult> {
    try {
      // Получаем кошельки проекта
      const wallets = await WalletModel.findByProjectId(state.projectId);

      if (wallets.length === 0) {
        throw new Error('Нет кошельков для продажи');
      }

      const walletIds = wallets.map(w => w.id);

      // Выполняем продажу через SwapManager
      const swapResult = await SwapManager.executeBatchSwap({
        projectId: state.projectId,
        walletIds,
        tokenAddress: state.tokenAddress,
        type: 'sell',
        percentage: state.sellPercentage,
        slippage: config.slippage || 15,
      });

      // Подготавливаем результат
      const executions: SellExecution[] = swapResult.successful.map((s) => ({
        walletId: s.walletId,
        amountSold: s.amountIn,
        solReceived: s.amountOut,
        signature: s.signature,
        timestamp: new Date(),
      }));

      const totalSold = executions.reduce((sum, e) => sum + e.amountSold, 0);
      const totalSolReceived = executions.reduce((sum, e) => sum + e.solReceived, 0);

      logger.info('Auto TP продажа выполнена', {
        projectId: state.projectId,
        totalSold,
        totalSolReceived,
        successCount: swapResult.totalSuccess,
        failCount: swapResult.totalFailed,
      });

      return {
        success: true,
        projectId: state.projectId,
        tokenAddress: state.tokenAddress,
        mcapAtExecution: state.currentMcap,
        targetMcap: state.targetMcap,
        totalSold,
        totalSolReceived,
        executions,
      };
    } catch (error) {
      logger.error('Ошибка выполнения Auto TP продажи', {
        projectId: state.projectId,
        error,
      });

      return {
        success: false,
        projectId: state.projectId,
        tokenAddress: state.tokenAddress,
        mcapAtExecution: state.currentMcap,
        targetMcap: state.targetMcap,
        totalSold: 0,
        totalSolReceived: 0,
        executions: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Получить все активные Auto TP
   */
  getActiveMonitoring(): AutoTPStatus[] {
    const statuses: AutoTPStatus[] = [];

    for (const state of this.monitoringStates.values()) {
      if (state.isActive) {
        statuses.push({
          active: true,
          projectId: state.projectId,
          tokenAddress: state.tokenAddress,
          targetMcap: state.targetMcap,
          sellPercentage: state.sellPercentage,
          currentMcap: state.currentMcap,
          startedAt: new Date(), // TODO: сохранять время старта
          lastCheck: state.lastCheck,
        });
      }
    }

    return statuses;
  }
}

// Экспортируем singleton instance
export default new AutoTPService(
  new Connection('https://api.mainnet-beta.solana.com')
);