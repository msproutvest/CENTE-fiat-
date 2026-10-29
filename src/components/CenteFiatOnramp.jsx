import React, { useState, useEffect } from 'react';
import { usePrivy, useFundWallet, useAddFunds, useLoginWithEmail, useWallets } from '@privy-io/react-auth';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  Mail,
  Wallet,
  LogOut,
  RefreshCw,
  Sparkles,
  Copy,
} from 'lucide-react';
import { config, theme, paymentMethods } from '../config';
import { getSolanaWalletAddress, getEvmWalletAddress } from '../lib/wallet-utils';
import { triggerAutoBridgeNow } from './wallet/AutoBridgeRunner';

export { getSolanaWalletAddress };

export function CenteFiatOnramp({
  defaultAmount,
  defaultToken = 'USDC',
  appId,
  initialEmail,
  redirectUrl = 'https://app.gocente.com',
  network = 'Solana',
}) {
  const { user, authenticated, logout } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { addFunds } = useAddFunds();
  const { fundWallet } = useFundWallet();
  const { sendCode, loginWithCode } = useLoginWithEmail();

  const [amount, setAmount] = useState(String(defaultAmount || config.defaultAmount));
  const [selectedToken, setSelectedToken] = useState(defaultToken || 'USDC');
  const defaultCurrency = 'USD';
  const [selectedMethod, setSelectedMethod] = useState('meld');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [view, setView] = useState('form'); // 'form' | 'enter-email' | 'enter-code'
  const [email, setEmail] = useState(initialEmail || '');
  const [otpCode, setOtpCode] = useState('');
  const [isCheckingBridge, setIsCheckingBridge] = useState(false);
  const [copiedEvm, setCopiedEvm] = useState(false);

  // Dynamically fetch the authenticated user's Solana and EVM wallets
  const activeUserWallet = getSolanaWalletAddress(user, [], privyWallets);
  const activeEvmWallet = getEvmWalletAddress(user, privyWallets);
  const destinationAddress = activeUserWallet;

  const handleTriggerBridge = () => {
    setIsCheckingBridge(true);
    triggerAutoBridgeNow();
    setTimeout(() => setIsCheckingBridge(false), 2500);
  };

  const handleAmountChange = (e) => {
    let val = e.target.value;
    val = val.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('');
    }
    if (val === '') {
      setAmount('');
      return;
    }
    if (val.length > 1 && val.startsWith('0') && val[1] !== '.') {
      val = val.replace(/^0+/, '');
      if (val === '') val = '0';
    }
    setAmount(val);
  };

  const handlePresetAmount = (presetVal) => {
    setAmount(String(presetVal));
    setError(null);
  };

  /**
   * Executes the funding process with the exact input amount
   */
  const executeFunding = async (
    amountNum,
    currency,
    method,
    tokenChoice = selectedToken,
    targetAddress = destinationAddress
  ) => {
    try {
      let result = null;
      const tokenMeta = config.solanaTokens[tokenChoice] || config.solanaTokens.USDC;
      const isSolana = network?.toLowerCase().includes('sol');
      const amountStr = String(amountNum);

      if (!targetAddress) {
        throw new Error('No Solana wallet found. Please sign in to generate or connect your wallet.');
      }

      console.log(`[Cente] Initiating ${amountStr} ${tokenChoice} deposit to user wallet: ${targetAddress}`);

      // 1. Primary: Use addFunds directly to forward the EXACT input amount and preferred provider to fiat onramp
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
                amount: amountStr,
              },
              defaultAmount: amountStr,
              amount: amountStr,
              preferredPaymentMethod: method || selectedMethod,
            },
            amount: amountStr,
          });
        } catch (addFundsErr) {
          console.warn('[Cente] addFunds flow notice/fallback:', addFundsErr);
        }
      }

      // 2. Fallback: Use fundWallet with explicit amount options if addFunds was unavailable
      if (!result && typeof fundWallet === 'function') {
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
          console.warn('[Cente] fundWallet Solana token-amount flow notice:', err);
        }
      }

      console.log('[Cente] Funding result:', JSON.stringify(result, null, 2));

      const txRef =
        result?.transactionHash ||
        result?.referenceId ||
        (result?.status === 'completed' || result?.status === 'confirmed' ? 'Confirmed' : null);

      if (txRef && result?.status !== 'cancelled') {
        const details = {
          hash: txRef,
          amount: amountNum,
          token: tokenChoice,
          network: isSolana ? 'Solana' : network,
          mint: tokenMeta.mintAddress,
          recipient: targetAddress,
          method: method.toUpperCase(),
        };

        setIsSuccess(true);
        setPaymentResult(details);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('cente-payment-success', {
              detail: details,
            })
          );
        }

        if (redirectUrl) {
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 2500);
        }
      } else {
        console.log('[Cente] No transaction hash or cancelled — treating as cancelled.');
        setIsSuccess(false);
      }
    } catch (err) {
      console.warn('[Cente] Funding cancelled or error:', err);
      setIsSuccess(false);
      const msg = err?.message || '';
      if (
        !(
          msg.toLowerCase().includes('user') ||
          msg.toLowerCase().includes('cancel') ||
          msg.toLowerCase().includes('close') ||
          msg.toLowerCase().includes('exit')
        ) &&
        msg
      ) {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
      setView('form');
      // Automatically trigger Mayan bridge scan for any completed multi-chain deposits
      triggerAutoBridgeNow();
    }
  };

  const handleStartPayment = async () => {
    setIsLoading(true);
    setError(null);

    const amountNum = parseFloat(amount) || 0;
    if (amountNum <= 0) {
      setError('Please enter an amount greater than 0.');
      setIsLoading(false);
      return;
    }

    if ((appId || config.privyAppId).includes('insert-your-privy-app-id')) {
      setError('Please set your real Privy App ID in src/config.js or data-app-id to launch the onramp.');
      setIsLoading(false);
      return;
    }

    // If already authenticated, fetch the user's active wallet and proceed immediately
    if (authenticated) {
      const targetWallet = activeUserWallet;
      if (!targetWallet) {
        setError('Fetching your Solana wallet... please try again in a moment.');
        setIsLoading(false);
        return;
      }
      await executeFunding(amountNum, defaultCurrency, selectedMethod, selectedToken, targetWallet);
      return;
    }

    // If not authenticated, prompt for email OTP to dynamically create/fetch their wallet
    setIsLoading(false);
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
      setView('enter-code');
    } catch (err) {
      console.warn('sendCode error:', err);
      setError(err?.message || 'Failed to send confirmation code. Please try again.');
    } finally {
      setIsLoading(false);
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
    const amountNum = parseFloat(amount) || 0;

    try {
      const loginRes = await loginWithCode({ code: otpCode });
      console.log('[Cente] Login completed:', loginRes);

      // Fetch the logged-in user's wallet address from the response or state
      const loggedInUser = loginRes?.user || user;
      const targetWallet = getSolanaWalletAddress(loggedInUser) || activeUserWallet;

      await executeFunding(amountNum, defaultCurrency, selectedMethod, selectedToken, targetWallet);
    } catch (err) {
      console.warn('loginWithCode error:', err);
      setError(err?.message || 'Invalid or expired confirmation code.');
      setIsLoading(false);
    }
  };

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
      {/* 1. SUCCESS VIEW */}
      {isSuccess && paymentResult ? (
        <div
          className="cente-card rounded-3xl p-7 sm:p-8 text-center"
          style={{
            backgroundColor: theme.cardBg,
            border: `1px solid ${theme.goldBorder}`,
            borderRadius: '24px',
            padding: '32px 28px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            boxSizing: 'border-box',
          }}
        >
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
          <h3
            className="text-white text-2xl font-bold mb-1.5"
            style={{ color: theme.textPrimary, fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }}
          >
            Deposit Successful
          </h3>
          <p
            className="text-slate-400 text-[13px] mb-6"
            style={{ color: theme.textSecondary, fontSize: '13px', margin: '0 0 24px' }}
          >
            Your {paymentResult.amount} {paymentResult.token} has been settled on the Solana network.
          </p>

          <div
            className="bg-[#0b0e14] rounded-2xl border border-slate-800/80 p-4 px-5 text-left text-xs leading-relaxed mb-6 space-y-2"
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
            <div className="flex justify-between" style={{ display: 'flex', justifyContent: 'space-between', color: theme.textSecondary }}>
              <span>Amount:</span>
              <strong style={{ color: theme.textPrimary, fontSize: '14px' }}>
                {paymentResult.amount} {paymentResult.token}
              </strong>
            </div>
            <div className="flex justify-between" style={{ display: 'flex', justifyContent: 'space-between', color: theme.textSecondary }}>
              <span>Network:</span>
              <span className="text-[#daa520] font-semibold" style={{ color: theme.goldAccent, fontWeight: 600 }}>
                Solana (Mainnet)
              </span>
            </div>
            <div className="flex justify-between" style={{ display: 'flex', justifyContent: 'space-between', color: theme.textSecondary }}>
              <span>Method:</span>
              <span className="font-semibold text-white" style={{ color: '#ffffff', fontWeight: 600 }}>
                {paymentResult.method}
              </span>
            </div>
            {paymentResult.recipient && (
              <div className="flex justify-between" style={{ display: 'flex', justifyContent: 'space-between', color: theme.textSecondary }}>
                <span>Recipient Wallet:</span>
                <span className="font-mono text-[11px] text-[#daa520]" title={paymentResult.recipient}>
                  {paymentResult.recipient.slice(0, 4)}...{paymentResult.recipient.slice(-4)}
                </span>
              </div>
            )}
            {paymentResult.mint && (
              <div className="flex justify-between" style={{ display: 'flex', justifyContent: 'space-between', color: theme.textSecondary }}>
                <span>Token Mint:</span>
                <span className="font-mono text-[11px] text-slate-400" title={paymentResult.mint}>
                  {paymentResult.mint.slice(0, 6)}...{paymentResult.mint.slice(-6)}
                </span>
              </div>
            )}
            <div
              className="mt-2.5 pt-2.5 border-t border-slate-800/80 break-all"
              style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #1e293b', wordBreak: 'break-all' }}
            >
              <span className="text-slate-500 block mb-0.5" style={{ color: theme.textMuted, display: 'block', marginBottom: '2px' }}>
                Transaction Ref:
              </span>
              <code className="text-[11px] text-slate-400 font-mono" style={{ fontSize: '11px', color: '#94a3b8' }}>
                {paymentResult.hash}
              </code>
            </div>
          </div>

          <div className="mb-4" style={{ marginBottom: '18px' }}>
            <p
              className="text-[#daa520] text-[13px] font-semibold mb-1"
              style={{ color: theme.goldAccent, fontSize: '13px', fontWeight: 600, margin: '0 0 4px' }}
            >
              Redirecting back to your Cente dashboard...
            </p>
            <p
              className="text-slate-500 text-[11px] m-0"
              style={{ color: theme.textMuted, fontSize: '11px', margin: 0 }}
            >
              If you are not redirected automatically in a few seconds, click below.
            </p>
          </div>

          <a
            href={redirectUrl || 'https://app.gocente.com'}
            className="block w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-center no-underline text-sm font-semibold transition"
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
        /* 2. EMAIL CODE REQUEST VIEW */
        <div
          className="cente-card rounded-3xl p-7 sm:p-8"
          style={{
            backgroundColor: theme.cardBg,
            border: `1px solid ${theme.goldBorder}`,
            borderRadius: '24px',
            padding: '30px 26px',
            boxShadow: '0 10px 40px -10px rgba(212, 175, 55, 0.12)',
            boxSizing: 'border-box',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setView('form');
              setError(null);
            }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer mb-4 bg-transparent border-0 p-0"
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.textSecondary,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              marginBottom: '18px',
              padding: 0,
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>

          <div className="text-center mb-5" style={{ textAlign: 'center', marginBottom: '22px' }}>
            <img
              src={config.logoUrl}
              alt="Cente"
              className="h-9 w-auto inline-block mb-3.5"
              style={{ height: '36px', width: 'auto', display: 'inline-block', marginBottom: '14px' }}
            />
            <h3
              className="text-white text-xl font-bold mb-1.5"
              style={{ color: theme.textPrimary, fontSize: '19px', fontWeight: 700, margin: '0 0 6px' }}
            >
              Sign in to fetch your wallet
            </h3>
            <p
              className="text-slate-400 text-[13px] m-0"
              style={{ color: theme.textSecondary, fontSize: '13px', margin: 0 }}
            >
              We'll send a 6-digit confirmation code to access your Solana wallet
            </p>
          </div>

          <form onSubmit={handleSendEmailCode}>
            <div className="mb-4" style={{ marginBottom: '18px' }}>
              <div
                className="flex items-center bg-[#0b0e14] border border-slate-800/80 rounded-2xl p-3 px-4 focus-within:border-[#daa520] focus-within:ring-1 focus-within:ring-[#daa520]/20"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: theme.inputBg,
                  border: '1px solid #1e293b',
                  borderRadius: '16px',
                  padding: '12px 16px',
                  boxSizing: 'border-box',
                }}
              >
                <Mail
                  size={18}
                  className="text-[#daa520] mr-2.5"
                  style={{ color: theme.goldAccent, marginRight: '10px' }}
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-transparent border-0 outline-none text-white text-base placeholder:text-slate-600"
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
            </div>

            {error && (
              <div
                className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 px-3 text-amber-300 text-xs flex items-start gap-2 mb-4"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  color: '#fcd34d',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  marginBottom: '16px',
                }}
              >
                <CircleAlert size={15} className="flex-shrink-0 mt-0.5" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-5 gold-gradient-bg text-black font-bold text-sm rounded-2xl shadow-lg shadow-[#b8860b]/25 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 hover:brightness-110 transition-all duration-150"
              style={{
                width: '100%',
                padding: '14px 20px',
                background: `linear-gradient(135deg, ${theme.goldPrimary} 0%, ${theme.goldSecondary} 50%, ${theme.goldAccent} 100%)`,
                color: '#0b0e14',
                fontWeight: 800,
                fontSize: '14px',
                borderRadius: '16px',
                border: 'none',
                boxShadow: '0 8px 24px -4px rgba(184, 134, 11, 0.35)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontFamily: theme.fontFamily,
              }}
            >
              {isLoading ? 'Sending Code...' : 'Continue'}
            </button>
          </form>
        </div>
      ) : view === 'enter-code' ? (
        /* 3. OTP CODE VERIFICATION VIEW */
        <div
          className="cente-card rounded-3xl p-7 sm:p-8"
          style={{
            backgroundColor: theme.cardBg,
            border: `1px solid ${theme.goldBorder}`,
            borderRadius: '24px',
            padding: '30px 26px',
            boxShadow: '0 10px 40px -10px rgba(212, 175, 55, 0.12)',
            boxSizing: 'border-box',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setView('enter-email');
              setError(null);
            }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer mb-4 bg-transparent border-0 p-0"
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.textSecondary,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              marginBottom: '18px',
              padding: 0,
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>

          <div className="text-center mb-5" style={{ textAlign: 'center', marginBottom: '22px' }}>
            <h3
              className="text-white text-xl font-bold mb-1.5"
              style={{ color: theme.textPrimary, fontSize: '19px', fontWeight: 700, margin: '0 0 6px' }}
            >
              Check your email
            </h3>
            <p
              className="text-slate-400 text-[13px] m-0"
              style={{ color: theme.textSecondary, fontSize: '13px', margin: 0 }}
            >
              Enter the 6-digit code sent to <strong className="text-white" style={{ color: '#ffffff' }}>{email}</strong>
            </p>
          </div>

          <form onSubmit={handleVerifyCode}>
            <div className="mb-4" style={{ marginBottom: '18px' }}>
              <input
                type="text"
                maxLength={6}
                autoFocus
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.trim())}
                placeholder="123456"
                className="w-full bg-[#0b0e14] border border-slate-800/80 rounded-2xl p-3.5 px-4 text-white text-2xl font-bold text-center tracking-[0.25em] outline-none focus:border-[#daa520] focus:ring-1 focus:ring-[#daa520]/20"
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
                }}
              />
            </div>

            {error && (
              <div
                className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 px-3 text-amber-300 text-xs flex items-start gap-2 mb-4"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  color: '#fcd34d',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  marginBottom: '16px',
                }}
              >
                <CircleAlert size={15} className="flex-shrink-0 mt-0.5" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || otpCode.length < 6}
              className="w-full py-3.5 px-5 gold-gradient-bg text-black font-bold text-sm rounded-2xl shadow-lg shadow-[#b8860b]/25 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 hover:brightness-110 transition-all duration-150"
              style={{
                width: '100%',
                padding: '14px 20px',
                background: `linear-gradient(135deg, ${theme.goldPrimary} 0%, ${theme.goldSecondary} 50%, ${theme.goldAccent} 100%)`,
                color: '#0b0e14',
                fontWeight: 800,
                fontSize: '14px',
                borderRadius: '16px',
                border: 'none',
                boxShadow: '0 8px 24px -4px rgba(184, 134, 11, 0.35)',
                cursor: isLoading || otpCode.length < 6 ? 'not-allowed' : 'pointer',
                opacity: isLoading || otpCode.length < 6 ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontFamily: theme.fontFamily,
              }}
            >
              {isLoading ? 'Verifying & Opening Payment...' : 'Verify & Continue'}
            </button>
          </form>
        </div>
      ) : (
        /* 4. MAIN DEPOSIT FORM VIEW */
        <div
          className="cente-card rounded-3xl p-7 sm:p-8"
          style={{
            backgroundColor: theme.cardBg,
            border: `1px solid ${theme.goldBorder}`,
            borderRadius: '24px',
            padding: '30px 26px',
            boxShadow: '0 10px 40px -10px rgba(212, 175, 55, 0.12)',
            boxSizing: 'border-box',
          }}
        >
          {/* Header & Logo */}
          <div className="text-center mb-5" style={{ textAlign: 'center', marginBottom: '20px' }}>
            <img
              src={config.logoUrl}
              alt="Cente"
              className="h-9 w-auto inline-block"
              style={{ height: '38px', width: 'auto', display: 'inline-block' }}
            />
          </div>

          {/* User Wallet Status Badge & Auto-Bridge Indicator */}
          {authenticated && activeUserWallet ? (
            <div className="bg-[#151a24] border border-[#daa520]/30 rounded-2xl p-3.5 mb-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <div className="text-left">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Deposit Destination (Solana)
                    </div>
                    <div className="font-mono text-xs font-semibold text-[#daa520]">
                      {activeUserWallet.slice(0, 5)}...{activeUserWallet.slice(-5)} (Solana)
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
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
                  <button
                    type="button"
                    onClick={() => logout()}
                    title="Disconnect"
                    className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              </div>

              {/* Auto-Bridge Active Indicator */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Sparkles size={12} className="text-[#daa520]" />
                  <span>Auto-Bridge to Solana: <strong className="text-emerald-400">Active</strong> (Mayan)</span>
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
                    <span>EVM: {activeEvmWallet.slice(0, 4)}...{activeEvmWallet.slice(-4)}</span>
                    {copiedEvm ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#151a24] border border-[#daa520]/25 rounded-2xl p-3.5 mb-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Network
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#daa520]">
                    Solana (SPL)
                  </span>
                  <span className="text-[10px] font-medium bg-[#daa520]/15 text-[#daa520] border border-[#daa520]/30 rounded-full px-2 py-0.5">
                    Direct
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/80">
                <Sparkles size={12} className="text-[#daa520]" />
                <span>Multi-chain deposits automatically bridge to Solana via Mayan</span>
              </div>
            </div>
          )}

          {/* Token Selector: USDC vs USDT */}
          <div className="mb-4">
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2"
              style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textSecondary }}
            >
              Select Token on Solana
            </label>
            <div className="grid grid-cols-2 gap-2 bg-[#0b0e14] border border-slate-800/80 rounded-2xl p-1">
              {['USDC', 'USDT'].map((tok) => {
                const isActive = selectedToken === tok;
                return (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setSelectedToken(tok)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      isActive
                        ? 'gold-gradient-bg text-black shadow-md shadow-[#b8860b]/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <span>{tok}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-semibold ${
                        isActive
                          ? 'bg-black/20 text-black'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      SPL
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount input */}
          <div className="mb-5" style={{ marginBottom: '22px' }}>
            <div className="flex justify-between items-center mb-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label
                className="text-[11px] font-bold uppercase tracking-wider text-slate-400"
                style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textSecondary }}
              >
                Deposit Amount ({selectedToken})
              </label>
              <span
                className="text-xs font-semibold text-[#daa520]"
                style={{ fontSize: '12px', fontWeight: 600, color: theme.goldAccent }}
              >
                {amount || '0'} {selectedToken}
              </span>
            </div>

            <div
              className="flex items-center bg-[#0b0e14] border border-slate-800/80 rounded-2xl p-2.5 px-4 focus-within:border-[#daa520] focus-within:ring-1 focus-within:ring-[#daa520]/20"
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: theme.inputBg,
                border: '1px solid #1e293b',
                borderRadius: '16px',
                padding: '10px 16px',
                boxSizing: 'border-box',
              }}
            >
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={handleAmountChange}
                placeholder="20"
                className="w-full bg-transparent border-0 outline-none text-white text-2xl font-bold font-sans placeholder:text-slate-600"
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
                className="bg-[#daa520]/20 text-[#daa520] border border-[#daa520]/30 rounded-xl px-3.5 py-1.5 text-[13px] font-bold tracking-wider select-none flex items-center flex-shrink-0"
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
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                {selectedToken}
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="grid grid-cols-4 gap-1.5 mt-2.5">
              {[20, 50, 100, 250].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetAmount(preset)}
                  className={`py-1 text-xs rounded-lg font-semibold transition border ${
                    String(amount) === String(preset)
                      ? 'border-[#daa520] text-[#daa520] bg-[#daa520]/10'
                      : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>

            <div
              className="flex justify-between items-center mt-2 px-1 text-[11px] text-slate-500"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', padding: '0 4px', fontSize: '11px', color: theme.textMuted }}
            >
              <span>
                Target:{' '}
                <strong className="text-[#d4af37] font-semibold" style={{ color: theme.goldSecondary, fontWeight: 600 }}>
                  {amount || '0'} {selectedToken}
                </strong>
              </span>
              <span className="text-slate-500" style={{ color: '#64748b' }}>
                1 {selectedToken} ≈ $1 USD
              </span>
            </div>
          </div>

          {/* Payment Method selector */}
          <div className="mb-6" style={{ marginBottom: '24px' }}>
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5"
              style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textSecondary, marginBottom: '10px' }}
            >
              Payment Method
            </label>

            <div className="flex flex-col gap-2.5" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = selectedMethod === method.id;

                return (
                  <div
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`cursor-pointer p-3.5 px-4 rounded-2xl border transition-all duration-150 flex items-center justify-between ${
                      isSelected
                        ? 'border-[#daa520] bg-[#151a24] shadow-[0_0_14px_rgba(218,165,32,0.16)]'
                        : 'border-slate-800/80 bg-[#0b0e14]/60 hover:border-slate-700 hover:bg-[#0b0e14]'
                    }`}
                    style={{
                      cursor: 'pointer',
                      padding: '14px 16px',
                      borderRadius: '16px',
                      border: isSelected ? `1px solid ${theme.goldBorderActive}` : '1px solid #1e293b',
                      backgroundColor: isSelected ? theme.methodSelectedBg : theme.methodBg,
                      boxShadow: isSelected ? theme.goldGlow : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        className={`p-2.5 rounded-xl flex items-center justify-center ${
                          isSelected
                            ? 'bg-[#b8860b]/20 text-[#daa520] border border-[#daa520]/30'
                            : 'bg-slate-800 text-slate-400 border-0'
                        }`}
                        style={{
                          padding: '10px',
                          borderRadius: '12px',
                          backgroundColor: isSelected ? 'rgba(184, 134, 11, 0.2)' : '#1e293b',
                          color: isSelected ? theme.goldAccent : '#94a3b8',
                          border: isSelected ? '1px solid rgba(218, 165, 32, 0.3)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon size={18} />
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="font-semibold text-sm text-white" style={{ fontWeight: 600, fontSize: '14px', color: '#ffffff' }}>
                            {method.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isSelected
                                ? 'bg-[#daa520]/20 text-[#daa520] border border-[#daa520]/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
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
                        <p className="mt-0.5 text-[11px] text-slate-400" style={{ margin: '2px 0 0', fontSize: '11px', color: theme.textSecondary }}>
                          {method.subtitle}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'border-[#daa520] bg-[#daa520] text-black'
                          : 'border-slate-700 bg-transparent'
                      }`}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        border: isSelected ? `1px solid ${theme.goldAccent}` : '1px solid #475569',
                        backgroundColor: isSelected ? theme.goldAccent : 'transparent',
                        color: '#000000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isSelected && <Check size={11} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div
              className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-300 text-xs flex items-start gap-2 mb-5"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '12px',
                padding: '12px',
                color: '#fcd34d',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '20px',
              }}
            >
              <CircleAlert size={16} className="flex-shrink-0 mt-0.5" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleStartPayment}
            disabled={isLoading || (parseFloat(amount) || 0) <= 0}
            className="w-full py-4 px-5 gold-gradient-bg text-black font-bold text-sm rounded-2xl shadow-lg shadow-[#b8860b]/25 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 hover:brightness-110 transition-all duration-150"
            style={{
              width: '100%',
              padding: '15px 20px',
              background: `linear-gradient(135deg, ${theme.goldPrimary} 0%, ${theme.goldSecondary} 50%, ${theme.goldAccent} 100%)`,
              color: '#0b0e14',
              fontWeight: 800,
              fontSize: '14px',
              borderRadius: '16px',
              border: 'none',
              boxShadow: '0 8px 24px -4px rgba(184, 134, 11, 0.35)',
              cursor: isLoading || (parseFloat(amount) || 0) <= 0 ? 'not-allowed' : 'pointer',
              opacity: isLoading || (parseFloat(amount) || 0) <= 0 ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: theme.fontFamily,
              touchAction: 'manipulation',
              transition: 'transform 0.1s ease, filter 0.15s ease',
            }}
          >
            {isLoading ? (
              <span>Processing...</span>
            ) : (
              <>
                <span>Buy {amount || '0'} {selectedToken} on Solana</span>
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
