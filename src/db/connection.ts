import { Pool, PoolClient, QueryResult } from 'pg';
import config from '../config';
import logger from '../utils/logger';

/**
 * PostgreSQL Connection Pool
 */
class Database {
  private pool: Pool;
  private isConnected: boolean = false;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      max: config.database.max,
      idleTimeoutMillis: config.database.idleTimeoutMillis,
      connectionTimeoutMillis: config.database.connectionTimeoutMillis,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error', err);
      this.isConnected = false;
    });

    // Log successful connections
    this.pool.on('connect', () => {
      if (!this.isConnected) {
        logger.info('Database pool connected successfully');
        this.isConnected = true;
      }
    });

    // Log when client is removed
    this.pool.on('remove', () => {
      logger.debug('Database client removed from pool');
    });
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();

      logger.info('Database connection test successful', {
        serverTime: result.rows[0].now,
      });

      this.isConnected = true;
      return true;
    } catch (error) {
      logger.error('Database connection test failed', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Execute a query
   */
  async query<T extends Record<string, any> = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      logger.debug('Query executed', {
        text: text.substring(0, 100), // Log first 100 chars
        duration: `${duration}ms`,
        rows: result.rowCount,
      });

      return result;
    } catch (error) {
      logger.error('Query execution failed', {
        text: text.substring(0, 100),
        params,
        error,
      });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      logger.debug('Client acquired from pool');
      return client;
    } catch (error) {
      logger.error('Failed to get client from pool', error);
      throw error;
    }
  }

  /**
   * Execute queries in a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');

      const result = await callback(client);

      await client.query('COMMIT');
      logger.debug('Transaction committed');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back', error);
      throw error;
    } finally {
      client.release();
      logger.debug('Client released back to pool');
    }
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database pool closed');
    } catch (error) {
      logger.error('Error closing database pool', error);
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      isConnected: this.isConnected,
    };
  }

  /**
   * Check if database is connected
   */
  isHealthy(): boolean {
    return this.isConnected;
  }
}

/**
 * Create and export database instance
 */
const db = new Database();

/**
 * Initialize database connection and tables
 */
export async function initializeDatabase(): Promise<void> {
  try {
    logger.info('Initializing database...');

    // Test connection
    const connected = await db.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }

    // Check if tables exist, create if not
    await createTablesIfNotExist();

    logger.success('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database', error);
    throw error;
  }
}

/**
 * Create tables if they don't exist
 */
async function createTablesIfNotExist(): Promise<void> {
  try {
    // Check if users table exists
    const tablesCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    const tablesExist = tablesCheck.rows[0].exists;

    if (!tablesExist) {
      logger.info('Tables do not exist, creating schema...');
      await createSchema();
    } else {
      logger.info('Database tables already exist');
    }
  } catch (error) {
    logger.error('Error checking/creating tables', error);
    throw error;
  }
}

/**
 * Create database schema
 */
async function createSchema(): Promise<void> {
  const schema = `
    -- Users table (Telegram users)
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username VARCHAR(255),
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      is_premium BOOLEAN DEFAULT FALSE,
      premium_expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User settings table
    CREATE TABLE IF NOT EXISTS user_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      jito_enabled BOOLEAN DEFAULT true,
      jito_auto_tip BOOLEAN DEFAULT true,
      jito_max_tip DECIMAL(10, 6) DEFAULT 0.01,
      jito_priority_fee BIGINT DEFAULT 500000,
      buy_slippage INTEGER DEFAULT 15,
      sell_slippage INTEGER DEFAULT 15,
      safe_settings BOOLEAN DEFAULT true,
      settings_json JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    );

    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      ticker VARCHAR(50) NOT NULL,
      description TEXT,
      image_url TEXT,
      website VARCHAR(500),
      twitter VARCHAR(500),
      telegram VARCHAR(500),
      token_address VARCHAR(44),
      token_metadata JSONB,
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      launched_at TIMESTAMP
    );

    -- Wallets table
    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      address VARCHAR(44) UNIQUE NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      iv VARCHAR(64) NOT NULL,
      auth_tag VARCHAR(64) NOT NULL,
      salt VARCHAR(64) NOT NULL,
      wallet_type VARCHAR(20) DEFAULT 'bundle',
      label VARCHAR(255),
      balance_sol DECIMAL(20, 9) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      wallet_id INTEGER REFERENCES wallets(id) ON DELETE SET NULL,
      signature VARCHAR(88) UNIQUE NOT NULL,
      type VARCHAR(50) NOT NULL,
      amount DECIMAL(20, 9),
      token_address VARCHAR(44),
      status VARCHAR(50) DEFAULT 'pending',
      error_message TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      confirmed_at TIMESTAMP
    );

    -- Bundles table
    CREATE TABLE IF NOT EXISTS bundles (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      bundle_id VARCHAR(88),
      status VARCHAR(50) DEFAULT 'pending',
      transaction_count INTEGER DEFAULT 0,
      wallet_count INTEGER DEFAULT 0,
      tip_amount BIGINT,
      endpoint VARCHAR(255),
      error_message TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      submitted_at TIMESTAMP,
      confirmed_at TIMESTAMP
    );

    -- Launch presets table
    CREATE TABLE IF NOT EXISTS launch_presets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      launch_mode VARCHAR(50) NOT NULL,
      dev_buy_amount DECIMAL(10, 6),
      bundle_wallets INTEGER,
      bundle_sol_per_wallet DECIMAL(10, 6),
      sniper_wallets INTEGER,
      sniper_sol_min DECIMAL(10, 6),
      sniper_sol_max DECIMAL(10, 6),
      max_sniper_percentage INTEGER,
      risk_mode VARCHAR(20),
      jito_tip DECIMAL(10, 6),
      preset_json JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_wallets_project_id ON wallets(project_id);
    CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);
    CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_signature ON transactions(signature);
    CREATE INDEX IF NOT EXISTS idx_bundles_project_id ON bundles(project_id);
    CREATE INDEX IF NOT EXISTS idx_launch_presets_user_id ON launch_presets(user_id);

    -- Create updated_at trigger function
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Create triggers for updated_at
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_launch_presets_updated_at BEFORE UPDATE ON launch_presets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `;

  await db.query(schema);
  logger.success('Database schema created successfully');
}

/**
 * Export database instance and helpers
 */
export default db;
export { Database };