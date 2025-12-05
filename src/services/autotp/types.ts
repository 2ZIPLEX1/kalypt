/**
 * Auto Take Profit Types
 */

/**
 * TP Level (уровень take profit)
 */
export interface TPLevel {
  id?: number;
  marketCapTarget: number; // Целевой market cap в USD
  sellPercentage: number; // % от holdings для продажи (0-100)
  executed?: boolean; // Уже выполнен?
  executedAt?: Date; // Когда выполнен
  signatures?: string[]; // Transaction signatures
}

/**
 * Custom TP для конкретного кошелька
 */
export interface CustomWalletTP {
  walletId: number;
  levels: TPLevel[]; // Уровни TP для этого кошелька
  enabled: boolean; // Включен ли custom TP для этого кошелька
}

/**
 * Конфигурация Auto TP
 */
export interface AutoTPConfig {
  projectId: number;
  tokenAddress: string;
  
  // ВАРИАНТ 1: Простой режим (один уровень для всех)
  targetMcap?: number; // Целевая капитализация в USD
  sellPercentage?: number; // Процент от holdings для продажи (0-100)
  
  // ВАРИАНТ 2: Multiple levels (несколько уровней для всех кошельков)
  levels?: TPLevel[]; // Массив уровней TP
  
  // ВАРИАНТ 3: Custom per wallet (индивидуальные настройки)
  customWallets?: CustomWalletTP[]; // Custom TP для конкретных кошельков
  
  // Общие настройки
  checkInterval?: number; // Интервал проверки в мс (по умолчанию 30000)
  slippage?: number; // Slippage для продажи (по умолчанию 15)
  excludeCreator?: boolean; // Исключить creator wallet (по умолчанию true)
}

/**
 * Статус Auto TP
 */
export interface AutoTPStatus {
  active: boolean;
  projectId: number;
  tokenAddress: string;
  
  // Simple mode
  targetMcap?: number;
  sellPercentage?: number;
  
  // Multiple levels mode
  levels?: TPLevel[];
  
  // Custom wallets mode
  customWallets?: CustomWalletTP[];
  
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
  targetMcap?: number; // Для simple mode
  levelExecuted?: TPLevel; // Для multiple levels mode
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
  level?: TPLevel; // Какой уровень TP был выполнен (для multiple levels)
}

/**
 * Состояние мониторинга
 */
export interface MonitoringState {
  projectId: number;
  tokenAddress: string;
  isActive: boolean;
  
  // Simple mode
  targetMcap?: number;
  sellPercentage?: number;
  
  // Multiple levels mode
  levels?: TPLevel[];
  
  // Custom wallets mode
  customWallets?: CustomWalletTP[];
  
  currentMcap: number;
  lastCheck: Date;
  checkCount: number;
  startedAt: Date;
  excludeCreator: boolean;
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