/**
 * Wallet extraction and normalization utilities
 */

export function deduplicateWallets(wallets = []) {
  const seen = new Set();
  const deduped = [];
  for (const w of wallets) {
    if (!w?.address) continue;
    const key = String(w.address).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(w);
    }
  }
  return deduped;
}

export function extractWalletsFromPrivy(privyUser, privyWallets = [], solanaWallets = []) {
  const wallets = [];

  // 1. From linkedAccounts on Privy User object
  if (Array.isArray(privyUser?.linkedAccounts)) {
    for (const a of privyUser.linkedAccounts) {
      if (a?.type === 'wallet' && a?.address) {
        wallets.push({
          address: a.address,
          chainType: a.chainType || (String(a.address).startsWith('0x') ? 'ethereum' : 'solana'),
          walletClientType: a.walletClientType || 'privy',
          delegated: Boolean(a.delegated),
        });
      }
    }
  }

  // 2. From EVM privyWallets
  if (Array.isArray(privyWallets)) {
    for (const pw of privyWallets) {
      if (pw?.address) {
        wallets.push({
          address: pw.address,
          chainType: pw.chainType || (String(pw.address).startsWith('0x') ? 'ethereum' : 'solana'),
          walletClientType: pw.walletClientType || 'privy',
          delegated: Boolean(pw.delegated),
        });
      }
    }
  }

  // 3. From solanaWallets
  if (Array.isArray(solanaWallets)) {
    for (const sw of solanaWallets) {
      if (sw?.address) {
        wallets.push({
          address: sw.address,
          chainType: 'solana',
          walletClientType: sw.walletClientType || 'privy',
          delegated: Boolean(sw.delegated),
        });
      }
    }
  }

  return deduplicateWallets(wallets);
}

/**
 * Returns the active user's Solana address
 */
export function getSolanaWalletAddress(user, solanaWallets = [], privyWallets = []) {
  // 1. Check solanaWallets hook array if provided
  if (Array.isArray(solanaWallets) && solanaWallets[0]?.address) {
    return solanaWallets[0].address;
  }

  if (!user) return null;

  // 2. Check linkedAccounts for an active Solana wallet
  if (Array.isArray(user.linkedAccounts)) {
    const solAccount = user.linkedAccounts.find(
      (a) =>
        a.type === 'wallet' &&
        (a.chainType === 'solana' || (typeof a.address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a.address) && !a.address.startsWith('0x')))
    );
    if (solAccount?.address) return solAccount.address;
  }

  // 3. Check user.wallet if it is a Solana wallet
  if (
    user.wallet?.address &&
    (user.wallet.chainType === 'solana' || (!user.wallet.address.startsWith('0x') && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(user.wallet.address)))
  ) {
    return user.wallet.address;
  }

  // 4. Check privyWallets
  if (Array.isArray(privyWallets)) {
    const solWallet = privyWallets.find(
      (w) => w?.chainType === 'solana' || (w?.address && !w.address.startsWith('0x') && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w.address))
    );
    if (solWallet?.address) return solWallet.address;
  }

  return null;
}

/**
 * Returns the active user's embedded EVM address (Base, Ethereum, Polygon, BSC)
 */
export function getEvmWalletAddress(user, privyWallets = []) {
  // 1. Check privyWallets hook array
  if (Array.isArray(privyWallets)) {
    const evm = privyWallets.find(
      (w) => w?.address && /^0x[a-fA-F0-9]{40}$/.test(w.address)
    );
    if (evm?.address) return evm.address;
  }

  if (!user) return null;

  // 2. Check linkedAccounts for an embedded EVM wallet
  if (Array.isArray(user.linkedAccounts)) {
    const evmAccount = user.linkedAccounts.find(
      (a) =>
        a.type === 'wallet' &&
        (a.chainType === 'ethereum' || (typeof a.address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(a.address)))
    );
    if (evmAccount?.address) return evmAccount.address;
  }

  // 3. Check user.wallet if EVM
  if (user.wallet?.address && /^0x[a-fA-F0-9]{40}$/.test(user.wallet.address)) {
    return user.wallet.address;
  }

  return null;
}
