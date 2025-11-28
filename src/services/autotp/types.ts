/**
 * Auto Take Profit Types
 */

/**
 * Конфигурация Auto TP
 */
export interface AutoTPConfig {
  projectId: number;
  tokenAddress: string;
  targetMcap: number; // Целевая капитализация в USD
  sellPercentage: number; // Процент от holdings для продажи (0-100)
  checkInterval?: number; // Интервал проверки в мс (по умолчанию 30000)
  slippage?: number; // Slippage для продажи (по умолчанию 15)
}

/**
 * Статус Auto TP
 */
export interface AutoTPStatus {
  active: boolean;
  projectId: number;
  tokenAddress: string;
  targetMcap: number;
  sellPercentage: number;
  currentMcap: number;
  startedAt: Date;
  lastCheck?: Date;
}

/**
 * Результат выполнения Auto TP
 */
export interface AutoTPResult {
  success: boolean;
  projectId: number;
  tokenAddress: string;
  mcapAtExecution: number;
  targetMcap: number;
  totalSold: number;
  totalSolReceived: number;
  executions: SellExecution[];
  error?: string;
}

/**
 * Выполненная продажа
 */
export interface SellExecution {
  walletId: number;
  amountSold: number;
  solReceived: number;
  signature: string;
  timestamp: Date;
}

/**
 * Состояние мониторинга
 */
export interface MonitoringState {
  projectId: number;
  tokenAddress: string;
  isActive: boolean;
  targetMcap: number;
  sellPercentage: number;
  currentMcap: number;
  lastCheck: Date;
  checkCount: number;
}

/**
 * TP Level (уровень take profit)
 */
export interface TPLevel {
  id?: number;
  marketCapTarget: number;
  sellPercentage: number;
  executed?: boolean;
  executedAt?: Date;
  signatures?: string[];
}

/**
 * Пресет Auto TP (для базы данных)
 */
export interface AutoTPPresetDB {
  id: number;
  userId: number;
  name: string;
  targetMcap: number;
  sellPercentage: number;
  checkInterval: number;
  slippage: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Auto TP preset (для использования в коде)
 */
export interface AutoTPPreset {
  name: string;
  description: string;
  levels: Omit<TPLevel, 'id' | 'executed' | 'executedAt' | 'signatures'>[];
}

/**
 * Default presets
 */
export const AUTO_TP_PRESETS: AutoTPPreset[] = [
  {
    name: 'Conservative',
    description: 'Safe strategy with small profits',
    levels: [
      { marketCapTarget: 50000, sellPercentage: 20 },
      { marketCapTarget: 100000, sellPercentage: 30 },
      { marketCapTarget: 250000, sellPercentage: 30 },
      { marketCapTarget: 500000, sellPercentage: 20 },
    ],
  },
  {
    name: 'Balanced',
    description: 'Medium risk/reward balance',
    levels: [
      { marketCapTarget: 100000, sellPercentage: 25 },
      { marketCapTarget: 250000, sellPercentage: 25 },
      { marketCapTarget: 500000, sellPercentage: 25 },
      { marketCapTarget: 1000000, sellPercentage: 25 },
    ],
  },
  {
    name: 'Aggressive',
    description: 'High risk, high reward',
    levels: [
      { marketCapTarget: 250000, sellPercentage: 30 },
      { marketCapTarget: 500000, sellPercentage: 30 },
      { marketCapTarget: 1000000, sellPercentage: 40 },
    ],
  },
  {
    name: 'Moon or Bust',
    description: 'Hold for maximum gains',
    levels: [
      { marketCapTarget: 500000, sellPercentage: 20 },
      { marketCapTarget: 1000000, sellPercentage: 30 },
      { marketCapTarget: 5000000, sellPercentage: 50 },
    ],
  },
  {
    name: 'Quick Profit',
    description: 'Fast exit strategy',
    levels: [
      { marketCapTarget: 30000, sellPercentage: 50 },
      { marketCapTarget: 50000, sellPercentage: 30 },
      { marketCapTarget: 100000, sellPercentage: 20 },
    ],
  },
];