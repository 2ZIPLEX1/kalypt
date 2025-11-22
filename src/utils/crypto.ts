import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import config from '../config';
import logger from './logger';

/**
 * Encryption algorithm and settings
 */
const ENCRYPTION_CONFIG = {
  // Algorithm for encryption
  ALGORITHM: 'aes-256-gcm',
  
  // Key derivation
  PBKDF2_ITERATIONS: 100000,
  SALT_LENGTH: 32,
  KEY_LENGTH: 32,
  
  // IV and Auth Tag
  IV_LENGTH: 16,
  AUTH_TAG_LENGTH: 16,
  
  // Encoding
  ENCODING: 'hex' as const,
};

/**
 * Encrypted data interface
 */
export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
  salt: string;
}

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    password,
    salt,
    ENCRYPTION_CONFIG.PBKDF2_ITERATIONS,
    ENCRYPTION_CONFIG.KEY_LENGTH,
    'sha256'
  );
}

/**
 * Encrypt data using AES-256-GCM
 * 
 * @param data - Data to encrypt (e.g., private key)
 * @param password - Encryption password (from config or user input)
 * @returns Encrypted data object
 */
export function encrypt(data: string, password?: string): EncryptedData {
  try {
    const encryptionPassword = password || config.wallet.encryptionPassword;
    
    // Generate random salt and IV
    const salt = crypto.randomBytes(ENCRYPTION_CONFIG.SALT_LENGTH);
    const iv = crypto.randomBytes(ENCRYPTION_CONFIG.IV_LENGTH);
    
    // Derive key from password
    const key = deriveKey(encryptionPassword, salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(
      ENCRYPTION_CONFIG.ALGORITHM,
      key,
      iv
    );
    
    // Encrypt data
    const encryptedBuffer = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final(),
    ]);
    
    // Get authentication tag (only available after final() call)
    const authTag = (cipher as any).getAuthTag();
    
    return {
      encrypted: encryptedBuffer.toString(ENCRYPTION_CONFIG.ENCODING),
      iv: iv.toString(ENCRYPTION_CONFIG.ENCODING),
      authTag: authTag.toString(ENCRYPTION_CONFIG.ENCODING),
      salt: salt.toString(ENCRYPTION_CONFIG.ENCODING),
    };
  } catch (error) {
    logger.error('Encryption failed', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES-256-GCM
 * 
 * @param encryptedData - Encrypted data object
 * @param password - Decryption password
 * @returns Decrypted data
 */
export function decrypt(
  encryptedData: EncryptedData,
  password?: string
): string {
  try {
    const decryptionPassword = password || config.wallet.encryptionPassword;
    
    // Convert hex strings back to buffers
    const salt = Buffer.from(encryptedData.salt, ENCRYPTION_CONFIG.ENCODING);
    const iv = Buffer.from(encryptedData.iv, ENCRYPTION_CONFIG.ENCODING);
    const authTag = Buffer.from(
      encryptedData.authTag,
      ENCRYPTION_CONFIG.ENCODING
    );
    
    // Derive key from password
    const key = deriveKey(decryptionPassword, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_CONFIG.ALGORITHM,
      key,
      iv
    );
    
    // Set authentication tag (cast to any to avoid TS error)
    (decipher as any).setAuthTag(authTag);
    
    // Decrypt data
    const decryptedBuffer = Buffer.concat([
      decipher.update(
        Buffer.from(encryptedData.encrypted, ENCRYPTION_CONFIG.ENCODING)
      ),
      decipher.final(),
    ]);
    
    return decryptedBuffer.toString('utf8');
  } catch (error) {
    logger.error('Decryption failed', error);
    throw new Error('Failed to decrypt data - invalid password or corrupted data');
  }
}

/**
 * Encrypt private key specifically
 * 
 * @param privateKey - Base58 encoded private key
 * @param password - Optional password (uses config if not provided)
 * @returns Encrypted private key data
 */
export function encryptPrivateKey(
  privateKey: string,
  password?: string
): EncryptedData {
  if (!privateKey || privateKey.length === 0) {
    throw new Error('Private key cannot be empty');
  }
  
  logger.debug('Encrypting private key');
  return encrypt(privateKey, password);
}

/**
 * Decrypt private key specifically
 * 
 * @param encryptedData - Encrypted private key data
 * @param password - Optional password
 * @returns Decrypted Base58 private key
 */
export function decryptPrivateKey(
  encryptedData: EncryptedData,
  password?: string
): string {
  logger.debug('Decrypting private key');
  return decrypt(encryptedData, password);
}

/**
 * Hash password using SHA-256 (for storage/comparison)
 * NOT for encryption - use PBKDF2 for that
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Verify password against hash
 */
export function verifyPassword(password: string, hash: string): boolean {
  const passwordHash = hashPassword(password);
  return passwordHash === hash;
}

/**
 * Generate random encryption key
 * Useful for generating new encryption passwords
 */
export function generateEncryptionKey(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Secure random string generator
 * Useful for tokens, IDs, etc.
 */
export function generateSecureRandom(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Encrypt data using CryptoJS (alternative method)
 * Simpler but less secure than AES-GCM
 * Used for less critical data
 */
export function simpleEncrypt(data: string, password?: string): string {
  const encryptionPassword = password || config.wallet.encryptionPassword;
  return CryptoJS.AES.encrypt(data, encryptionPassword).toString();
}

/**
 * Decrypt data using CryptoJS
 */
export function simpleDecrypt(encrypted: string, password?: string): string {
  try {
    const decryptionPassword = password || config.wallet.encryptionPassword;
    const bytes = CryptoJS.AES.decrypt(encrypted, decryptionPassword);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    logger.error('Simple decryption failed', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Check if encryption password is strong enough
 */
export function validateEncryptionPassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 32) {
    errors.push('Password must be at least 32 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Securely wipe sensitive data from memory
 * Overwrites string with random data before garbage collection
 */
export function secureWipe(data: string): void {
  // Convert to buffer
  const buffer = Buffer.from(data);
  
  // Overwrite with random data multiple times
  for (let i = 0; i < 3; i++) {
    crypto.randomFillSync(buffer);
  }
  
  // Fill with zeros
  buffer.fill(0);
}

/**
 * Create encrypted backup of wallet data
 */
export interface WalletBackup {
  version: string;
  createdAt: string;
  data: EncryptedData;
  checksum: string;
}

export function createWalletBackup(
  walletData: any,
  password?: string
): WalletBackup {
  const dataString = JSON.stringify(walletData);
  const encrypted = encrypt(dataString, password);
  const checksum = crypto.createHash('sha256').update(dataString).digest('hex');
  
  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    data: encrypted,
    checksum,
  };
}

/**
 * Restore wallet from encrypted backup
 */
export function restoreWalletBackup(
  backup: WalletBackup,
  password?: string
): any {
  const decrypted = decrypt(backup.data, password);
  const walletData = JSON.parse(decrypted);
  
  // Verify checksum
  const dataString = JSON.stringify(walletData);
  const checksum = crypto.createHash('sha256').update(dataString).digest('hex');
  
  if (checksum !== backup.checksum) {
    throw new Error('Backup checksum verification failed - data may be corrupted');
  }
  
  return walletData;
}

/**
 * Test encryption/decryption
 */
export function testEncryption(): boolean {
  try {
    const testData = 'test-private-key-' + Date.now();
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    
    if (testData === decrypted) {
      logger.info('Encryption test passed');
      return true;
    } else {
      logger.error('Encryption test failed - data mismatch');
      return false;
    }
  } catch (error) {
    logger.error('Encryption test failed', error);
    return false;
  }
}

// Log encryption initialization
logger.info('Crypto module initialized', {
  algorithm: ENCRYPTION_CONFIG.ALGORITHM,
  keyLength: ENCRYPTION_CONFIG.KEY_LENGTH,
  pbkdf2Iterations: ENCRYPTION_CONFIG.PBKDF2_ITERATIONS,
});