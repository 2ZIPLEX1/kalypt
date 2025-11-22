#!/usr/bin/env node

/**
 * Database Test Script with better error handling
 */

// Catch unhandled rejections
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

console.log('🚀 Starting database test script...');

import { initializeDatabase } from './db/connection';
import { UserModel } from './db/models/user';
import { ProjectModel } from './db/models/project';
import { WalletModel, Wallet } from './db/models/wallet';
import logger from './utils/logger';

console.log('✅ Imports successful');

async function testDatabase() {
  try {
    console.log('📋 Test function started');
    logger.start('Database tests');

    // 1. Initialize database
    logger.info('Step 1: Initializing database...');
    console.log('Connecting to database...');
    
    await initializeDatabase();
    
    logger.success('Database initialized');
    console.log('✅ Database connection successful');

    // 2. Create test user
    logger.info('Step 2: Creating test user...');
    const user = await UserModel.createOrUpdate({
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
    });
    logger.success('User created', { userId: user.id, telegramId: user.telegram_id });

    // 3. Get user settings
    logger.info('Step 3: Getting user settings...');
    const settings = await UserModel.getSettings(user.id);
    logger.success('Settings retrieved', {
      jitoEnabled: settings?.jito_enabled,
      buySlippage: settings?.buy_slippage,
    });

    // 4. Create test project
    logger.info('Step 4: Creating test project...');
    const project = await ProjectModel.create({
      user_id: user.id,
      name: 'Test Token',
      ticker: 'TEST',
      description: 'A test token project',
    });
    logger.success('Project created', {
      projectId: project.id,
      name: project.name,
      ticker: project.ticker,
    });

    // 5. Create test wallets
    logger.info('Step 5: Creating test wallets...');
    const wallets = await WalletModel.createBatch(project.id, 3);
    logger.success('Wallets created', {
      count: wallets.length,
      addresses: wallets.map((w: Wallet) => w.address.substring(0, 8) + '...'),
    });

    // 6. Get wallet with private key (decrypt)
    logger.info('Step 6: Testing wallet decryption...');
    const walletWithKey = await WalletModel.getWithPrivateKey(wallets[0].id);
    logger.success('Wallet decrypted', {
      address: walletWithKey?.address.substring(0, 8) + '...',
      hasPrivateKey: !!walletWithKey?.private_key,
    });

    // 7. Get all user projects
    logger.info('Step 7: Getting all user projects...');
    const userProjects = await ProjectModel.findByUserId(user.id);
    logger.success('Projects retrieved', { count: userProjects.length });

    // 8. Get project wallets
    logger.info('Step 8: Getting project wallets...');
    const projectWallets = await WalletModel.findByProjectId(project.id);
    logger.success('Project wallets retrieved', { count: projectWallets.length });

    // 9. Cleanup (delete test data)
    logger.info('Step 9: Cleaning up test data...');
    await ProjectModel.delete(project.id);
    await UserModel.delete(user.id);
    logger.success('Test data cleaned up');

    logger.complete('All database tests passed! ✅');
    console.log('🎉 All tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    logger.failure('Database test failed', error);
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    process.exit(1);
  }
}

console.log('Calling testDatabase()...');
testDatabase().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});