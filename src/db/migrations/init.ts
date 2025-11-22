#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * Run this script to initialize or migrate the database
 */

import { initializeDatabase } from '../connection';
import logger from '../../utils/logger';

/**
 * Main migration function
 */
async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Initialize database (creates tables if they don't exist)
    await initializeDatabase();

    logger.success('Database migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Database migration failed', error);
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}

export default runMigrations;