import { SOLANA_USDC_MINT, HALAL_STOCKS } from '../data/halalStocks';

const JUPITER_API_BASES = [
  'https://lite-api.jup.ag/swap/v1',
  'https://api.jup.ag/swap/v1',
];

const SOLANA_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://rpc.ankr.com/solana',
];

// In-memory quote cache (key: input:output:amount:slippage -> { data, timestamp })
const quoteCache = new Map();
const QUOTE_CACHE_TTL = 30_000; // 30 seconds

// In-memory price cache (mint -> { price, timestamp })
const priceCache = new Map();
const inFlightPriceRequests = new Map();
const PRICE_CACHE_TTL = 180_000; // 3 minutes

/**
 * Fetch a swap route quote from Jupiter DEX Aggregator with automatic retry and rate-limit smoothing
 */
export async function getJupiterStockQuote({
  inputMint = SOLANA_USDC_MINT,
  outputMint,
  amountRaw,
  slippageBps = 50,
  signal,
}) {
  if (!outputMint || !amountRaw || amountRaw <= 0) {
    throw new Error('Valid output mint and amount are required for quote.');
  }

  const cacheKey = `${inputMint}:${outputMint}:${amountRaw}:${slippageBps}`;
  const cached = quoteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < QUOTE_CACHE_TTL) {
    return cached.data;
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
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${base}/quote?${params.toString()}`, { signal });

        if (res.status === 429) {
          // If we have an existing quote for this pair in cache, gracefully reuse it
          if (cached?.data) {
            return cached.data;
          }
          if (attempt === 0) {
            // Short backoff delay with random jitter (600ms - 900ms)
            await new Promise((r) => setTimeout(r, 600 + Math.random() * 300));
            continue;
          }
          throw new Error('Market execution is busy right now. Retrying in a moment...');
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = String(errData?.error || errData?.message || `HTTP ${res.status}`);
          if (errMsg.toLowerCase().includes('too many requests') || errMsg.includes('429')) {
            throw new Error('Market execution is busy right now. Retrying in a moment...');
          }
          throw new Error(errMsg);
        }

        const data = await res.json();
        if (data?.outAmount) {
          const result = {
            ...data,
            _sourceBase: base,
          };
          quoteCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        const msg = String(err?.message || 'Quote request failed');
        if (msg.toLowerCase().includes('too many requests') || msg.includes('429')) {
          lastError = 'Market execution is busy right now. Retrying in a moment...';
        } else {
          lastError = msg;
        }
      }
    }
  }

  // Final fallback: if cache exists, return it even if slightly aged
  if (cached?.data) {
    return cached.data;
  }

  throw new Error(lastError || 'No trade route available.');
}

/**
 * Get the serialized swap transaction from Jupiter
 */
export async function getJupiterStockSwapTransaction({
  userPublicKey,
  quoteResponse,
  dynamicComputeUnitLimit = true,
  prioritizationFeeLamports = 'auto',
  signal,
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
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${base}/swap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal,
        });

        if (res.status === 429) {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 700 + Math.random() * 300));
            continue;
          }
          throw new Error('Network is busy. Please tap Trade again in a moment.');
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = String(errData?.error || errData?.message || `HTTP ${res.status}`);
          if (errMsg.toLowerCase().includes('too many requests') || errMsg.includes('429')) {
            throw new Error('Network is busy. Please tap Trade again in a moment.');
          }
          throw new Error(errMsg);
        }

        const data = await res.json();
        if (data?.swapTransaction) {
          return data;
        }
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        const msg = String(err?.message || 'Swap transaction construction failed');
        if (msg.toLowerCase().includes('too many requests') || msg.includes('429')) {
          lastError = 'Network is busy. Please tap Trade again in a moment.';
        } else {
          lastError = msg;
        }
      }
    }
  }

  throw new Error(lastError || 'Failed to construct trade transaction.');
}

/**
 * Fetch live stock price in USDC using Jupiter market liquidity with deduplication and caching
 */
export async function fetchStockPriceUsd(stockMint, stockDecimals = 8, defaultPrice = null) {
  if (!stockMint) return defaultPrice;

  // 1. Check in-memory price cache
  const cached = priceCache.get(stockMint);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }

  // 2. If already in flight, reuse existing promise
  if (inFlightPriceRequests.has(stockMint)) {
    return inFlightPriceRequests.get(stockMint);
  }

  // 3. Fallback to reference price from catalog
  const reference = defaultPrice || HALAL_STOCKS.find((s) => s.mint === stockMint)?.referencePriceUsd || null;

  const fetchPromise = (async () => {
    try {
      // Use 100 USDC quote for price discovery
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
          const pricePerShare = Number((100 / shares).toFixed(2));
          priceCache.set(stockMint, { price: pricePerShare, timestamp: Date.now() });
          return pricePerShare;
        }
      }
    } catch {
      // Graceful fallback to reference price on rate limits or network issues
    } finally {
      inFlightPriceRequests.delete(stockMint);
    }
    return reference;
  })();

  inFlightPriceRequests.set(stockMint, fetchPromise);
  return fetchPromise;
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
      const accounts = data?.result?.value || [];
      if (!accounts.length) return 0;

      const total = accounts.reduce((acc, curr) => {
        const amount = curr?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
        return acc + (Number(amount) || 0);
      }, 0);

      return total;
    } catch {}
  }

  return 0;
}

/**
 * Executes swap transaction using connected Privy Solana embedded wallet
 */
export async function executeSolanaSwapTransaction({
  solWallet,
  swapTransactionBase64,
}) {
  if (!swapTransactionBase64) {
    throw new Error('No swap transaction provided.');
  }

  const txBuffer = Uint8Array.from(atob(swapTransactionBase64), (c) => c.charCodeAt(0));

  if (solWallet && typeof solWallet.signAndSendTransaction === 'function') {
    try {
      const sendRes = await solWallet.signAndSendTransaction({
        transaction: txBuffer,
      });
      const sig = sendRes?.signature || sendRes?.hash || sendRes;
      if (sig && typeof sig === 'string') return sig;
    } catch (err) {
      if (solWallet && typeof solWallet.signTransaction === 'function') {
        const signed = await solWallet.signTransaction({ transaction: txBuffer });
        const signedBuffer = signed?.signedTransaction || signed;
        const signedBase64 = btoa(String.fromCharCode.apply(null, signedBuffer));

        for (const rpc of SOLANA_RPCS) {
          try {
            const broadcastRes = await fetch(rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'broadcast-swap',
                method: 'sendTransaction',
                params: [
                  signedBase64,
                  {
                    encoding: 'base64',
                    skipPreflight: false,
                    preflightCommitment: 'confirmed',
                  },
                ],
              }),
            });
            if (broadcastRes.ok) {
              const bData = await broadcastRes.json();
              if (bData?.result) return bData.result;
            }
          } catch {}
        }
      }
      throw err;
    }
  }

  throw new Error('Connected Solana wallet does not support transaction signing.');
}
