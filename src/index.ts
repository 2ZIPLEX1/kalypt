#!/usr/bin/env node

/**
 * KALYPT - Solana Pump.Fun Bundler
 * 
 * Main entry point for system initialization
 */

import config, { validateConfig } from './config';
import { initializeDatabase } from './db';
import logger from './utils/logger';

/**
 * Initialize application
 */
async function initialize() {
  try {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║                                        ║');
    console.log('║        🚀 KALYPT BUNDLER 🚀           ║');
    console.log('║                                        ║');
    console.log('║   Solana Pump.Fun Token Launcher      ║');
    console.log('║                                        ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    
    // Validate configuration
    logger.info('Validating configuration...');
    validateConfig();
    
    // Initialize database
    logger.info('Initializing database...');
    await initializeDatabase();
    logger.success('Database initialized');
    
    // Test Solana connection
    logger.info('Testing Solana connection...');
    const { connection } = await import('./utils/solana');
    const slot = await connection.getSlot();
    logger.success(`Connected to Solana - Current slot: ${slot}`);
    
    // Check Jito availability
    if (config.jito.enabled) {
      logger.info('Jito mode: ENABLED ⚡');
    } else {
      logger.info('Jito mode: DISABLED');
    }
    
    console.log('');
    console.log('✅ System initialized successfully!');
    console.log('');
    console.log('📦 Available modules:');
    console.log('  ✅ Swap Manager (Jupiter V6)');
    console.log('  ✅ Token Deployer (Pump.Fun)');
    console.log('  ✅ Bundler (Jito)');
    console.log('  ✅ Launcher (4 modes)');
    console.log('  ✅ Wallet Warmup');
    console.log('  ✅ SmartSell');
    console.log('  ⏳ Auto TP (pending)');
    console.log('');
    console.log('🤖 Telegram Bot: NOT STARTED');
    console.log('   To start bot: npm run start:bot');
    console.log('');
    console.log('📊 System Configuration:');
    console.log(`   Environment: ${config.nodeEnv}`);
    console.log(`   Network: ${config.solana.network}`);
    console.log(`   RPC: ${config.solana.rpcUrl.substring(0, 50)}...`);
    console.log(`   Jito: ${config.jito.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`   Database: ${config.database.database}@${config.database.host}`);
    console.log('');
    
    // Keep process alive
    logger.info('System ready. Press Ctrl+C to exit.');
    
    // Prevent process from exiting
    await new Promise(() => {});
    
  } catch (error) {
    logger.error('Initialization failed', error);
    console.error('');
    console.error('❌ INITIALIZATION FAILED');
    console.error('');
    
    if (error instanceof Error) {
      console.error('Error:', error.message);
      
      // Specific error hints
      if (error.message.includes('SOLANA_RPC_URL')) {
        console.error('');
        console.error('💡 Hint: Set SOLANA_RPC_URL in .env file');
        console.error('   Example: SOLANA_RPC_URL=https://api.mainnet-beta.solana.com');
      }
      
      if (error.message.includes('WALLET_ENCRYPTION_PASSWORD')) {
        console.error('');
        console.error('💡 Hint: Set WALLET_ENCRYPTION_PASSWORD in .env file');
        console.error('   Must be at least 32 characters long');
      }
      
      if (error.message.includes('database') || error.message.includes('ECONNREFUSED')) {
        console.error('');
        console.error('💡 Hint: Make sure PostgreSQL is running');
        console.error('   Start PostgreSQL and create database:');
        console.error('   createdb kalypt_bundler');
      }
    }
    
    console.error('');
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  try {
    logger.info('Shutting down gracefully...');
    
    // Close database connections
    const db = await import('./db/connection');
    await db.default.close();
    
    logger.success('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown error', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  console.error('');
  console.error('❌ UNCAUGHT EXCEPTION');
  console.error(error);
  console.error('');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
  console.error('');
  console.error('❌ UNHANDLED REJECTION');
  console.error(reason);
  console.error('');
  process.exit(1);
});

// Start application
initialize();