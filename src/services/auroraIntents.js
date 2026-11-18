import { config } from '../config';

/**
 * Helper to fetch Aurora Intents API with exponential backoff and Retry-After support.
 * Complies with Aurora Intents rate limiting best practices.
 */
async function fetchAuroraWithRetry(url, options = {}, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);

      // If success or a non-rate-limit 4xx error (like 400 Bad Request), return immediately
      if ((res.status !== 429 && res.status !== 504) || attempt === maxAttempts) {
        return res;
      }

      const retryAfterHeader = Number(res.headers.get('Retry-After'));
      const waitSeconds =
        Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? Math.min(retryAfterHeader, 5)
          : attempt;
      const jitterMs = Math.floor(Math.random() * 400);
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000 + jitterMs));
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  return fetch(url, options);
}

/**
 * Request or retrieve a persistent deposit address (PDA) via Aurora Intents API.
 * Any funds deposited to this address (e.g. USDT on TRON or Native BTC)
 * are automatically swapped and delivered directly to the user's Solana recipient address.
 */
export async function getAuroraDepositAddress({
  depositChain = 'tron',
  recipient,
  destinationAsset = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
  apiKey = config.aurora?.apiKey,
  apiUrl = config.aurora?.apiUrl || 'https://intents-api.aurora.dev',
}) {
  if (!recipient) {
    throw new Error('Recipient Solana wallet address is required.');
  }

  if (!apiKey) {
    throw new Error(
      'Aurora Intents API key is not configured. Please set VITE_AURORA_INTENTS_API_KEY in your environment.'
    );
  }

  const cacheKey = `halalvest_aurora_pda_v2_${depositChain}_${destinationAsset}_${recipient}`;

  // Check persistent local cache first
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.depositAddress && typeof parsed.depositAddress === 'string') {
        return parsed;
      }
    }
  } catch {}

  const pdaPayload = {
    sender: recipient,
    depositChain,
    destinationChain: 'sol',
    recipient,
    recipientType: 'DESTINATION_CHAIN',
    destinationAsset,
  };

  const url = `${apiUrl}/api/persistent-deposit-address/${encodeURIComponent(apiKey)}`;

  const res = await fetchAuroraWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pdaPayload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.message || data?.error || `Aurora API error (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const depositAddress = data?.depositAddress;
  if (!depositAddress) {
    throw new Error('No deposit address returned by deposit service.');
  }

  const result = {
    success: true,
    depositAddress,
    depositChain,
    destinationChain: 'sol',
    destinationAsset,
    recipient,
    memo: data?.memo || null,
    alreadyExists: Boolean(data?.alreadyExists),
  };

  try {
    localStorage.setItem(cacheKey, JSON.stringify(result));
  } catch {}

  return result;
}

/**
 * Checks the status of deposits sent to an Aurora Persistent Deposit Address.
 * Returns a list of incoming / completed / failed deposit intents.
 */
export async function getAuroraDepositStatus({
  depositAddress,
  apiKey = config.aurora?.apiKey,
  apiUrl = config.aurora?.apiUrl || 'https://intents-api.aurora.dev',
}) {
  if (!depositAddress || !apiKey) return { success: false, deposits: [] };

  // Aurora only accepts one of: received | success | failed (there is no "all"),
  // so query each state and merge the results.
  const types = ['received', 'success', 'failed'];

  try {
    const results = await Promise.all(
      types.map(async (type) => {
        const url = `${apiUrl}/api/persistent-deposit-status/${encodeURIComponent(apiKey)}?address=${encodeURIComponent(
          depositAddress
        )}&type=${type}`;
        const res = await fetchAuroraWithRetry(url, {}, 2);
        if (!res.ok) return { ok: false, type, items: [] };
        const data = await res.json().catch(() => ({}));
        return { ok: true, type, items: Array.isArray(data?.deposits) ? data.deposits : [] };
      })
    );

    if (results.every((r) => !r.ok)) return { success: false, deposits: [] };

    // Normalize deposit objects
    const deposits = results.flatMap(({ type, items }) =>
      items.map((item) => ({
        txHash: item?.txHash || item?.transactionHash || item?.hash || null,
        amount: item?.amount || item?.depositAmount || null,
        asset: item?.asset || item?.depositAsset || 'USDT',
        status: String(item?.status || item?.swapStatus || type).toLowerCase(),
        timestamp: item?.timestamp || item?.createdAt || Date.now(),
        destinationTxHash: item?.destinationTxHash || item?.targetTxHash || null,
      }))
    );

    return {
      success: true,
      deposits,
    };
  } catch (err) {
    console.warn('[AuroraIntents] Error fetching deposit status:', err?.message || err);
    return { success: false, deposits: [] };
  }
}
