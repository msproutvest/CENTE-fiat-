import React, { useState, useEffect, useRef } from 'react';
import * as PrivyAuth from '@privy-io/react-auth';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  Mail,
  LogOut,
  RefreshCw,
  Sparkles,
  Copy,
} from 'lucide-react';
import { config, theme, paymentMethods } from '../config';
import { getSolanaWalletAddress, getEvmWalletAddress } from '../lib/wallet-utils';
import { safeRedirectUrl, DEFAULT_REDIRECT } from '../lib/safe-redirect';
import { triggerAutoBridgeNow } from './wallet/AutoBridgeRunner';

export { getSolanaWalletAddress };

const { usePrivy, useFundWallet, useLoginWithEmail, useWallets } = PrivyAuth;
// Older SDK versions don't ship useAddFunds; an undefined hook would crash at render.
const useAddFunds = PrivyAuth.useAddFunds || (() => ({ addFunds: undefined }));

/**
 * Validates that a transaction or provider reference is genuine.
 * Rejects placeholder status strings (e.g. "Confirmed", "Pending confirmation").
 */
export const isValidTxRef = (ref) => {
  if (!ref || typeof ref !== 'string') return false;
  const s = ref.trim().toLowerCase();
  const placeholders = [
    'confirmed',
    'pending confirmation',
    'pending',
    'submitted',
    'success',
    'completed',
    'cancelled',
    'canceled',
    'failed',
    'null',
    'undefined',
    'true',
    'false',
    '[object object]',
  ];
  if (placeholders.includes(s)) return false;
  // Must look like an on-chain hash or provider reference id (at least 8 chars, alphanumeric/symbols)
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
    msg.includes('user') ||
    msg.includes('cancel') ||
    msg.includes('close') ||
    msg.includes('exit') ||
    msg.includes('reject') ||
    msg.includes('abort') ||
    msg.includes('denied') ||
    msg.includes('dismiss') ||
    msg.includes('abandon') ||
    msg.includes('window closed') ||
    msg.includes('popup closed')
  );
};

const cardStyle = {
  backgroundColor: theme.cardBg,
  border: `1px solid ${theme.goldBorder}`,
  borderRadius: '24px',
  padding: '30px 26px',
  boxShadow: '0 10px 40px -10px rgba(212, 175, 55, 0.12)',
  boxSizing: 'border-box',
};

const goldGradient = `linear-gradient(135deg, ${theme.goldPrimary} 0%, ${theme.goldSecondary} 50%, ${theme.goldAccent} 100%)`;

function goldButtonStyle(disabled) {
  return {
    width: '100%',
    padding: '14px 20px',
    background: goldGradient,
    color: '#0b0e14',
    fontWeight: 800,
    fontSize: '14px',
    borderRadius: '16px',
    border: 'none',
    boxShadow: '0 8px 24px -4px rgba(184, 134, 11, 0.35)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontFamily: theme.fontFamily,
    touchAction: 'manipulation',
  };
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 mb-4"
      style={{
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: '12px',
        padding: '10px 12px',
        color: '#fcd34d',
        fontSize: '12px',
      }}
    >
      <CircleAlert size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
      <span>{message}</span>
    </div>
  );
}

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 cursor-pointer"
      style={{
        background: 'transparent',
        border: 'none',
        color: theme.textSecondary,
        fontSize: '12px',
        marginBottom: '18px',
        padding: 0,
        fontFamily: theme.fontFamily,
      }}
    >
      <ArrowLeft size={14} /> Back
    </button>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between" style={{ color: theme.textSecondary }}>
      <span>{label}</span>
      {children}
    </div>
  );
}

export function CenteFiatOnramp({
  defaultAmount,
  defaultToken = 'USDC',
  appId,
  initialEmail,
  redirectUrl = DEFAULT_REDIRECT,
  allowedRedirectHosts,
  network = 'Solana',
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
    if (debug) console.log('[Cente]', ...args);
  };

  const isSolana = String(network || '').toLowerCase().includes('sol');
  const networkLabel = isSolana ? 'Solana' : String(network);
  const safeRedirect = safeRedirectUrl(redirectUrl, allowedRedirectHosts);

  const [amount, setAmount] = useState(String(defaultAmount || config.defaultAmount || ''));
  const [selectedToken, setSelectedToken] = useState(defaultToken || 'USDC');
  const [selectedMethod, setSelectedMethod] = useState('meld');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [view, setView] = useState('form'); // 'form' | 'enter-email' | 'enter-code'
  const [email, setEmail] = useState(initialEmail || '');
  const [otpCode, setOtpCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [isCheckingBridge, setIsCheckingBridge] = useState(false);
  const [copiedEvm, setCopiedEvm] = useState(false);

  const currency = 'USD';
  const activeSolWallet = getSolanaWalletAddress(user, [], privyWallets);
  const activeEvmWallet = getEvmWalletAddress(user, privyWallets);
  const destinationAddress = isSolana ? activeSolWallet : activeEvmWallet;

  // Always-current wallet address, so async flows can wait for wallet creation.
  const walletRef = useRef(null);
  walletRef.current = destinationAddress;

  const redirectTimer = useRef(null);
  const bridgeTimer = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(redirectTimer.current);
      clearTimeout(bridgeTimer.current);
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

  const handleTriggerBridge = () => {
    setIsCheckingBridge(true);
    triggerAutoBridgeNow();
    clearTimeout(bridgeTimer.current);
    bridgeTimer.current = setTimeout(() => setIsCheckingBridge(false), 2500);
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
        : 'meld';

      log(`Initiating ${amountStr} ${tokenChoice} deposit via ${providerHint}`);

      // 1. Primary: addFunds
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
            log('addFunds cancelled or closed by user');
          } else {
            console.warn('[Cente] addFunds error:', err?.message || err);
          }
        }
      }

      // 2. Fallback: only if addFunds is NOT a function and user did NOT cancel
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
            log('fundWallet cancelled or closed by user');
          } else {
            console.warn('[Cente] fundWallet failed:', err?.message || err);
            throw err;
          }
        }
      }

      log('Funding result:', result);

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

      // Strict validation:
      // 1. Must NOT be explicitly cancelled, closed, or failed.
      // 2. Must have a non-null result.
      // 3. For addFunds: status is 'confirmed' or 'submitted'.
      // 4. For fundWallet (or any flow without explicit provider confirmation):
      //    status 'completed' is ONLY accepted if an actual validTx is present,
      //    preventing false success screens when closing/cancelling.
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
          hash: validTx, // Strictly null if no genuine hash or provider ref exists. NEVER a fake string!
          amount: amountNum,
          token: tokenChoice,
          network: networkLabel,
          mint: isSolana ? tokenMeta.mintAddress : null,
          recipient: targetAddress,
          method: String(method).toUpperCase(),
        };
        setIsSuccess(true);
        setPaymentResult(details);
        window.dispatchEvent(new CustomEvent('cente-payment-success', { detail: details }));

        redirectTimer.current = setTimeout(() => {
          window.location.href = safeRedirect;
        }, 2500);
      } else {
        log('Payment cancelled or unconfirmed by provider. Returning cleanly to form.');
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
      if (succeeded) triggerAutoBridgeNow();
    }
  };

  const validateAmount = () => {
    const n = parseFloat(amount) || 0;
    if (n <= 0) return 'Please enter an amount greater than 0.';
    if (n < minAmount) return `Minimum deposit is ${minAmount} ${selectedToken}.`;
    if (maxAmount && n > maxAmount) return `Maximum deposit is ${maxAmount} ${selectedToken}.`;
    return null;
  };

  const handleStartPayment = async () => {
    setError(null);

    const amountError = validateAmount();
    if (amountError) {
      setError(amountError);
      return;
    }

    const id = appId || config.privyAppId || '';
    if (!id || id.includes('insert-your-privy-app-id')) {
      setError('Payment is not configured (missing Privy app ID). Please contact support.');
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
      setError(err?.message || 'Could not resend the code. Please try again.');
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

      // Embedded wallet creation is async - wait for it instead of failing immediately.
      const target = await waitForWallet(fromLogin);
      if (!target) {
        setError(`Signed in, but your ${networkLabel} wallet is still being created. Tap Buy again in a moment.`);
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

  return (
    <div
      className="w-full max-w-md mx-auto"
      style={{
        fontFamily: theme.fontFamily,
        boxSizing: 'border-box',
        touchAction: 'manipulation',
        WebkitTextSizeAdjust: '100%',
      }}
    >
      {isSuccess && paymentResult ? (
        /* 1. SUCCESS VIEW */
        <div className="text-center" style={{ ...cardStyle, padding: '32px 28px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: 'rgba(184, 134, 11, 0.15)',
              border: `1px solid ${theme.goldAccent}`,
              color: theme.goldAccent,
            }}
          >
            <CircleCheck size={36} />
          </div>
          <h3 style={{ color: theme.textPrimary, fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }}>
            Payment Submitted
          </h3>
          <p style={{ color: theme.textSecondary, fontSize: '13px', margin: '0 0 24px' }}>
            Your {paymentResult.amount} {paymentResult.token} is on its way to your {paymentResult.network} wallet.
            Funds arrive once the payment provider settles.
          </p>

          <div
            className="space-y-2"
            style={{
              backgroundColor: theme.inputBg,
              borderRadius: '16px',
              border: '1px solid #1e293b',
              padding: '16px 20px',
              textAlign: 'left',
              fontSize: '12px',
              lineHeight: '22px',
              marginBottom: '24px',
            }}
          >
            <Row label="Amount:">
              <strong style={{ color: theme.textPrimary, fontSize: '14px' }}>
                {paymentResult.amount} {paymentResult.token}
              </strong>
            </Row>
            <Row label="Network:">
              <span style={{ color: theme.goldAccent, fontWeight: 600 }}>{paymentResult.network}</span>
            </Row>
            <Row label="Method:">
              <span style={{ color: '#ffffff', fontWeight: 600 }}>{paymentResult.method}</span>
            </Row>
            {paymentResult.recipient && (
              <Row label="Recipient Wallet:">
                <span className="font-mono text-[11px]" style={{ color: theme.goldAccent }} title={paymentResult.recipient}>
                  {paymentResult.recipient.slice(0, 4)}...{paymentResult.recipient.slice(-4)}
                </span>
              </Row>
            )}
            {paymentResult.mint && (
              <Row label="Token Mint:">
                <span className="font-mono text-[11px]" style={{ color: '#94a3b8' }} title={paymentResult.mint}>
                  {paymentResult.mint.slice(0, 6)}...{paymentResult.mint.slice(-6)}
                </span>
              </Row>
            )}
            {paymentResult.hash && isValidTxRef(paymentResult.hash) ? (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #1e293b', wordBreak: 'break-all' }}>
                <span style={{ color: theme.textMuted, display: 'block', marginBottom: '2px' }}>Transaction Ref:</span>
                {paymentResult.network === 'Solana' && paymentResult.hash.length >= 40 ? (
                  <a
                    href={`https://solscan.io/tx/${paymentResult.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono underline"
                    style={{ fontSize: '11px', color: theme.goldAccent }}
                  >
                    {paymentResult.hash}
                  </a>
                ) : (
                  <code className="font-mono" style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {paymentResult.hash}
                  </code>
                )}
              </div>
            ) : null}
          </div>

          <p style={{ color: theme.goldAccent, fontSize: '13px', fontWeight: 600, margin: '0 0 4px' }}>
            Redirecting back to your Cente dashboard...
          </p>
          <p style={{ color: theme.textMuted, fontSize: '11px', margin: '0 0 18px' }}>
            If you are not redirected automatically in a few seconds, click below.
          </p>

          <a
            href={safeRedirect}
            style={{
              display: 'block',
              width: '100%',
              padding: '14px',
              backgroundColor: '#1e293b',
              color: '#ffffff',
              borderRadius: '14px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 600,
              boxSizing: 'border-box',
            }}
          >
            Return to Cente Now
          </a>
        </div>
      ) : view === 'enter-email' ? (
        /* 2. EMAIL VIEW */
        <div style={cardStyle}>
          <BackButton
            onClick={() => {
              setView('form');
              setError(null);
            }}
          />
          <div className="text-center" style={{ marginBottom: '22px' }}>
            <img
              src={config.logoUrl}
              alt="Cente"
              style={{ height: '36px', width: 'auto', display: 'inline-block', marginBottom: '14px' }}
            />
            <h3 style={{ color: theme.textPrimary, fontSize: '19px', fontWeight: 700, margin: '0 0 6px' }}>
              Sign in to fetch your wallet
            </h3>
            <p style={{ color: theme.textSecondary, fontSize: '13px', margin: 0 }}>
              We'll send a 6-digit confirmation code to access your {networkLabel} wallet
            </p>
          </div>

          <form onSubmit={handleSendEmailCode}>
            <div
              className="flex items-center"
              style={{
                backgroundColor: theme.inputBg,
                border: '1px solid #1e293b',
                borderRadius: '16px',
                padding: '12px 16px',
                marginBottom: '18px',
                boxSizing: 'border-box',
              }}
            >
              <Mail size={18} style={{ color: theme.goldAccent, marginRight: '10px' }} />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: '16px',
                  fontFamily: theme.fontFamily,
                }}
              />
            </div>
            <ErrorBox message={error} />
            <button type="submit" disabled={isLoading} style={goldButtonStyle(isLoading)}>
              {isLoading ? 'Sending Code...' : 'Continue'}
            </button>
          </form>
        </div>
      ) : view === 'enter-code' ? (
        /* 3. OTP VIEW */
        <div style={cardStyle}>
          <BackButton
            onClick={() => {
              setView('enter-email');
              setOtpCode('');
              setError(null);
            }}
          />
          <div className="text-center" style={{ marginBottom: '22px' }}>
            <h3 style={{ color: theme.textPrimary, fontSize: '19px', fontWeight: 700, margin: '0 0 6px' }}>
              Check your email
            </h3>
            <p style={{ color: theme.textSecondary, fontSize: '13px', margin: 0 }}>
              Enter the 6-digit code sent to <strong style={{ color: '#ffffff' }}>{email}</strong>
            </p>
          </div>

          <form onSubmit={handleVerifyCode}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              required
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              style={{
                width: '100%',
                backgroundColor: theme.inputBg,
                border: '1px solid #1e293b',
                borderRadius: '16px',
                padding: '14px 16px',
                color: '#ffffff',
                fontSize: '24px',
                fontWeight: 800,
                textAlign: 'center',
                letterSpacing: '0.25em',
                fontFamily: theme.fontFamily,
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '18px',
              }}
            />
            <ErrorBox message={error} />
            <button
              type="submit"
              disabled={isLoading || otpCode.length < 6}
              style={goldButtonStyle(isLoading || otpCode.length < 6)}
            >
              {isLoading ? 'Verifying & Opening Payment...' : 'Verify & Continue'}
            </button>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={cooldown > 0}
              style={{
                width: '100%',
                marginTop: '12px',
                background: 'transparent',
                border: 'none',
                color: cooldown > 0 ? theme.textMuted : theme.goldAccent,
                fontSize: '12px',
                fontWeight: 600,
                cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                fontFamily: theme.fontFamily,
              }}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </form>
        </div>
      ) : (
        /* 4. MAIN FORM VIEW */
        <div style={cardStyle}>
          <div className="text-center" style={{ marginBottom: '20px' }}>
            <img src={config.logoUrl} alt="Cente" style={{ height: '38px', width: 'auto', display: 'inline-block' }} />
          </div>

          {authenticated && destinationAddress ? (
            <div className="bg-[#151a24] border border-[#daa520]/30 rounded-2xl p-3.5 mb-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <div className="text-left">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Deposit Destination ({networkLabel})
                    </div>
                    <div className="font-mono text-xs font-semibold text-[#daa520]">
                      {destinationAddress.slice(0, 5)}...{destinationAddress.slice(-5)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {isSolana && (
                    <button
                      type="button"
                      onClick={handleTriggerBridge}
                      disabled={isCheckingBridge}
                      title="Scan and auto-bridge multi-chain deposits to your Solana wallet via Mayan"
                      className="text-slate-300 hover:text-[#daa520] p-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 transition flex items-center gap-1.5 text-[11px] font-medium border border-slate-700/50"
                    >
                      <RefreshCw size={12} className={isCheckingBridge ? 'animate-spin text-[#daa520]' : ''} />
                      <span>{isCheckingBridge ? 'Scanning...' : 'Scan & Bridge'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => logout()}
                    title="Disconnect"
                    aria-label="Disconnect"
                    className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              </div>

              {isSolana && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Sparkles size={12} className="text-[#daa520]" />
                    <span>
                      Auto-Bridge to Solana: <strong className="text-emerald-400">Active</strong>
                    </span>
                  </div>
                  {activeEvmWallet && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(activeEvmWallet);
                        setCopiedEvm(true);
                        setTimeout(() => setCopiedEvm(false), 2000);
                      }}
                      className="text-[10px] font-mono text-slate-400 hover:text-slate-200 transition flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/60"
                      title="Click to copy your multi-chain EVM address (Base, ETH, Polygon, BSC)"
                    >
                      <span>
                        EVM: {activeEvmWallet.slice(0, 4)}...{activeEvmWallet.slice(-4)}
                      </span>
                      {copiedEvm ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#151a24] border border-[#daa520]/25 rounded-2xl p-3.5 mb-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Network</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#daa520]">{isSolana ? 'Solana (SPL)' : networkLabel}</span>
                  <span className="text-[10px] font-medium bg-[#daa520]/15 text-[#daa520] border border-[#daa520]/30 rounded-full px-2 py-0.5">
                    Direct
                  </span>
                </div>
              </div>
              {isSolana && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/80">
                  <Sparkles size={12} className="text-[#daa520]" />
                  <span>Multi-chain deposits automatically bridge to Solana via Mayan</span>
                </div>
              )}
            </div>
          )}

          {/* Token selector */}
          <div className="mb-4">
            <label
              className="block mb-2"
              style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textSecondary }}
            >
              Select Token on {networkLabel}
            </label>
            <div className="grid grid-cols-2 gap-2 bg-[#0b0e14] border border-slate-800/80 rounded-2xl p-1" role="radiogroup" aria-label="Token">
              {['USDC', 'USDT'].map((tok) => {
                const isActive = selectedToken === tok;
                return (
                  <button
                    key={tok}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setSelectedToken(tok)}
                    className="py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    style={
                      isActive
                        ? { background: goldGradient, color: '#0b0e14', border: 'none' }
                        : { background: 'transparent', color: '#94a3b8', border: 'none' }
                    }
                  >
                    <span>{tok}</span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{
                        backgroundColor: isActive ? 'rgba(0,0,0,0.2)' : '#1e293b',
                        color: isActive ? '#0b0e14' : '#64748b',
                      }}
                    >
                      SPL
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount */}
          <div style={{ marginBottom: '22px' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
              <label
                htmlFor="cente-amount"
                style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textSecondary }}
              >
                Deposit Amount ({selectedToken})
              </label>
              <span style={{ fontSize: '12px', fontWeight: 600, color: theme.goldAccent }}>
                {amount || '0'} {selectedToken}
              </span>
            </div>

            <div
              className="flex items-center"
              style={{
                backgroundColor: theme.inputBg,
                border: '1px solid #1e293b',
                borderRadius: '16px',
                padding: '10px 16px',
                boxSizing: 'border-box',
              }}
            >
              <input
                id="cente-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={handleAmountChange}
                placeholder="20"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: '24px',
                  fontWeight: 700,
                  fontFamily: theme.fontFamily,
                }}
              />
              <div
                className="select-none flex items-center flex-shrink-0"
                style={{
                  backgroundColor: 'rgba(218, 165, 32, 0.15)',
                  color: theme.goldAccent,
                  border: `1px solid ${theme.goldBorder}`,
                  borderRadius: '10px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  marginLeft: '8px',
                }}
              >
                {selectedToken}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mt-2.5">
              {[20, 50, 100, 250].map((preset) => {
                const active = String(amount) === String(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setAmount(String(preset));
                      setError(null);
                    }}
                    className="py-1 text-xs rounded-lg font-semibold transition"
                    style={{
                      background: active ? 'rgba(218, 165, 32, 0.1)' : 'transparent',
                      color: active ? theme.goldAccent : '#94a3b8',
                      border: `1px solid ${active ? theme.goldAccent : '#1e293b'}`,
                      fontFamily: theme.fontFamily,
                    }}
                  >
                    ${preset}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-center" style={{ marginTop: '8px', padding: '0 4px', fontSize: '11px', color: theme.textMuted }}>
              <span>
                Target:{' '}
                <strong style={{ color: theme.goldSecondary, fontWeight: 600 }}>
                  {amount || '0'} {selectedToken}
                </strong>
              </span>
              <span style={{ color: '#64748b' }}>1 {selectedToken} ≈ $1 USD</span>
            </div>
          </div>

          {/* Payment method */}
          <div style={{ marginBottom: '24px' }}>
            <div
              id="cente-method-label"
              style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textSecondary, marginBottom: '10px' }}
            >
              Payment Method
            </div>

            <div role="radiogroup" aria-labelledby="cente-method-label" className="flex flex-col" style={{ gap: '10px' }}>
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = selectedMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedMethod(method.id)}
                    className="flex items-center justify-between text-left"
                    style={{
                      cursor: 'pointer',
                      padding: '14px 16px',
                      borderRadius: '16px',
                      border: isSelected ? `1px solid ${theme.goldBorderActive}` : '1px solid #1e293b',
                      backgroundColor: isSelected ? theme.methodSelectedBg : theme.methodBg,
                      boxShadow: isSelected ? theme.goldGlow : 'none',
                      transition: 'all 0.15s ease',
                      boxSizing: 'border-box',
                      width: '100%',
                      fontFamily: theme.fontFamily,
                    }}
                  >
                    <div className="flex items-center" style={{ gap: '12px' }}>
                      <div
                        className="flex items-center justify-center"
                        style={{
                          padding: '10px',
                          borderRadius: '12px',
                          backgroundColor: isSelected ? 'rgba(184, 134, 11, 0.2)' : '#1e293b',
                          color: isSelected ? theme.goldAccent : '#94a3b8',
                          border: isSelected ? '1px solid rgba(218, 165, 32, 0.3)' : 'none',
                        }}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="flex items-center" style={{ gap: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: '#ffffff' }}>{method.name}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '20px',
                              backgroundColor: isSelected ? 'rgba(218, 165, 32, 0.2)' : '#1e293b',
                              color: isSelected ? theme.goldAccent : '#94a3b8',
                              border: isSelected ? '1px solid rgba(218, 165, 32, 0.3)' : '1px solid #334155',
                            }}
                          >
                            {method.tag}
                          </span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: theme.textSecondary }}>{method.subtitle}</p>
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        border: isSelected ? `1px solid ${theme.goldAccent}` : '1px solid #475569',
                        backgroundColor: isSelected ? theme.goldAccent : 'transparent',
                        color: '#000000',
                      }}
                    >
                      {isSelected && <Check size={11} strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <ErrorBox message={error} />

          <button
            type="button"
            onClick={handleStartPayment}
            disabled={buyDisabled}
            style={{ ...goldButtonStyle(buyDisabled), padding: '15px 20px' }}
          >
            {isLoading ? (
              <span>Processing...</span>
            ) : (
              <>
                <span>
                  Buy {amount || '0'} {selectedToken} on {networkLabel}
                </span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default CenteFiatOnramp;
