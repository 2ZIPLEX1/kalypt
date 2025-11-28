/**
 * Smart Sell Configuration
 */
export interface SmartSellConfig {
  projectId: number;
  tokenAddress: string;
  enabled: boolean;
  
  // Триггер для активации
  minBuySol: number; // Минимальный размер покупки для активации (в SOL)
  
  // Параметры продажи
  sellPercentage: number; // Сколько % продавать при триггере (0-100)
  
  // Условия остановки
  stopHoldingPercentage: number; // Прекратить продажи если холдинг < X%
  
  // Whitelist
  whitelistAddresses: string[]; // Адреса, которые не триггерят продажу
  
  // Дополнительные настройки
  slippage?: number; // Slippage для продажи (по умолчанию 15%)
  cooldownSeconds?: number; // Задержка между продажами (по умолчанию 60 сек)
}

/**
 * Smart Sell Status
 */
export interface SmartSellStatus {
  active: boolean;
  projectId: number;
  tokenAddress: string;
  config: SmartSellConfig;
  
  // Статистика
  totalTriggers: number;
  totalSold: number;
  totalSolReceived: number;
  lastTrigger?: Date;
  lastCooldownEnd?: Date;
}

/**
 * Detected Buy Event
 */
export interface DetectedBuy {
  signature: string;
  buyer: string;
  amountSol: number;
  amountTokens: number;
  timestamp: Date;
  isWhitelisted: boolean;
}

/**
 * Smart Sell Trigger Result
 */
export interface SmartSellTrigger {
  triggered: boolean;
  reason?: string; // Почему сработал или не сработал
  detectedBuy: DetectedBuy;
  sellExecuted: boolean;
  sellResult?: SmartSellExecution;
}

/**
 * Smart Sell Execution Result
 */
export interface SmartSellExecution {
  success: boolean;
  projectId: number;
  tokenAddress: string;
  triggerBuy: DetectedBuy;
  
  // Результаты продажи
  walletsSold: number;
  totalTokensSold: number;
  totalSolReceived: number;
  signatures: string[];
  
  // Холдинг после продажи
  remainingHoldingPercentage: number;
  
  timestamp: Date;
  error?: string;
}

/**
 * Monitoring State
 */
export interface MonitoringState {
  projectId: number;
  tokenAddress: string;
  isActive: boolean;
  config: SmartSellConfig;
  
  // WebSocket connection
  subscriptionId?: number;
  
  // Статистика
  stats: {
    totalTriggers: number;
    totalSold: number;
    totalSolReceived: number;
    lastTrigger?: Date;
    lastCooldownEnd?: Date;
  };
}

/**
 * Transaction Parsed Data
 */
export interface ParsedTransaction {
  signature: string;
  buyer: string;
  seller?: string;
  tokenAddress: string;
  amountTokens: number;
  amountSol: number;
  type: 'buy' | 'sell' | 'unknown';
  timestamp: Date;
}