import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  Info,
  DollarSign,
  Wallet,
  Coins,
  Sparkles,
} from 'lucide-react';
import { HALAL_STOCKS, SOLANA_USDC_MINT } from '../data/halalStocks';
import {
  getJupiterStockQuote,
  getJupiterStockSwapTransaction,
  fetchStockPriceUsd,
  fetchTokenBalance,
  executeSolanaSwapTransaction,
} from '../services/jupiterSwap';
import { theme } from '../config';

const goldGradient = `linear-gradient(135deg, ${theme.goldPrimary} 0%, ${theme.goldSecondary} 50%, ${theme.goldAccent} 100%)`;
const greenGradient = `linear-gradient(135deg, #10b981 0%, #059669 100%)`;

export function HalalStockTrading({
  solanaAddress,
  solWallet,
  authenticated,
  onRequireLogin,
  onSwitchToDeposit,
}) {
  const [selectedStock, setSelectedStock] = useState(HALAL_STOCKS[0]);
  const [tradeMode, setTradeMode] = useState('buy'); // 'buy' | 'sell'
  const [amount, setAmount] = useState('50');
  const [stockPrices, setStockPrices] = useState({});
  const [userUsdcBalance, setUserUsdcBalance] = useState(0);
  const [userStockBalance, setUserStockBalance] = useState(0);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStep, setExecutionStep] = useState('');
  const [executionError, setExecutionError] = useState(null);
  const [tradeSuccess, setTradeSuccess] = useState(null);
  const [showShariahDetails, setShowShariahDetails] = useState(false);

  // Fetch live price for selected stock
  useEffect(() => {
    let isMounted = true;
    async function loadPrice() {
      const price = await fetchStockPriceUsd(selectedStock.mint, selectedStock.decimals);
      if (isMounted && price) {
        setStockPrices((prev) => ({ ...prev, [selectedStock.symbol]: price }));
      }
    }
    loadPrice();
    return () => {
      isMounted = false;
    };
  }, [selectedStock]);

  // Fetch user balances
  const refreshBalances = async () => {
    if (!solanaAddress) return;
    try {
      const [usdc, stock] = await Promise.all([
        fetchTokenBalance(solanaAddress, SOLANA_USDC_MINT),
        fetchTokenBalance(solanaAddress, selectedStock.mint),
      ]);
      setUserUsdcBalance(usdc);
      setUserStockBalance(stock);
    } catch {}
  };

  useEffect(() => {
    refreshBalances();
    const interval = setInterval(refreshBalances, 12000);
    return () => clearInterval(interval);
  }, [solanaAddress, selectedStock]);

  // Debounced quote fetching
  useEffect(() => {
    let isMounted = true;
    setQuote(null);
    setQuoteError(null);

    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);

    const timer = setTimeout(async () => {
      try {
        let inputMint, outputMint, rawAmount;

        if (tradeMode === 'buy') {
          // Pay USDC (6 decimals) -> Get Stock (8 decimals)
          inputMint = SOLANA_USDC_MINT;
          outputMint = selectedStock.mint;
          rawAmount = Math.round(val * 10 ** 6);
        } else {
          // Pay Stock (8 decimals) -> Get USDC (6 decimals)
          inputMint = selectedStock.mint;
          outputMint = SOLANA_USDC_MINT;
          rawAmount = Math.round(val * 10 ** selectedStock.decimals);
        }

        const q = await getJupiterStockQuote({
          inputMint,
          outputMint,
          amountRaw: rawAmount,
          slippageBps: 50,
        });

        if (isMounted) {
          setQuote(q);
          setQuoteError(null);
        }
      } catch (err) {
        if (isMounted) {
          setQuote(null);
          setQuoteError(err?.message || 'No swap route available on Jupiter DEX.');
        }
      } finally {
        if (isMounted) setQuoteLoading(false);
      }
    }, 450);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [amount, selectedStock, tradeMode]);

  // Calculated estimates
  const estimatedOutput = useMemo(() => {
    if (!quote?.outAmount) return null;
    if (tradeMode === 'buy') {
      const shares = Number(quote.outAmount) / 10 ** selectedStock.decimals;
      return shares.toFixed(4);
    } else {
      const usdc = Number(quote.outAmount) / 10 ** 6;
      return usdc.toFixed(2);
    }
  }, [quote, selectedStock, tradeMode]);

  const currentPrice = stockPrices[selectedStock.symbol];

  const handleExecuteTrade = async () => {
    if (!authenticated) {
      onRequireLogin?.();
      return;
    }
    if (!solanaAddress || !solWallet) {
      setExecutionError('Solana wallet not available. Please ensure your wallet is connected.');
      return;
    }
    if (!quote) {
      setExecutionError('A valid quote is required before trading.');
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionStep('Building Jupiter swap transaction...');

    try {
      const swapRes = await getJupiterStockSwapTransaction({
        userPublicKey: solanaAddress,
        quoteResponse: quote,
      });

      if (!swapRes?.swapTransaction) {
        throw new Error('Jupiter API did not return a valid swap transaction.');
      }

      setExecutionStep('Confirming trade in your wallet...');

      const txSignature = await executeSolanaSwapTransaction({
        solWallet,
        swapTransactionBase64: swapRes.swapTransaction,
      });

      setTradeSuccess({
        txHash: txSignature,
        symbol: selectedStock.symbol,
        stockName: selectedStock.name,
        shares: estimatedOutput,
        amountUsdc: amount,
        mode: tradeMode,
      });

      refreshBalances();
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('User rejected') || err?.name === 'UserRejectedRequestError') {
        setExecutionError('Trade was cancelled by user.');
      } else {
        setExecutionError(msg || 'Failed to execute swap on Jupiter.');
      }
    } finally {
      setIsExecuting(false);
      setExecutionStep('');
    }
  };

  // Trade Success View
  if (tradeSuccess) {
    return (
      <div
        className="p-6 rounded-2xl text-center space-y-4"
        style={{
          background: theme.cardBg,
          border: `1px solid rgba(16, 185, 129, 0.4)`,
          fontFamily: theme.fontFamily,
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
          style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}
        >
          <CheckCircle2 size={32} />
        </div>

        <div>
          <h3 className="text-base font-extrabold text-white">Stock Trade Executed!</h3>
          <p className="text-xs text-emerald-400 font-medium mt-1">
            Settled on Solana Mainnet via Jupiter DEX
          </p>
        </div>

        <div
          className="p-4 rounded-xl text-left space-y-2 text-xs"
          style={{ background: '#0b0e14', border: '1px solid rgba(255, 255, 255, 0.08)' }}
        >
          <div className="flex justify-between">
            <span style={{ color: theme.textSecondary }}>Asset</span>
            <span className="font-bold text-white">
              {tradeSuccess.stockName} ({tradeSuccess.symbol})
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: theme.textSecondary }}>
              {tradeSuccess.mode === 'buy' ? 'Shares Acquired' : 'Shares Sold'}
            </span>
            <span className="font-bold text-emerald-400 font-mono">
              {tradeSuccess.shares} {tradeSuccess.symbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: theme.textSecondary }}>Total Value</span>
            <span className="font-bold text-white">${tradeSuccess.amountUsdc} USDC</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
            <span style={{ color: theme.textSecondary }}>Transaction</span>
            <a
              href={`https://solscan.io/tx/${tradeSuccess.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 font-mono text-[11px] flex items-center gap-1 font-semibold"
            >
              <span>{tradeSuccess.txHash ? `${tradeSuccess.txHash.slice(0, 6)}...${tradeSuccess.txHash.slice(-6)}` : 'Solscan'}</span>
              <ExternalLink size={11} />
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setTradeSuccess(null);
            setAmount('50');
            refreshBalances();
          }}
          className="w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition"
          style={{
            background: goldGradient,
            color: '#0b0e14',
            border: 'none',
          }}
        >
          Trade More Halal Stocks
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ fontFamily: theme.fontFamily }}>
      {/* Halalvest Shariah Compliance Header Banner */}
      <div
        className="p-3 rounded-xl flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.05) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold"
            style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}
          >
            <ShieldCheck size={16} />
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <span>Halalvest Stock Trading</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full font-semibold bg-emerald-500/20 text-emerald-300">
                AAOIFI
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Shariah-screened equities • Jupiter DEX on Solana
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowShariahDetails((prev) => !prev)}
          className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer flex items-center gap-0.5"
        >
          <span>Audit Criteria</span>
          <ChevronDown
            size={11}
            className={`transition-transform ${showShariahDetails ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Shariah Criteria Details Panel */}
      {showShariahDetails && (
        <div
          className="p-3 rounded-xl text-[11px] space-y-1.5"
          style={{
            background: '#0b0e14',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: theme.textSecondary,
          }}
        >
          <div className="font-semibold text-emerald-300 text-xs flex items-center gap-1">
            <Sparkles size={12} />
            Halalvest Shariah Screening Standards
          </div>
          <p className="leading-relaxed">
            All stocks in Halalvest are rigorously screened under <strong>AAOIFI</strong> and{' '}
            <strong>S&P Shariah</strong> methodologies. Excludes interest-bearing banking, gambling,
            alcohol, and non-halal media. Requires total debt to market cap &lt; 33%.
          </p>
          <div className="text-[10px] pt-1 text-slate-400 border-t border-slate-800">
            Current Asset: <strong>{selectedStock.name}</strong> •{' '}
            <span className="text-emerald-400">{selectedStock.complianceSummary}</span>
          </div>
        </div>
      )}

      {/* Stock Selection Bar */}
      <div>
        <label
          className="block mb-2 text-xs font-semibold"
          style={{ color: theme.textSecondary }}
        >
          Select Halal Stock
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {HALAL_STOCKS.map((stock) => {
            const isSelected = stock.symbol === selectedStock.symbol;
            return (
              <button
                key={stock.symbol}
                type="button"
                onClick={() => setSelectedStock(stock)}
                className="py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                style={{
                  background: isSelected ? 'rgba(218, 165, 32, 0.15)' : theme.inputBg,
                  border: isSelected
                    ? `1.5px solid ${theme.goldAccent}`
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  color: isSelected ? theme.goldAccent : '#cbd5e1',
                }}
              >
                <span>{stock.symbol}</span>
                <span className="text-[9px] text-emerald-400">✓</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Stock Overview Card */}
      <div
        className="p-3.5 rounded-2xl flex items-center justify-between"
        style={{
          background: theme.inputBg,
          border: `1px solid ${theme.goldBorder}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-extrabold text-sm text-[#daa520] overflow-hidden">
            <img
              src={selectedStock.icon}
              alt={selectedStock.symbol}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <span className="text-xs font-black">{selectedStock.symbol.slice(0, 3)}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{selectedStock.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Halal
              </span>
            </div>
            <div className="text-[11px]" style={{ color: theme.textSecondary }}>
              {selectedStock.sector}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-mono font-bold text-[#daa520]">
            {currentPrice ? `$${currentPrice.toLocaleString()}` : <RefreshCw size={12} className="animate-spin inline" />}
          </div>
          <div className="text-[10px] text-slate-400">Per Share</div>
        </div>
      </div>

      {/* Trade Direction Selector */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-[#0b0e14] border border-slate-800/80 rounded-2xl">
        <button
          type="button"
          onClick={() => setTradeMode('buy')}
          className="py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
          style={
            tradeMode === 'buy'
              ? { background: greenGradient, color: '#ffffff', border: 'none' }
              : { background: 'transparent', color: theme.textSecondary, border: 'none' }
          }
        >
          <span>Buy {selectedStock.symbol}</span>
        </button>
        <button
          type="button"
          onClick={() => setTradeMode('sell')}
          className="py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
          style={
            tradeMode === 'sell'
              ? { background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)' }
              : { background: 'transparent', color: theme.textSecondary, border: 'none' }
          }
        >
          <span>Sell {selectedStock.symbol}</span>
        </button>
      </div>

      {/* Amount Input */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-xs font-semibold" style={{ color: theme.textSecondary }}>
            {tradeMode === 'buy' ? 'Spend Amount (USDC)' : `Sell Amount (${selectedStock.symbol})`}
          </label>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <Wallet size={11} />
            <span>
              Available:{' '}
              <strong className="text-white">
                {tradeMode === 'buy'
                  ? `${userUsdcBalance.toFixed(2)} USDC`
                  : `${userStockBalance.toFixed(4)} ${selectedStock.symbol}`}
              </strong>
            </span>
          </div>
        </div>

        <div
          className="flex items-center p-3 rounded-2xl"
          style={{
            backgroundColor: theme.inputBg,
            border: '1px solid rgba(212, 175, 55, 0.3)',
          }}
        >
          <span className="text-lg font-bold text-slate-400 mr-2">
            {tradeMode === 'buy' ? '$' : '#'}
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50"
            className="w-full bg-transparent border-none outline-none text-white text-xl font-bold font-mono"
          />
          <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-800 text-amber-400 shrink-0">
            {tradeMode === 'buy' ? 'USDC' : selectedStock.symbol}
          </span>
        </div>

        {/* Quick Amount Presets */}
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {[25, 50, 100, 250].map((preset) => {
            const active = String(amount) === String(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className="py-1 text-xs rounded-lg font-semibold transition cursor-pointer"
                style={{
                  background: active ? 'rgba(218, 165, 32, 0.15)' : 'transparent',
                  color: active ? theme.goldAccent : '#94a3b8',
                  border: `1px solid ${active ? theme.goldAccent : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                ${preset}
              </button>
            );
          })}
        </div>
      </div>

      {/* Low Balance Warning / Deposit Prompt */}
      {authenticated && tradeMode === 'buy' && userUsdcBalance < parseFloat(amount || 0) && (
        <div
          className="p-3 rounded-xl flex items-center justify-between text-xs"
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            color: '#fcd34d',
          }}
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle size={14} className="shrink-0" />
            <span>Need more USDC to complete this trade?</span>
          </div>
          <button
            type="button"
            onClick={onSwitchToDeposit}
            className="px-2.5 py-1 rounded-lg font-bold text-[10px] cursor-pointer"
            style={{
              background: goldGradient,
              color: '#0b0e14',
            }}
          >
            Deposit USDC
          </button>
        </div>
      )}

      {/* Quote Preview */}
      <div
        className="p-3.5 rounded-xl text-xs space-y-2"
        style={{
          background: '#0b0e14',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          color: theme.textSecondary,
        }}
      >
        <div className="flex justify-between items-center">
          <span>You Receive (Estimated)</span>
          <span className="font-bold font-mono text-white text-sm">
            {quoteLoading ? (
              <RefreshCw size={12} className="animate-spin inline" />
            ) : estimatedOutput ? (
              `${estimatedOutput} ${tradeMode === 'buy' ? selectedStock.symbol : 'USDC'}`
            ) : (
              '--'
            )}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span>Routing & Liquidity</span>
          <span className="text-emerald-400 font-medium">Jupiter DEX Aggregator</span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span>Slippage Tolerance</span>
          <span className="font-mono text-white">0.50%</span>
        </div>
      </div>

      {/* Execution / Quote Error Box */}
      {(executionError || quoteError) && (
        <div
          className="p-3 rounded-xl flex items-start gap-2 text-xs"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
          }}
        >
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{executionError || quoteError}</span>
        </div>
      )}

      {/* Execute Trade Button */}
      <button
        type="button"
        onClick={handleExecuteTrade}
        disabled={isExecuting || quoteLoading || (!quote && authenticated)}
        className="w-full py-3.5 px-4 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99]"
        style={{
          background: authenticated ? (tradeMode === 'buy' ? greenGradient : goldGradient) : goldGradient,
          color: tradeMode === 'buy' && authenticated ? '#ffffff' : '#0b0e14',
          opacity: isExecuting || quoteLoading ? 0.7 : 1,
          boxShadow: '0 8px 24px -4px rgba(16, 185, 129, 0.3)',
        }}
      >
        {isExecuting ? (
          <>
            <RefreshCw size={14} className="animate-spin" />
            <span>{executionStep || 'Processing Trade...'}</span>
          </>
        ) : !authenticated ? (
          <>
            <span>Sign in to Trade {selectedStock.symbol}</span>
            <ArrowRight size={14} />
          </>
        ) : (
          <>
            <span>
              {tradeMode === 'buy'
                ? `Buy ${selectedStock.symbol} via Jupiter`
                : `Sell ${selectedStock.symbol} for USDC`}
            </span>
            <ArrowRight size={14} />
          </>
        )}
      </button>
    </div>
  );
}
