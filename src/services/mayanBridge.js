/**
 * Mayan Finance Cross-Chain Auto-Bridge Engine
 *
 * Automatically detects deposits across EVM chains (Base, Ethereum, Polygon, BSC)
 * and bridges them directly to the user's Solana wallet via Mayan Protocol (SWIFT / MCTP).
 *
 * - USDC on any chain arrives as SPL USDC on Solana
 * - USDT on any chain arrives as SPL USDT on Solana
 * - Native coins (ETH, BNB, POL) arrive as Native SOL on Solana
 * - Gas is sponsored via Privy embedded wallets
 */

import { createPublicClient, http, parseAbi, formatUnits } from 'viem';
import { base, mainnet, polygon, bsc } from 'viem/chains';
import { fetchQuote, getSwapFromEvmTxPayload, addresses } from '@mayanfinance/swap-sdk';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const SOLANA_MINT = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  SOL: ZERO_ADDRESS,
};

export const BRIDGE_MIN_USD = {
  base: 0.5,
  polygon: 0.5,
  bsc: 0.5,
  ethereum: 1.0,
};

export const CHAINS = {
  base: { id: 8453, name: 'Base', viem: base, explorer: 'https://basescan.org/tx/' },
  ethereum: { id: 1, name: 'Ethereum', viem: mainnet, explorer: 'https://etherscan.io/tx/' },
  polygon: { id: 137, name: 'Polygon', viem: polygon, explorer: 'https://polygonscan.com/tx/' },
  bsc: { id: 56, name: 'BNB Chain', viem: bsc, explorer: 'https://bscscan.com/tx/' },
};

export const TOKEN = {
  base: {
    ETH: { address: ZERO_ADDRESS, decimals: 18, name: 'Ethereum' },
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, name: 'USD Coin' },
    USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, name: 'Tether USD' },
  },
  ethereum: {
    ETH: { address: ZERO_ADDRESS, decimals: 18, name: 'Ethereum' },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, name: 'USD Coin' },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, name: 'Tether USD' },
  },
  polygon: {
    POL: { address: ZERO_ADDRESS, decimals: 18, name: 'Polygon POL' },
    USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, name: 'USD Coin' },
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, name: 'Tether USD' },
    ETH: { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, name: 'Bridged ETH' },
  },
  bsc: {
    BNB: { address: ZERO_ADDRESS, decimals: 18, name: 'BNB' },
    USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, name: 'USD Coin' },
    USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, name: 'Tether USD' },
  },
};

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const hashOf = (tx) =>
  String(tx?.hash || tx?.transactionHash || tx?.data?.hash || (typeof tx === 'string' ? tx : ''));

const clients = {};
export function getViemClient(chainKey) {
  if (!clients[chainKey]) {
    clients[chainKey] = createPublicClient({
      chain: CHAINS[chainKey].viem,
      transport: http(),
    });
  }
  return clients[chainKey];
}

/**
 * Approximate price fallbacks for minimum threshold check
 */
export function estimateUsdValue(symbol, amount) {
  if (symbol === 'USDC' || symbol === 'USDT') return amount;
  if (symbol === 'ETH') return amount * 2500;
  if (symbol === 'BNB') return amount * 580;
  if (symbol === 'POL') return amount * 0.45;
  return amount;
}

/**
 * Scans an EVM address on-chain across Base, Ethereum, Polygon, and BSC
 * Returns list of detected token balances ready for auto-bridging
 */
export async function scanMultiChainBalances(evmAddress) {
  if (!evmAddress || !/^0x[a-fA-F0-9]{40}$/i.test(evmAddress)) {
    return [];
  }

  const results = [];
  const chainKeys = Object.keys(CHAINS);

  await Promise.allSettled(
    chainKeys.map(async (chainKey) => {
      try {
        const client = getViemClient(chainKey);
        const tokens = TOKEN[chainKey];

        const queries = Object.entries(tokens).map(async ([symbol, meta]) => {
          try {
            let rawUnits = 0n;
            if (meta.address === ZERO_ADDRESS) {
              rawUnits = await client.getBalance({ address: evmAddress });
            } else {
              rawUnits = await client.readContract({
                address: meta.address,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [evmAddress],
              });
            }

            if (rawUnits > 0n) {
              const humanAmount = parseFloat(formatUnits(rawUnits, meta.decimals));
              const usdVal = estimateUsdValue(symbol, humanAmount);

              if (usdVal >= (BRIDGE_MIN_USD[chainKey] ?? 0.5)) {
                results.push({
                  address: evmAddress,
                  chain: chainKey,
                  chainId: CHAINS[chainKey].id,
                  chainName: CHAINS[chainKey].name,
                  symbol,
                  tokenAddress: meta.address,
                  decimals: meta.decimals,
                  units: rawUnits,
                  humanAmount,
                  usdVal,
                });
              }
            }
          } catch (tokenErr) {
            // Silently continue for unqueried tokens
          }
        });

        await Promise.allSettled(queries);
      } catch (chainErr) {
        // Silently continue for transient chain RPC errors
      }
    })
  );

  return results;
}

/**
 * Fetches a quote from Mayan Finance for bridging to the user's Solana wallet
 */
export async function getMayanQuote({
  amountInUnits,
  fromToken,
  toToken,
  fromChain,
  destinationAddress,
}) {
  try {
    const quotes = await fetchQuote({
      amountIn64: amountInUnits.toString(),
      fromToken,
      toToken,
      fromChain,
      toChain: 'solana',
      slippageBps: 'auto',
      destinationAddress,
      gasless: false,
    });

    if (quotes && quotes.length > 0) {
      // Prioritize Swift / MCTP quotes
      return (
        quotes.find((q) => q.type === 'SWIFT' || q.type === 'FAST_MCTP' || q.type === 'MCTP') ||
        quotes[0]
      );
    }
  } catch (err) {
    console.warn('[MayanBridge] Quote error:', err?.message || err);
  }
  return null;
}

/**
 * Executes the auto-bridge transaction using Privy's sponsored sendTransaction
 */
export async function executeBridgeTransaction({
  candidate,
  destinationSolAddress,
  privyWallet,
  sendTransaction,
}) {
  const { chain, symbol, tokenAddress, decimals, units, address: account } = candidate;
  const isNative = tokenAddress === ZERO_ADDRESS;
  const chainId = CHAINS[chain].id;
  const client = getViemClient(chain);

  // Switch wallet to candidate's chain if needed
  if (privyWallet?.switchChain) {
    try {
      await privyWallet.switchChain(chainId);
    } catch {
      throw new Error(`Please confirm network switch to ${CHAINS[chain].name}.`);
    }
  }

  // Determine destination asset on Solana
  const deliverAs = isNative ? 'SOL' : symbol; // USDC -> USDC, USDT -> USDT, ETH/BNB/POL -> SOL
  const toToken = deliverAs === 'SOL' ? ZERO_ADDRESS : (SOLANA_MINT[deliverAs] || ZERO_ADDRESS);

  // Live on-chain balance confirmation
  let liveUnits = units;
  try {
    liveUnits = isNative
      ? await client.getBalance({ address: account })
      : await client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [account],
        });
  } catch (e) {
    console.warn('[MayanBridge] Using cached balance units:', e);
  }

  // Native assets leave 0.5% headroom for safety
  const finalUnits = isNative ? liveUnits - liveUnits / 200n : liveUnits;
  if (finalUnits <= 0n) {
    throw new Error('No sufficient balance remaining to bridge.');
  }

  const quote = await getMayanQuote({
    amountInUnits: finalUnits,
    fromToken: tokenAddress,
    toToken,
    fromChain: chain,
    destinationAddress: destinationSolAddress,
  });

  if (!quote) {
    throw new Error(`No Mayan route available currently for ${symbol} on ${CHAINS[chain].name}.`);
  }

  const forwarder = addresses.MAYAN_FORWARDER_CONTRACT;

  // Helper for sponsored transactions via Privy
  const send = async (txData) => {
    return await sendTransaction(
      {
        to: txData.to,
        data: txData.data,
        chainId,
        ...(txData.value && txData.value > 0n ? { value: txData.value } : {}),
      },
      {
        address: account,
        uiOptions: { showWalletUIs: false },
        sponsor: true,
      }
    );
  };

  // ERC-20 approval check
  if (!isNative) {
    const allowance = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account, forwarder],
    });

    if (allowance < finalUnits) {
      // Mainnet USDT requires setting to 0 first if allowance > 0
      if (chain === 'ethereum' && symbol === 'USDT' && allowance > 0n) {
        const zeroData = `0x095ea7b3${forwarder
          .toLowerCase()
          .replace(/^0x/, '')
          .padStart(64, '0')}${'0'.padStart(64, '0')}`;
        const zTx = await send({ to: tokenAddress, data: zeroData });
        const zh = hashOf(zTx);
        if (HASH_REGEX.test(zh)) {
          await client.waitForTransactionReceipt({ hash: zh, timeout: 60_000 });
        }
      }

      const approveData = `0x095ea7b3${forwarder
        .toLowerCase()
        .replace(/^0x/, '')
        .padStart(64, '0')}${finalUnits.toString(16).padStart(64, '0')}`;
      const appTx = await send({ to: tokenAddress, data: approveData });
      const appHash = hashOf(appTx);
      if (!HASH_REGEX.test(appHash)) {
        throw new Error('Token approval did not return a transaction hash.');
      }
      await client.waitForTransactionReceipt({ hash: appHash, timeout: 90_000 });
    }
  }

  // Build the swap payload from Mayan SDK
  const payload = await getSwapFromEvmTxPayload(
    quote,
    account,
    destinationSolAddress,
    null,
    account,
    chainId,
    null,
    null
  );

  if (!payload?.to || !payload?.data) {
    throw new Error('Could not construct Mayan cross-chain transaction.');
  }

  const valueWei = BigInt(payload.value ?? 0);

  // Dry run simulation to ensure it won't revert
  try {
    await client.call({
      account,
      to: payload.to,
      data: payload.data,
      value: valueWei,
    });
  } catch (simErr) {
    console.error('[MayanBridge] Dry run failed:', simErr);
    throw new Error(`Simulation failed: ${simErr?.shortMessage || simErr?.message || 'Reverted'}`);
  }

  // Execute the bridge transaction
  const tx = await send({
    to: payload.to,
    data: payload.data,
    value: valueWei,
  });

  const txHash = hashOf(tx);
  if (!HASH_REGEX.test(txHash)) {
    throw new Error('Bridge execution did not return a valid transaction hash.');
  }

  return {
    txHash,
    quote,
    deliverAs,
    humanAmount: parseFloat(formatUnits(finalUnits, decimals)),
    explorerUrl: `${CHAINS[chain].explorer}${txHash}`,
  };
}
