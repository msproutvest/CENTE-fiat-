import { SOLANA_USDC_MINT } from '../data/halalStocks';

const JUPITER_API_BASES = [
  'https://lite-api.jup.ag/swap/v1',
  'https://api.jup.ag/swap/v1',
];

const SOLANA_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://rpc.ankr.com/solana',
];

/**
 * Fetch a swap route quote from Jupiter DEX Aggregator
 */
export async function getJupiterStockQuote({
  inputMint = SOLANA_USDC_MINT,
  outputMint,
  amountRaw,
  slippageBps = 50,
}) {
  if (!outputMint || !amountRaw || amountRaw <= 0) {
    throw new Error('Valid output mint and amount are required for quote.');
  }

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amountRaw),
    slippageBps: String(slippageBps),
    swapMode: 'ExactIn',
    restrictIntermediateTokens: 'false',
  });

  let lastError = null;
  for (const base of JUPITER_API_BASES) {
    try {
      const res = await fetch(`${base}/quote?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || errData?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data?.outAmount) {
        return {
          ...data,
          _sourceBase: base,
        };
      }
    } catch (err) {
      lastError = err?.message || 'Quote request failed';
    }
  }

  throw new Error(lastError || 'No Jupiter swap route available.');
}

/**
 * Get the serialized swap transaction from Jupiter
 */
export async function getJupiterStockSwapTransaction({
  userPublicKey,
  quoteResponse,
  dynamicComputeUnitLimit = true,
  prioritizationFeeLamports = 'auto',
}) {
  if (!userPublicKey) {
    throw new Error('User Solana public key is required to build swap transaction.');
  }
  if (!quoteResponse?.outAmount) {
    throw new Error('Valid quote response is required to build swap transaction.');
  }

  const payload = {
    userPublicKey,
    quoteResponse,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit,
    prioritizationFeeLamports,
  };

  const bases = quoteResponse._sourceBase
    ? [quoteResponse._sourceBase, ...JUPITER_API_BASES.filter((b) => b !== quoteResponse._sourceBase)]
    : JUPITER_API_BASES;

  let lastError = null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || errData?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data?.swapTransaction) {
        return data;
      }
    } catch (err) {
      lastError = err?.message || 'Swap transaction construction failed';
    }
  }

  throw new Error(lastError || 'Failed to construct Jupiter swap transaction.');
}

/**
 * Fetch live stock price in USDC using Jupiter market liquidity
 */
export async function fetchStockPriceUsd(stockMint, stockDecimals = 8) {
  try {
    // 100 USDC in smallest units (6 decimals)
    const testAmountRaw = 100_000_000;
    const quote = await getJupiterStockQuote({
      inputMint: SOLANA_USDC_MINT,
      outputMint: stockMint,
      amountRaw: testAmountRaw,
      slippageBps: 50,
    });

    if (quote?.outAmount) {
      const shares = Number(quote.outAmount) / 10 ** stockDecimals;
      if (shares > 0) {
        const pricePerShare = 100 / shares;
        return Number(pricePerShare.toFixed(2));
      }
    }
  } catch (err) {
    console.warn('[Jupiter] Failed to fetch stock price for', stockMint, err?.message || err);
  }
  return null;
}

/**
 * Query user's SPL token balance on Solana
 */
export async function fetchTokenBalance(solanaAddress, mintAddress) {
  if (!solanaAddress || !mintAddress) return 0;

  for (const rpc of SOLANA_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'balance-check',
          method: 'getTokenAccountsByOwner',
          params: [
            solanaAddress,
            { mint: mintAddress },
            { encoding: 'jsonParsed' },
          ],
        }),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const accounts = data?.result?.value;
      if (Array.isArray(accounts) && accounts.length > 0) {
        let total = 0;
        for (const acc of accounts) {
          const info = acc?.account?.data?.parsed?.info?.tokenAmount;
          if (info?.uiAmount) {
            total += Number(info.uiAmount);
          }
        }
        return total;
      }
      return 0;
    } catch {
      // try next RPC
    }
  }
  return 0;
}

/**
 * Decode base64 transaction string into Uint8Array
 */
export function decodeBase64Tx(b64) {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Executes Jupiter swap transaction using connected Privy Solana embedded wallet
 */
export async function executeSolanaSwapTransaction({
  solWallet,
  swapTransactionBase64,
}) {
  if (!solWallet) {
    throw new Error('No Solana wallet connected to sign the transaction.');
  }
  if (!swapTransactionBase64) {
    throw new Error('No swap transaction provided.');
  }

  const txBytes = decodeBase64Tx(swapTransactionBase64);

  // Strategy 1: Standard wallet signAndSendTransaction
  if (typeof solWallet.signAndSendTransaction === 'function') {
    try {
      const res = await solWallet.signAndSendTransaction({
        transaction: txBytes,
        chain: 'solana:mainnet',
      });
      const sig = res?.signature || res?.hash || res;
      if (typeof sig === 'string' && sig.length >= 32) return sig;
    } catch (err) {
      if (err?.message?.includes('User rejected') || err?.name === 'UserRejectedRequestError') {
        throw err;
      }
      console.warn('[Jupiter] signAndSendTransaction failed, trying signTransaction:', err);
    }
  }

  // Strategy 2: Standard wallet signTransaction + direct RPC broadcast
  if (typeof solWallet.signTransaction === 'function') {
    const signed = await solWallet.signTransaction({
      transaction: txBytes,
      chain: 'solana:mainnet',
    });

    const signedBytes = signed?.signedTransaction || signed;
    const rawBytes = signedBytes instanceof Uint8Array ? signedBytes : new Uint8Array(signedBytes);
    const rawBase64 = typeof Buffer !== 'undefined'
      ? Buffer.from(rawBytes).toString('base64')
      : btoa(String.fromCharCode(...rawBytes));

    for (const rpc of SOLANA_RPCS) {
      try {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'send-tx',
            method: 'sendTransaction',
            params: [rawBase64, { encoding: 'base64', skipPreflight: true, maxRetries: 5 }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.result) return data.result;
        }
      } catch (rpcErr) {
        console.warn('[Jupiter] RPC broadcast error:', rpcErr);
      }
    }
  }

  // Strategy 3: Standard sendTransaction
  if (typeof solWallet.sendTransaction === 'function') {
    const res = await solWallet.sendTransaction(txBytes, {
      chain: 'solana:mainnet',
    });
    const sig = res?.signature || res?.hash || res;
    if (typeof sig === 'string' && sig.length >= 32) return sig;
  }

  throw new Error('Unable to execute transaction with the connected wallet.');
}
