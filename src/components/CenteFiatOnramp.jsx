import React, { useState, useEffect, useRef } from 'react';
import * as PrivyAuth from '@privy-io/react-auth';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Mail,
  LogOut,
  RefreshCw,
  Copy,
  CreditCard,
  Zap,
  TrendingUp,
  Loader2,
  BadgeCheck,
} from 'lucide-react';
import { config, theme, paymentMethods } from '../config';
import { getSolanaWalletAddress, getEvmWalletAddress } from '../lib/wallet-utils';
import { safeRedirectUrl, DEFAULT_REDIRECT } from '../lib/safe-redirect';
import { AuroraDeposit } from './AuroraDeposit';
import { HalalStockTrading } from './HalalStockTrading';

export { getSolanaWalletAddress };

const { usePrivy, useFundWallet, useLoginWithEmail, useWallets } = PrivyAuth;
const useAddFunds = PrivyAuth.useAddFunds || (() => ({ addFunds: undefined }));

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

export const isValidTxRef = (ref) => {
  if (!ref || typeof ref !== 'string') return false;
  const s = ref.trim().toLowerCase();
  const placeholders = [
    'confirmed', 'pending confirmation', 'pending', 'submitted', 'success',
    'completed', 'cancelled', 'canceled', 'failed', 'null', 'undefined',
    'true', 'false', '[object object]',
  ];
  if (placeholders.includes(s)) return false;
  return s.length >= 8 && /^[a-zA-Z0-9_\-:]+$/.test(ref.trim());
};

export const isCancelMessage = (err) => {
  if (!err) return false;
  if (typeof err === 'object') {
    if (err.name === 'UserRejectedRequestError' || err.code === 4001) return true;
    if (err.type === 'user_exited' || err.type === 'cancelled' || err.type === 'canceled') return true;
  }
  const msg = String(err?.message || err?.reason || err || '').toLowerCase();
  return (
    msg.includes('user') || msg.includes('cancel') || msg.includes('close') ||
    msg.includes('exit') || msg.includes('reject') || msg.includes('abort') ||
    msg.includes('denied') || msg.includes('dismiss') || msg.includes('abandon') ||
    msg.includes('window closed') || msg.includes('popup closed')
  );
};

const shortAddr = (a, n = 4) => (a ? `${a.slice(0, n)}…${a.slice(-n)}` : '');

// Maps the legacy `initialTab` prop onto the new pages.
const TAB_TO_PAGE = { stocks: 'stocks', fiat: 'deposit', aurora: 'crypto' };

/* ------------------------------------------------------------------ */
/*  Styles - HalalVest Emerald Green Theme                            */
/* ------------------------------------------------------------------ */

const rootVars = {
  '--co-bg': '#09100d',
  '--co-border': 'rgba(16, 185, 129, 0.25)',
  '--co-green': '#10b981',
  '--co-green-dark': '#059669',
  '--co-green-light': '#34d399',
  '--co-text': theme.textPrimary || '#f8fafc',
  '--co-sub': '#94a3b8',
  '--co-mute': '#64748b',
  '--co-font': theme.fontFamily,
  '--co-display': "'Fraunces', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  '--co-line': 'rgba(16, 185, 129, 0.14)',
  '--co-ok': '#10b981',
  '--co-field': 'rgba(6, 12, 10, 0.8)',
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap');

.co-root { width: 100%; max-width: 420px; margin: 0 auto; font-family: var(--co-font); color: var(--co-text); touch-action: manipulation; -webkit-text-size-adjust: 100%; }
.co-root *, .co-root *::before, .co-root *::after { box-sizing: border-box; }
.co-root button, .co-root input { font-family: inherit; }
.co-root button:focus-visible, .co-root a:focus-visible { outline: 2px solid var(--co-green); outline-offset: 2px; }

.co-card { position: relative; background: var(--co-bg); border: 1px solid var(--co-border); border-radius: 20px; padding: 22px; box-shadow: 0 28px 48px -32px rgba(0, 0, 0, 0.8); }

/* header */
.co-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; min-height: 34px; }
.co-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.co-mark { width: 32px; height: 32px; flex-shrink: 0; display: grid; place-items: center; border-radius: 10px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: var(--co-green-light); font-weight: 800; font-size: 12px; }
.co-brand-name { font-family: var(--co-display); font-size: 19px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.1; color: #ffffff; }
.co-brand-sub { font-size: 11px; color: var(--co-mute); margin-top: 2px; }
.co-head-end { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.co-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px; border-radius: 999px; border: 1px solid var(--co-line); background: transparent; color: var(--co-sub); font-size: 12px; font-weight: 600; }
.co-chip-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; letter-spacing: 0.01em; }
.co-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--co-ok); flex-shrink: 0; }
.co-icon-btn { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--co-line); background: transparent; color: var(--co-sub); cursor: pointer; transition: color 0.15s, border-color 0.15s; }
.co-icon-btn:hover { color: var(--co-text); border-color: rgba(16, 185, 129, 0.35); }

/* home navigation */
.co-nav { border-top: 1px solid var(--co-line); }
.co-nav-item { display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 0; border: none; border-bottom: 1px solid var(--co-line); background: none; color: inherit; text-align: left; cursor: pointer; }
.co-nav-icon { width: 42px; height: 42px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.28); color: var(--co-green); }
.co-nav-icon-stocks { background: rgba(16, 185, 129, 0.18); border-color: rgba(16, 185, 129, 0.4); color: var(--co-green-light); }
.co-nav-body { flex: 1; min-width: 0; }
.co-nav-title { display: block; font-size: 15px; font-weight: 700; color: #ffffff; }
.co-nav-sub { display: block; margin-top: 2px; font-size: 12px; color: var(--co-mute); line-height: 1.4; }
.co-nav-chev { color: var(--co-mute); flex-shrink: 0; transition: transform 0.15s, color 0.15s; }
.co-nav-item:hover .co-nav-chev { color: var(--co-green-light); transform: translateX(2px); }

/* amount */
.co-label { display: block; margin-bottom: 6px; font-size: 13px; color: var(--co-sub); }
.co-amount { display: flex; align-items: baseline; gap: 6px; padding: 2px 0 12px; border-bottom: 1px solid var(--co-line); transition: border-color 0.15s, box-shadow 0.15s; }
.co-amount:focus-within { border-bottom-color: var(--co-green); box-shadow: 0 1px 0 var(--co-green); }
.co-amount-sign { font-family: var(--co-display); font-size: 34px; color: var(--co-mute); line-height: 1; }
.co-amount-input { flex: 1; min-width: 0; padding: 0; border: none; outline: none; background: transparent; color: var(--co-text); font-family: var(--co-display); font-size: 54px; font-weight: 500; letter-spacing: -0.02em; line-height: 1.1; font-variant-numeric: tabular-nums; }
.co-amount-input::placeholder { color: rgba(148, 163, 184, 0.3); }
.co-amount-unit { font-size: 13px; font-weight: 700; color: var(--co-green-light); }

.co-presets { display: flex; gap: 8px; margin-top: 14px; }
.co-preset { flex: 1; padding: 8px 0; border-radius: 999px; border: 1px solid var(--co-line); background: transparent; color: var(--co-sub); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.co-preset:hover { border-color: rgba(16, 185, 129, 0.4); color: var(--co-text); }
.co-preset[aria-pressed="true"] { border-color: var(--co-green); color: var(--co-green-light); background: rgba(16, 185, 129, 0.14); }

.co-summary { margin: 20px 0 24px; display: grid; gap: 9px; font-size: 13px; color: var(--co-sub); }
.co-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.co-row-value { color: var(--co-text); font-weight: 600; text-align: right; }

/* payment methods */
.co-methods { margin: 0 0 22px; border-top: 1px solid var(--co-line); }
.co-method { display: flex; align-items: center; gap: 12px; width: 100%; padding: 13px 0; border: none; border-bottom: 1px solid var(--co-line); background: none; color: inherit; text-align: left; cursor: pointer; }
.co-method-icon { width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center; border-radius: 10px; background: rgba(16, 185, 129, 0.08); color: var(--co-sub); transition: all 0.15s; }
.co-method[aria-checked="true"] .co-method-icon { background: rgba(16, 185, 129, 0.18); color: var(--co-green-light); }
.co-method-body { flex: 1; min-width: 0; }
.co-method-name { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 14px; font-weight: 600; color: #ffffff; }
.co-method-tag { padding: 1px 8px; border-radius: 999px; border: 1px solid var(--co-line); font-size: 11px; font-weight: 600; color: var(--co-sub); }
.co-method[aria-checked="true"] .co-method-tag { border-color: rgba(16, 185, 129, 0.4); color: var(--co-green-light); }
.co-method-sub { margin: 2px 0 0; font-size: 12px; color: var(--co-mute); line-height: 1.4; }
.co-radio { width: 18px; height: 18px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; border: 1.5px solid rgba(148, 163, 184, 0.4); color: #09100d; transition: all 0.15s; }
.co-method[aria-checked="true"] .co-radio { background: var(--co-green); border-color: var(--co-green); }

.co-order { margin: 0 0 20px; padding: 14px 0; border-top: 1px solid var(--co-line); border-bottom: 1px solid var(--co-line); }
.co-order-amount { font-family: var(--co-display); font-size: 32px; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.1; color: #ffffff; }
.co-order-amount small { margin-left: 6px; font-family: var(--co-font); font-size: 14px; font-weight: 700; color: var(--co-green-light); letter-spacing: 0; }
.co-order-sub { margin-top: 4px; font-size: 12px; color: var(--co-mute); }

/* buttons */
.co-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 15px 18px; border-radius: 12px; border: none; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; font-size: 15px; font-weight: 700; cursor: pointer; transition: filter 0.15s; box-shadow: 0 4px 14px -2px rgba(16, 185, 129, 0.4); }
.co-btn:hover:not(:disabled) { filter: brightness(1.1); }
.co-btn:disabled { background: rgba(148, 163, 184, 0.14); color: rgba(148, 163, 184, 0.7); cursor: not-allowed; box-shadow: none; }
.co-btn-ghost { width: 100%; display: flex; align-items: center; justify-content: center; padding: 14px 18px; border-radius: 12px; border: 1px solid var(--co-line); background: transparent; color: var(--co-text); font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; transition: border-color 0.15s; }
.co-btn-ghost:hover { border-color: rgba(16, 185, 129, 0.4); }
.co-back { display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 6px 0; border: none; background: none; color: var(--co-sub); font-size: 13px; font-weight: 600; cursor: pointer; }
.co-back:hover { color: var(--co-green-light); }

.co-error { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 16px; padding: 11px 13px; border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.28); background: rgba(245, 158, 11, 0.08); color: #fcd34d; font-size: 13px; line-height: 1.45; }
.co-error svg { flex-shrink: 0; margin-top: 1px; }

/* titles + auth */
.co-title { margin: 0 0 8px; font-family: var(--co-display); font-size: 27px; font-weight: 500; letter-spacing: -0.02em; line-height: 1.15; color: #ffffff; }
.co-lede { margin: 0 0 24px; font-size: 14px; line-height: 1.55; color: var(--co-sub); }
.co-input-label { display: block; margin-bottom: 8px; font-size: 13px; color: var(--co-sub); }
.co-input { width: 100%; padding: 14px; margin-bottom: 18px; border-radius: 12px; border: 1px solid var(--co-line); background: var(--co-field); color: var(--co-text); font-size: 16px; outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
.co-input:focus { border-color: var(--co-green); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2); }
.co-otp { position: relative; display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 18px; }
.co-otp-cell { height: 58px; display: grid; place-items: center; border-radius: 12px; border: 1px solid var(--co-line); background: var(--co-field); font-family: var(--co-display); font-size: 27px; font-weight: 500; font-variant-numeric: tabular-nums; transition: border-color 0.15s, box-shadow 0.15s; color: #ffffff; }
.co-otp-cell[data-active="true"] { border-color: var(--co-green); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2); }
.co-otp-input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: none; background: transparent; font-size: 16px; cursor: text; }
.co-resend { display: block; margin: 14px auto 0; padding: 6px; border: none; background: none; color: var(--co-green); font-size: 13px; font-weight: 600; cursor: pointer; }
.co-resend:disabled { color: var(--co-mute); cursor: not-allowed; }

/* receipt */
.co-check { width: 56px; height: 56px; display: grid; place-items: center; margin-bottom: 18px; border-radius: 50%; border: 1px solid rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.15); color: var(--co-green-light); animation: co-pop 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.25) both; }
.co-receipt-amount { margin: 14px 0 6px; font-family: var(--co-display); font-size: 42px; font-weight: 500; letter-spacing: -0.02em; line-height: 1.05; font-variant-numeric: tabular-nums; color: #ffffff; }
.co-receipt-amount small { font-size: 16px; font-weight: 600; color: var(--co-green-light); letter-spacing: 0; margin-left: 6px; font-family: var(--co-font); }
.co-dl { display: grid; gap: 10px; margin: 22px 0; padding: 16px 0; border-top: 1px dashed rgba(16, 185, 129, 0.25); border-bottom: 1px dashed rgba(16, 185, 129, 0.25); font-size: 13px; color: var(--co-sub); }
.co-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 500; }
.co-ref { word-break: break-all; color: var(--co-green-light); }
.co-redirect { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 13px; color: var(--co-sub); }

.co-spin { animation: co-spin 1s linear infinite; }
@keyframes co-spin { to { transform: rotate(360deg); } }
@keyframes co-pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }

@media (max-width: 380px) {
  .co-card { padding: 18px 16px; }
  .co-amount-input { font-size: 46px; }
  .co-otp-cell { height: 52px; }
}
@media (prefers-reduced-motion: reduce) {
  .co-check { animation: none; }
  .co-nav-chev { transition: none; }
}
`;

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function Spinner({ size = 16 }) {
  return <Loader2 size={size} className="co-spin" aria-hidden="true" />;
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="co-error">
      <CircleAlert size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function BackButton({ onClick, label = 'Back' }) {
  return (
    <button type="button" className="co-back" onClick={onClick}>
      <ArrowLeft size={14} aria-hidden="true" /> {label}
    </button>
  );
}

function Line({ label, children }) {
  return (
    <div className="co-row">
      <span>{label}</span>
      <span className="co-row-value">{children}</span>
    </div>
  );
}

function Brand() {
  return (
    <div className="co-brand">
      <div className="co-mark" aria-hidden="true">HV</div>
      <div>
        <div className="co-brand-name">HalalVest</div>
        <div className="co-brand-sub">Shariah stock trading & wealth</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function CenteFiatOnramp({
  defaultAmount,
  defaultToken = 'USDC',
  appId,
  initialEmail,
  redirectUrl = DEFAULT_REDIRECT,
  allowedRedirectHosts,
  network = 'Solana',
  auroraApiKey = config.aurora?.apiKey,
  brand = 'halalvest',
  initialTab,
  minAmount = config.minAmount ?? 1,
  maxAmount = config.maxAmount,
  debug = false,
}) {
  const { user, authenticated, logout } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { addFunds } = useAddFunds();
  const { fundWallet } = useFundWallet();
  const { sendCode, loginWithCode } = useLoginWithEmail();

  const log = (...args) => {
    if (debug) console.log('[HalalVest]', ...args);
  };

  const isSolana = String(network || '').toLowerCase().includes('sol');
  const networkLabel = isSolana ? 'Solana' : String(network);
  const safeRedirect = safeRedirectUrl(redirectUrl, allowedRedirectHosts);

  const [amount, setAmount] = useState(String(defaultAmount || config.defaultAmount || ''));
  const [selectedToken] = useState('USDC');
  const [page, setPage] = useState(TAB_TO_PAGE[initialTab] || 'home');
  const [depositStep, setDepositStep] = useState('amount');
  const [selectedMethod, setSelectedMethod] = useState(paymentMethods[0]?.id || 'stripe');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [view, setView] = useState('form');
  const [email, setEmail] = useState(initialEmail || '');
  const [otpCode, setOtpCode] = useState('');
  const [otpFocused, setOtpFocused] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const currency = 'USD';
  const activeSolWallet = getSolanaWalletAddress(user, [], privyWallets);
  const activeEvmWallet = getEvmWalletAddress(user, privyWallets);
  const destinationAddress = isSolana ? activeSolWallet : activeEvmWallet;
  const solWalletObj =
    privyWallets?.find(
      (w) =>
        w?.chainType === 'solana' ||
        (w?.address && !w.address.startsWith('0x') && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w.address))
    ) || privyWallets?.[0];

  const walletRef = useRef(null);
  walletRef.current = destinationAddress;

  const redirectTimer = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(redirectTimer.current);
    },
    []
  );

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const waitForWallet = async (known, timeoutMs = 10000) => {
    if (known) return known;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (walletRef.current) return walletRef.current;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  };

  const handleAmountChange = (e) => {
    let val = e.target.value.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    if (val.length > 1 && val.startsWith('0') && val[1] !== '.') {
      val = val.replace(/^0+/, '') || '0';
    }
    setAmount(val);
  };

  const executeFunding = async (amountNum, method, tokenChoice, targetAddress) => {
    let succeeded = false;
    try {
      if (!targetAddress) {
        throw new Error(`No ${networkLabel} wallet found. Please sign in to generate or connect your wallet.`);
      }

      const tokenMeta = config.solanaTokens[tokenChoice] || config.solanaTokens.USDC;
      const amountStr = String(amountNum);
      let result = null;
      let cancelled = false;

      const providerHint = ['meld', 'moonpay', 'stripe', 'coinbase'].includes(String(method).toLowerCase())
        ? String(method).toLowerCase()
        : 'stripe';

      log(`Initiating ${amountStr} ${tokenChoice} deposit`);

      if (typeof addFunds === 'function') {
        try {
          result = await addFunds({
            destination: {
              address: targetAddress,
              chain: isSolana ? 'solana:mainnet' : 'eip155:1',
              asset: isSolana ? tokenMeta.mintAddress : config.ethereumUsdcContractAddress,
            },
            fiat: {
              source: {
                assets: [currency.toLowerCase()],
                defaultAsset: currency.toLowerCase(),
              },
              defaultAmount: amountStr,
              preferredProvider: providerHint,
              preferredPaymentMethod: 'CREDIT_DEBIT_CARD',
            },
            amount: amountStr,
          });
        } catch (err) {
          if (isCancelMessage(err)) {
            cancelled = true;
            log('addFunds cancelled by user');
          } else {
            console.warn('[HalalVest] addFunds error:', err?.message || err);
          }
        }
      }

      if (!result && !cancelled && typeof fundWallet === 'function' && typeof addFunds !== 'function') {
        try {
          result = await fundWallet({
            address: targetAddress,
            options: {
              amount: amountStr,
              defaultAmount: amountStr,
              asset: tokenChoice,
              chain: isSolana ? 'solana:mainnet' : 1,
            },
          });
        } catch (err) {
          if (isCancelMessage(err)) {
            cancelled = true;
            log('fundWallet cancelled by user');
          } else {
            console.warn('[HalalVest] fundWallet failed:', err?.message || err);
            throw err;
          }
        }
      }

      const status = String(result?.status || '').toLowerCase().trim();
      const rawTxRef =
        result?.transactionHash ||
        result?.referenceId ||
        result?.hash ||
        result?.id ||
        null;
      const validTx = isValidTxRef(rawTxRef) ? rawTxRef.trim() : null;

      const isExplicitFailOrCancel =
        cancelled ||
        ['cancelled', 'canceled', 'failed', 'rejected', 'exited', 'closed', 'abandoned'].includes(status);

      const isConfirmedSuccess =
        !isExplicitFailOrCancel &&
        Boolean(result) &&
        (
          (status === 'confirmed' || status === 'submitted') ||
          (Boolean(validTx) && (status === 'completed' || status === 'success'))
        );

      if (isConfirmedSuccess) {
        succeeded = true;
        const details = {
          hash: validTx,
          amount: amountNum,
          token: tokenChoice,
          network: networkLabel,
          mint: isSolana ? tokenMeta.mintAddress : null,
          recipient: targetAddress,
          method: 'CARD PAYMENT',
        };
        setIsSuccess(true);
        setPaymentResult(details);
        window.dispatchEvent(new CustomEvent('cente-payment-success', { detail: details }));

        redirectTimer.current = setTimeout(() => {
          window.location.href = safeRedirect;
        }, 2500);
      } else {
        log('Payment cancelled or unconfirmed. Returning cleanly.');
        setIsSuccess(false);
        setPaymentResult(null);
      }
    } catch (err) {
      setIsSuccess(false);
      setPaymentResult(null);
      if (!isCancelMessage(err)) {
        setError(err?.message || 'Payment could not be completed.');
      }
    } finally {
      setIsLoading(false);
      setView('form');
    }
  };

  const validateAmount = () => {
    const n = parseFloat(amount) || 0;
    if (n <= 0) return 'Please enter an amount greater than 0.';
    if (n < minAmount) return `Minimum deposit is ${minAmount} ${selectedToken}.`;
    if (maxAmount && n > maxAmount) return `Maximum deposit is ${maxAmount} ${selectedToken}.`;
    return null;
  };

  const handleContinueToMethod = () => {
    const amountError = validateAmount();
    if (amountError) {
      setError(amountError);
      return;
    }
    setError(null);
    setDepositStep('method');
  };

  const handleStartPayment = async () => {
    setError(null);
    const amountError = validateAmount();
    if (amountError) {
      setError(amountError);
      setDepositStep('amount');
      return;
    }
    const id = appId || config.privyAppId || '';
    if (!id || id.includes('insert-your-privy-app-id')) {
      setError('Payment is not configured. Please contact support.');
      return;
    }
    if (authenticated) {
      setIsLoading(true);
      const target = await waitForWallet(null, 5000);
      if (!target) {
        setError(`Your ${networkLabel} wallet is still being created. Please try again in a moment.`);
        setIsLoading(false);
        return;
      }
      await executeFunding(parseFloat(amount), selectedMethod, selectedToken, target);
      return;
    }
    setView('enter-email');
  };

  const handleSendEmailCode = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await sendCode({ email });
      setCooldown(30);
      setView('enter-code');
    } catch (err) {
      setError(err?.message || 'Failed to send confirmation code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setError(null);
    try {
      await sendCode({ email });
      setCooldown(30);
    } catch (err) {
      setError(err?.message || 'Could not resend code. Please try again.');
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 6) {
      setError('Please enter the 6-digit confirmation code.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const loginRes = await loginWithCode({ code: otpCode });
      const loggedInUser = loginRes?.user || user;
      const fromLogin = isSolana
        ? getSolanaWalletAddress(loggedInUser)
        : getEvmWalletAddress(loggedInUser, []);

      const target = await waitForWallet(fromLogin);
      if (!target) {
        setError(`Signed in, but your ${networkLabel} wallet is still being created.`);
        setIsLoading(false);
        setView('form');
        return;
      }
      await executeFunding(parseFloat(amount) || 0, selectedMethod, selectedToken, target);
    } catch (err) {
      setError(err?.message || 'Invalid or expired confirmation code.');
      setIsLoading(false);
    }
  };

  const amountNum = parseFloat(amount) || 0;
  const buyDisabled = isLoading || amountNum <= 0;

  const navItems = [
    {
      id: 'stocks',
      icon: TrendingUp,
      title: 'Trade Halal Stocks',
      sub: 'Buy and sell 21 Shariah-screened equities',
      stocks: true,
    },
    {
      id: 'deposit',
      icon: CreditCard,
      title: 'Add Funds with Card',
      sub: 'Instant card payment delivered as USDC',
    },
    {
      id: 'crypto',
      icon: Zap,
      title: 'Deposit Crypto',
      sub: 'Send USDT & crypto directly via Aurora Intent',
    },
  ];

  const pageTitles = {
    stocks: 'Halal Stock Trading',
    deposit: depositStep === 'method' ? 'Choose Payment Option' : 'Add USDC Funds',
    crypto: 'Deposit Crypto',
  };

  const walletChip =
    authenticated && destinationAddress ? (
      <>
        <span className="co-chip co-chip-mono" title={destinationAddress}>
          <span className="co-dot" aria-hidden="true" />
          {shortAddr(destinationAddress)}
        </span>
        <button
          type="button"
          className="co-icon-btn"
          onClick={() => logout()}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={14} aria-hidden="true" />
        </button>
      </>
    ) : (
      <span className="co-chip">
        <span className="co-dot" aria-hidden="true" />
        {isSolana ? 'Solana' : networkLabel}
      </span>
    );

  const goTo = (nextPage) => {
    setError(null);
    if (nextPage === 'deposit') setDepositStep('amount');
    setPage(nextPage);
  };

  /* --------------------------- Render --------------------------- */

  return (
    <div className="co-root" style={rootVars}>
      <style>{CSS}</style>

      {isSuccess && paymentResult ? (
        /* ====================== SUCCESS (receipt) ====================== */
        <div className="co-card" role="status">
          <div className="co-check">
            <CircleCheck size={30} strokeWidth={2} aria-hidden="true" />
          </div>
          <h3 className="co-title">Payment Submitted</h3>
          <div className="co-receipt-amount">
            {paymentResult.amount}
            <small>{paymentResult.token}</small>
          </div>
          <p className="co-lede" style={{ marginBottom: 0 }}>
            Delivered to your {paymentResult.network} wallet once the transaction settles.
          </p>

          <div className="co-dl">
            <Line label="Network">{paymentResult.network}</Line>
            <Line label="Payment">{paymentResult.method}</Line>
            {paymentResult.recipient && (
              <Line label="Wallet">
                <span className="co-mono" title={paymentResult.recipient}>
                  {shortAddr(paymentResult.recipient)}
                </span>
              </Line>
            )}
            {paymentResult.hash && isValidTxRef(paymentResult.hash) && (
              <div>
                <div style={{ marginBottom: 4 }}>Transaction Reference</div>
                {paymentResult.network === 'Solana' && paymentResult.hash.length >= 40 ? (
                  <a
                    className="co-mono co-ref"
                    href={`https://solscan.io/tx/${paymentResult.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {paymentResult.hash}
                  </a>
                ) : (
                  <code className="co-mono" style={{ wordBreak: 'break-all' }}>{paymentResult.hash}</code>
                )}
              </div>
            )}
          </div>

          <div className="co-redirect">
            <Spinner size={13} />
            Returning to dashboard...
          </div>
          <a href={safeRedirect} className="co-btn-ghost">
            Return to HalalVest
          </a>
        </div>
      ) : view === 'enter-email' ? (
        /* ====================== EMAIL ====================== */
        <div className="co-card">
          <div className="co-head">
            <BackButton onClick={() => { setView('form'); setError(null); }} />
          </div>
          <h3 className="co-title">Sign in to continue</h3>
          <p className="co-lede">We'll email you a 6-digit code to access your {networkLabel} wallet.</p>

          <form onSubmit={handleSendEmailCode}>
            <label className="co-input-label" htmlFor="co-email">Email address</label>
            <input
              id="co-email"
              className="co-input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
            />
            <ErrorBox message={error} />
            <button type="submit" disabled={isLoading} className="co-btn">
              {isLoading ? (<><Spinner /> Sending code</>) : 'Continue'}
            </button>
          </form>
        </div>
      ) : view === 'enter-code' ? (
        /* ====================== OTP ====================== */
        <div className="co-card">
          <div className="co-head">
            <BackButton
              onClick={() => {
                setView('enter-email');
                setOtpCode('');
                setError(null);
              }}
            />
          </div>
          <h3 className="co-title">Check your inbox</h3>
          <p className="co-lede">
            Enter the 6-digit code sent to <strong style={{ color: 'var(--co-text)' }}>{email}</strong>
          </p>

          <form onSubmit={handleVerifyCode}>
            <div className="co-otp">
              {Array.from({ length: 6 }).map((_, i) => {
                const char = otpCode[i] || '';
                const isActive = otpFocused && (i === otpCode.length || (i === 5 && otpCode.length === 6));
                return (
                  <div key={i} className="co-otp-cell" data-active={isActive}>
                    {char}
                  </div>
                );
              })}
              <input
                className="co-otp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                required
                aria-label="6-digit confirmation code"
                value={otpCode}
                onFocus={() => setOtpFocused(true)}
                onBlur={() => setOtpFocused(false)}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            <ErrorBox message={error} />
            <button type="submit" disabled={isLoading || otpCode.length < 6} className="co-btn">
              {isLoading ? (<><Spinner /> Verifying</>) : (<><BadgeCheck size={16} aria-hidden="true" /> Verify code</>)}
            </button>
            <button type="button" className="co-resend" onClick={handleResendCode} disabled={cooldown > 0}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </form>
        </div>
      ) : page === 'home' ? (
        /* ====================== HOME ====================== */
        <div className="co-card">
          <div className="co-head">
            <Brand />
            <div className="co-head-end">{walletChip}</div>
          </div>

          <div className="co-nav">
            {navItems.map(({ id, icon: Icon, title, sub, stocks }) => (
              <button key={id} type="button" className="co-nav-item" onClick={() => goTo(id)}>
                <span className={`co-nav-icon${stocks ? ' co-nav-icon-stocks' : ''}`}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="co-nav-body">
                  <span className="co-nav-title">{title}</span>
                  <span className="co-nav-sub">{sub}</span>
                </span>
                <ChevronRight size={18} className="co-nav-chev" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ====================== SUB-PAGES ====================== */
        <div className="co-card">
          <div className="co-head">
            <BackButton
              label={page === 'deposit' && depositStep === 'method' ? 'Amount' : 'Home'}
              onClick={() => {
                if (page === 'deposit' && depositStep === 'method') {
                  setError(null);
                  setDepositStep('amount');
                } else {
                  goTo('home');
                }
              }}
            />
            <div className="co-head-end">{walletChip}</div>
          </div>

          <h3 className="co-title">{pageTitles[page]}</h3>

          {page === 'stocks' && (
            <HalalStockTrading
              solanaAddress={activeSolWallet}
              solWallet={solWalletObj}
              authenticated={authenticated}
              onRequireLogin={() => setView('enter-email')}
              onSwitchToDeposit={() => goTo('deposit')}
            />
          )}

          {page === 'crypto' &&
            (authenticated && activeSolWallet ? (
              <AuroraDeposit
                solanaAddress={activeSolWallet}
                apiKey={auroraApiKey}
                onBack={() => goTo('home')}
              />
            ) : (
              <>
                <p className="co-lede">
                  Sign in with your email to get your dedicated deposit address. Crypto you send is converted and delivered directly to your Solana wallet.
                </p>
                <button type="button" className="co-btn" onClick={() => setView('enter-email')}>
                  <Mail size={16} aria-hidden="true" />
                  Sign in with email
                </button>
              </>
            ))}

          {page === 'deposit' && depositStep === 'amount' && (
            <>
              <p className="co-lede">Enter the amount of USDC you want to purchase.</p>

              <label className="co-label" htmlFor="co-deposit-amount">Amount</label>
              <div className="co-amount">
                <span className="co-amount-sign">$</span>
                <input
                  id="co-deposit-amount"
                  className="co-amount-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="20"
                  value={amount}
                  onChange={handleAmountChange}
                />
                <span className="co-amount-unit">{selectedToken}</span>
              </div>

              <div className="co-presets" role="group" aria-label="Quick amount presets">
                {[20, 50, 100, 250].map((preset) => {
                  const active = String(amount) === String(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      className="co-preset"
                      aria-pressed={active}
                      onClick={() => {
                        setAmount(String(preset));
                        setError(null);
                      }}
                    >
                      ${preset}
                    </button>
                  );
                })}
              </div>

              <div className="co-summary">
                <div className="co-row">
                  <span>Network</span>
                  <span className="co-row-value">{isSolana ? 'Solana Mainnet (SPL)' : networkLabel}</span>
                </div>
                <div className="co-row">
                  <span>Settlement</span>
                  <span className="co-row-value">Direct Delivery</span>
                </div>
              </div>

              <ErrorBox message={error} />
              <button
                type="button"
                className="co-btn"
                onClick={handleContinueToMethod}
                disabled={parseFloat(amount || '0') <= 0}
              >
                Continue
              </button>
            </>
          )}

          {page === 'deposit' && depositStep === 'method' && (
            <>
              <div className="co-order">
                <div className="co-order-amount">
                  {amount}
                  <small>{selectedToken}</small>
                </div>
                <div className="co-order-sub">
                  ${amount} USD delivered as USDC to your {isSolana ? 'Solana' : networkLabel} wallet
                </div>
              </div>

              <div className="co-methods" role="radiogroup" aria-label="Payment method">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  const isSelected = selectedMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className="co-method"
                      onClick={() => setSelectedMethod(method.id)}
                    >
                      <span className="co-method-icon">
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <span className="co-method-body">
                        <span className="co-method-name">
                          {method.name}
                          <span className="co-method-tag">{method.tag}</span>
                        </span>
                        <p className="co-method-sub">{method.subtitle}</p>
                      </span>
                      <span className="co-radio" aria-hidden="true">
                        {isSelected && <Check size={11} strokeWidth={3.5} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <ErrorBox message={error} />
              <button type="button" className="co-btn" onClick={handleStartPayment} disabled={buyDisabled}>
                {isLoading ? (<><Spinner /> Processing</>) : (<>Buy {amount || '0'} {selectedToken}</>)}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default CenteFiatOnramp;
