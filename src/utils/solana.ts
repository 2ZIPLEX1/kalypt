import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  TransactionSignature,
  ComputeBudgetProgram,
  AddressLookupTableProgram,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import config from '../config';
import logger from './logger';
import {
  COMPUTE_BUDGET,
  TRANSACTION,
  solToLamports,
  lamportsToSol,
  sleep,
} from '../constants/solana';

/**
 * Create Solana connection instance
 */
export function createConnection(
  rpcUrl?: string,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
): Connection {
  const url = rpcUrl || config.solana.rpcUrl;
  return new Connection(url, {
    commitment,
    confirmTransactionInitialTimeout: TRANSACTION.CONFIRMATION_TIMEOUT,
  });
}

/**
 * Default connection instance
 */
export const connection = createConnection();

/**
 * Generate new Solana keypair
 */
export function generateKeypair(): Keypair {
  return Keypair.generate();
}

/**
 * Create keypair from private key (Base58 encoded)
 */
export function keypairFromPrivateKey(privateKeyBase58: string): Keypair {
  try {
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    return Keypair.fromSecretKey(privateKeyBytes);
  } catch (error) {
    logger.error('Failed to create keypair from private key', error);
    throw new Error('Invalid private key format');
  }
}

/**
 * Convert keypair to Base58 private key
 */
export function keypairToBase58(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}

/**
 * Get public key from Base58 private key
 */
export function getPublicKeyFromPrivateKey(privateKeyBase58: string): PublicKey {
  const keypair = keypairFromPrivateKey(privateKeyBase58);
  return keypair.publicKey;
}

/**
 * Validate public key string
 */
export function isValidPublicKey(publicKeyString: string): boolean {
  try {
    new PublicKey(publicKeyString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get SOL balance for address
 */
export async function getBalance(
  address: PublicKey | string,
  conn?: Connection
): Promise<number> {
  try {
    const pubkey = typeof address === 'string' ? new PublicKey(address) : address;
    const balance = await (conn || connection).getBalance(pubkey);
    return lamportsToSol(balance);
  } catch (error) {
    logger.error('Failed to get balance', { address: address.toString(), error });
    throw error;
  }
}

/**
 * Get token balance for address
 */
export async function getTokenBalance(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey,
  conn?: Connection
): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(
      tokenMintAddress,
      walletAddress
    );
    
    const balance = await (conn || connection).getTokenAccountBalance(ata);
    return parseFloat(balance.value.uiAmount?.toString() || '0');
  } catch (error) {
    // Token account might not exist yet
    return 0;
  }
}

/**
 * Get multiple balances efficiently
 */
export async function getMultipleBalances(
  addresses: PublicKey[],
  conn?: Connection
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  
  try {
    const accountsInfo = await (conn || connection).getMultipleAccountsInfo(
      addresses
    );
    
    accountsInfo.forEach((accountInfo, index) => {
      const address = addresses[index].toString();
      const lamports = accountInfo?.lamports || 0;
      balances.set(address, lamportsToSol(lamports));
    });
    
    return balances;
  } catch (error) {
    logger.error('Failed to get multiple balances', error);
    throw error;
  }
}

/**
 * Transfer SOL from one wallet to another
 */
export async function transferSOL(
  from: Keypair,
  to: PublicKey,
  amountSol: number,
  conn?: Connection
): Promise<TransactionSignature> {
  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to,
        lamports: solToLamports(amountSol),
      })
    );
    
    const signature = await sendAndConfirmTransaction(
      conn || connection,
      transaction,
      [from],
      {
        commitment: 'confirmed',
        skipPreflight: TRANSACTION.SKIP_PREFLIGHT,
      }
    );
    
    logger.transaction('SOL transfer completed', {
      signature,
      from: from.publicKey.toString(),
      to: to.toString(),
      amount: amountSol,
      type: 'transfer_sol',
      status: 'confirmed',
    });
    
    return signature;
  } catch (error) {
    logger.error('SOL transfer failed', error);
    throw error;
  }
}

/**
 * Add compute budget instructions to transaction
 */
export function addComputeBudget(
  transaction: Transaction,
  units: number = COMPUTE_BUDGET.DEFAULT_UNIT_LIMIT,
  price: number = COMPUTE_BUDGET.DEFAULT_UNIT_PRICE
): Transaction {
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units,
    })
  );
  
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: price,
    })
  );
  
  return transaction;
}

/**
 * Get or create associated token account
 */
export async function getOrCreateAssociatedTokenAccount(
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  conn?: Connection
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  
  // Check if account exists
  const accountInfo = await (conn || connection).getAccountInfo(ata);
  
  if (accountInfo) {
    return ata;
  }
  
  // Create account
  const transaction = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint
    )
  );
  
  await sendAndConfirmTransaction(
    conn || connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );
  
  logger.info('Created associated token account', {
    ata: ata.toString(),
    mint: mint.toString(),
    owner: owner.toString(),
  });
  
  return ata;
}

/**
 * Create Address Lookup Table
 */
export async function createLookupTable(
  authority: Keypair,
  addresses: PublicKey[],
  conn?: Connection
): Promise<PublicKey> {
  try {
    const [lookupTableInstruction, lookupTableAddress] =
      AddressLookupTableProgram.createLookupTable({
        authority: authority.publicKey,
        payer: authority.publicKey,
        recentSlot: await (conn || connection).getSlot(),
      });
    
    // Create the lookup table
    const transaction = new Transaction().add(lookupTableInstruction);
    
    await sendAndConfirmTransaction(
      conn || connection,
      transaction,
      [authority],
      { commitment: 'confirmed' }
    );
    
    logger.info('Lookup table created', {
      address: lookupTableAddress.toString(),
    });
    
    // Wait for table to be active
    await sleep(2000);
    
    // Extend the lookup table with addresses
    if (addresses.length > 0) {
      await extendLookupTable(
        lookupTableAddress,
        authority,
        addresses,
        conn
      );
    }
    
    return lookupTableAddress;
  } catch (error) {
    logger.error('Failed to create lookup table', error);
    throw error;
  }
}

/**
 * Extend lookup table with new addresses
 */
export async function extendLookupTable(
  lookupTableAddress: PublicKey,
  authority: Keypair,
  addresses: PublicKey[],
  conn?: Connection
): Promise<void> {
  try {
    // Split addresses into chunks of 20 (max per transaction)
    const chunks = [];
    for (let i = 0; i < addresses.length; i += 20) {
      chunks.push(addresses.slice(i, i + 20));
    }
    
    for (const chunk of chunks) {
      const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        lookupTable: lookupTableAddress,
        authority: authority.publicKey,
        payer: authority.publicKey,
        addresses: chunk,
      });
      
      const transaction = new Transaction().add(extendInstruction);
      
      await sendAndConfirmTransaction(
        conn || connection,
        transaction,
        [authority],
        { commitment: 'confirmed' }
      );
      
      logger.debug('Extended lookup table', {
        address: lookupTableAddress.toString(),
        addedAddresses: chunk.length,
      });
      
      // Small delay between extensions
      await sleep(500);
    }
    
    logger.info('Lookup table extended successfully', {
      address: lookupTableAddress.toString(),
      totalAddresses: addresses.length,
    });
  } catch (error) {
    logger.error('Failed to extend lookup table', error);
    throw error;
  }
}

/**
 * Get lookup table account
 */
export async function getLookupTableAccount(
  lookupTableAddress: PublicKey,
  conn?: Connection
): Promise<AddressLookupTableAccount | null> {
  try {
    const accountInfo = await (conn || connection).getAddressLookupTable(
      lookupTableAddress
    );
    return accountInfo.value;
  } catch (error) {
    logger.error('Failed to get lookup table', error);
    return null;
  }
}

/**
 * Wait for transaction confirmation with retries
 */
export async function confirmTransaction(
  signature: TransactionSignature,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
  conn?: Connection,
  maxRetries: number = TRANSACTION.MAX_RETRIES
): Promise<boolean> {
  const c = conn || connection;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const status = await c.getSignatureStatus(signature);
      
      if (status.value?.confirmationStatus === commitment || 
          status.value?.confirmationStatus === 'finalized') {
        return true;
      }
      
      if (status.value?.err) {
        logger.error('Transaction failed', {
          signature,
          error: status.value.err,
        });
        return false;
      }
      
      await sleep(1000);
    } catch (error) {
      logger.warn(`Transaction confirmation retry ${i + 1}/${maxRetries}`, {
        signature,
        error,
      });
      
      if (i === maxRetries - 1) {
        throw error;
      }
      
      await sleep(2000);
    }
  }
  
  return false;
}

/**
 * Check if wallet has sufficient balance
 */
export async function hasSufficientBalance(
  address: PublicKey,
  requiredSol: number,
  conn?: Connection
): Promise<boolean> {
  const balance = await getBalance(address, conn);
  return balance >= requiredSol;
}

/**
 * Get recent blockhash with retry
 */
export async function getRecentBlockhash(
  conn?: Connection,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  try {
    const { blockhash, lastValidBlockHeight } = await (
      conn || connection
    ).getLatestBlockhash(commitment);
    
    return { blockhash, lastValidBlockHeight };
  } catch (error) {
    logger.error('Failed to get recent blockhash', error);
    throw error;
  }
}

/**
 * Airdrop SOL (devnet/testnet only)
 */
export async function airdrop(
  address: PublicKey,
  amount: number = 1,
  conn?: Connection
): Promise<TransactionSignature> {
  try {
    const signature = await (conn || connection).requestAirdrop(
      address,
      solToLamports(amount)
    );
    
    await confirmTransaction(signature, 'confirmed', conn);
    
    logger.info('Airdrop completed', {
      address: address.toString(),
      amount,
      signature,
    });
    
    return signature;
  } catch (error) {
    logger.error('Airdrop failed', error);
    throw error;
  }
}

/**
 * Batch transfer SOL to multiple wallets
 */
export async function batchTransferSOL(
  from: Keypair,
  recipients: Array<{ address: PublicKey; amount: number }>,
  conn?: Connection
): Promise<TransactionSignature[]> {
  const signatures: TransactionSignature[] = [];
  
  for (const recipient of recipients) {
    try {
      const signature = await transferSOL(
        from,
        recipient.address,
        recipient.amount,
        conn
      );
      signatures.push(signature);
      
      // Small delay between transfers
      await sleep(500);
    } catch (error) {
      logger.error('Batch transfer failed for recipient', {
        recipient: recipient.address.toString(),
        error,
      });
      throw error;
    }
  }
  
  return signatures;
}

/**
 * Format public key for display (shortened)
 */
export function formatPublicKey(
  publicKey: PublicKey | string,
  start: number = 4,
  end: number = 4
): string {
  const key = publicKey.toString();
  return `${key.slice(0, start)}...${key.slice(-end)}`;
}

/**
 * Export utilities
 */
export {
  solToLamports,
  lamportsToSol,
  sleep,
};