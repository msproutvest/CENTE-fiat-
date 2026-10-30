/**
 * AutoBridgeRunner
 *
 * Runs automatically in the background while the user is logged in.
 * Detects any incoming multi-chain deposits (Base, Ethereum, Polygon, BSC)
 * in the user's embedded EVM wallet and automatically bridges them
 * to the user's Solana wallet address using Mayan Finance.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePrivy, useSendTransaction, useWallets } from '@privy-io/react-auth';
import { toast } from 'sonner';
import {
  scanMultiChainBalances,
  executeBridgeTransaction,
  CHAINS,
} from '../../services/mayanBridge';
import { getSolanaWalletAddress, getEvmWalletAddress } from '../../lib/wallet-utils';
import { isBridgeEnabled } from './AutoBridgeConsent';

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes between attempts per asset
const RETRY_SOON_MS = 30 * 1000;
const USER_REJECTED = /reject|denied|cancel|user rejected/i;

function claimLock(key, ms = COOLDOWN_MS) {
  try {
    const last = Number(window.localStorage.getItem(key) || 0);
    if (Date.now() - last < ms) return false;
    window.localStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

function releaseLockSoon(key) {
  try {
    window.localStorage.setItem(key, String(Date.now() - COOLDOWN_MS + RETRY_SOON_MS));
  } catch {}
}

export function AutoBridgeRunner({ onSweepComplete } = {}) {
  const { ready, authenticated, user: privyUser } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { sendTransaction } = useSendTransaction();

  const busyRef = useRef(false);
  const manualRequestedRef = useRef(false);
  const [triggerCount, setTriggerCount] = useState(0);

  // Listen for manual trigger events from UI or onramp completion
  useEffect(() => {
    const handleTrigger = () => {
      manualRequestedRef.current = true;
      setTriggerCount((c) => c + 1);
    };
    window.addEventListener('cente:trigger-autobridge', handleTrigger);
    return () => window.removeEventListener('cente:trigger-autobridge', handleTrigger);
  }, []);

  const runBridgeSweep = useCallback(async () => {
    if (!ready || !authenticated || !privyUser || busyRef.current) return;
    if (!isBridgeEnabled(privyUser)) return;

    const solAddress = getSolanaWalletAddress(privyUser, [], privyWallets);
    const evmAddress = getEvmWalletAddress(privyUser, privyWallets);

    if (!solAddress || !evmAddress) return;

    const wasManual = manualRequestedRef.current;
    manualRequestedRef.current = false;

    // Find the Privy embedded EVM wallet to sign transactions
    const embeddedEvmWallet = privyWallets.find(
      (w) => w?.address?.toLowerCase() === evmAddress.toLowerCase() && w.walletClientType === 'privy'
    ) || privyWallets.find((w) => w?.address?.toLowerCase() === evmAddress.toLowerCase());

    if (!embeddedEvmWallet) return;

    busyRef.current = true;

    try {
      // 1. Scan user's EVM wallet on-chain across Base, Ethereum, Polygon, BSC
      const candidates = await scanMultiChainBalances(evmAddress);

      if (candidates.length === 0) {
        if (wasManual) {
          toast.info('No multi-chain deposits waiting to bridge right now.', {
            id: 'autobridge-status',
            duration: 3000,
          });
        }
        return;
      }

      // 2. Process each detected deposit sequentially
      for (const candidate of candidates) {
        const lockKey = `mayan_${candidate.address.toLowerCase()}_${candidate.chain}_${candidate.symbol}`;
        if (!claimLock(lockKey)) continue;

        let bridgeSent = false;
        const toastId = `bridge-${candidate.chain}-${candidate.symbol}`;

        try {
          toast.loading(
            `Detected ${candidate.humanAmount} ${candidate.symbol} on ${CHAINS[candidate.chain].name}. Routing to your Solana wallet via Mayan...`,
            { id: toastId }
          );

          const result = await executeBridgeTransaction({
            candidate,
            destinationSolAddress: solAddress,
            privyWallet: embeddedEvmWallet,
            sendTransaction,
          });

          bridgeSent = true;

          toast.success(
            `Auto-bridged ${result.humanAmount} ${candidate.symbol} to ${result.deliverAs} on Solana!`,
            {
              id: toastId,
              description: `Delivered to ${solAddress.slice(0, 4)}...${solAddress.slice(-4)}.`,
              duration: 8000,
              action: {
                label: 'View Tx',
                onClick: () => window.open(result.explorerUrl, '_blank', 'noopener,noreferrer'),
              },
            }
          );

          window.dispatchEvent(
            new CustomEvent('cente:autobridge-completed', {
              detail: {
                txHash: result.txHash,
                symbol: candidate.symbol,
                chain: candidate.chain,
                destination: solAddress,
              },
            })
          );

          if (onSweepComplete) onSweepComplete(result);
        } catch (sweepErr) {
          if (!bridgeSent) releaseLockSoon(lockKey);
          toast.dismiss(toastId);

          const errMsg = sweepErr?.shortMessage || sweepErr?.message || 'Transaction failed';
          if (!USER_REJECTED.test(errMsg)) {
            console.warn('[AutoBridgeRunner] Sweep error:', errMsg);
            toast.error(`Auto-bridge for ${candidate.symbol} on ${CHAINS[candidate.chain].name} failed`, {
              description: errMsg.slice(0, 150),
              duration: 5000,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[AutoBridgeRunner] General scan error:', err);
    } finally {
      busyRef.current = false;
    }
  }, [ready, authenticated, privyUser, privyWallets, sendTransaction, onSweepComplete]);

  // Run on mount, on authentication change, or when triggered
  useEffect(() => {
    runBridgeSweep();
  }, [runBridgeSweep, triggerCount]);

  // Periodic background check every 30 seconds
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      runBridgeSweep();
    }, 30000);
    return () => clearInterval(interval);
  }, [authenticated, runBridgeSweep]);

  return null;
}

export default AutoBridgeRunner;

/**
 * Manually trigger an auto-bridge check and execution
 */
export function triggerAutoBridgeNow() {
  clearBridgeCooldowns();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cente:trigger-autobridge'));
  }
}

/**
 * Clears local cooldown locks so scans retry immediately
 */
export function clearBridgeCooldowns() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('mayan_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {}
}
