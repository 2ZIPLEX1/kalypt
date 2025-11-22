/**
 * Database Module
 * 
 * Main entry point for database operations
 */

// Export connection and initialization
export { default as db, initializeDatabase, Database } from './connection';

// Export all models
export * from './models';