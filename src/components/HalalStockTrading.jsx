import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
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
  Search,
  Check,
} from 'lucide-react';
import { HALAL_STOCKS, SOLANA_USDC_MINT } from '../data/halalStocks';
import {
  getJupiterStockQuote,
  getJupiterStockSwapTransaction,
  fetchStockPriceUsd,
  fetchTokenBalance,
  executeSolanaSwapTransaction,
} from '../services/jupiterSwap';

const halalGreenGradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
const halalGreen = '#10b981';

/**
 * Clean Stock Logo with non-overlapping fallback
 */
function StockLogo({ stock, size = 34 }) {
  const [hasError, setHasError] = useState(false);

  return (
    <div
      className="rounded-xl flex items-center justify-center font-bold overflow-hidden shrink-0 border border-emerald-500/25 bg-[#08120e]"
      style={{ width: size, height: size }}
    >
      {!hasError && stock.icon ? (
        <img
          src={stock.icon}
          alt={stock.symbol}
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <span
          className="font-black text-emerald-400"
          style={{ fontSize: Math.max(10, Math.floor(size * 0.35)) }}
        >
          {stock.symbol.slice(0, 3)}
        </span>
      )}
    </div>
  );
}

export function HalalStockTrading({
  solanaAddress,
  solWallet,
  authenticated,
  onRequireLogin,
  onSwitchToDeposit,
}) {
  // Navigation view: 'list' (catalog with Trade buttons) | 'trade' (trade details)
  const [view, setView] = useState('list');
  const [selectedStock, setSelectedStock] = useState(HALAL_STOCKS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Trade form states
  const [tradeMode, setTradeMode] = useState('buy'); // 'buy' | 'sell'
  const [amount, setAmount] = useState('50');
  const [stockPrices, setStockPrices] = useState(() => {
    const map = {};
    HALAL_STOCKS.forEach((s) => {
      map[s.symbol] = s.referencePriceUsd || 100;
    });
    return map;
  });
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

  // Categories for filtering
  const categories = ['All', 'Technology', 'Semiconductors', 'Payments', 'Energy', 'Consumer'];

  const filteredStocks = useMemo(() => {
    return HALAL_STOCKS.filter((s) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (selectedCategory === 'All') return true;
      if (selectedCategory === 'Technology') {
        return s.sector.toLowerCase().includes('technology') || s.sector.toLowerCase().includes('software');
      }
      if (selectedCategory === 'Semiconductors') {
        return s.sector.toLowerCase().includes('semiconductor') || s.sector.toLowerCase().includes('chips');
      }
      if (selectedCategory === 'Payments') {
        return s.sector.toLowerCase().includes('payment');
      }
      if (selectedCategory === 'Energy') {
        return s.sector.toLowerCase().includes('oil') || s.sector.toLowerCase().includes('energy');
      }
      if (selectedCategory === 'Consumer') {
        return (
          s.sector.toLowerCase().includes('beverage') ||
          s.sector.toLowerCase().includes('food') ||
          s.sector.toLowerCase().includes('apparel')
        );
      }
      return true;
    });
  }, [searchQuery, selectedCategory]);

  // Fetch live price for selected stock
  useEffect(() => {
    let isMounted = true;
    async function loadPrice() {
      const price = await fetchStockPriceUsd(
        selectedStock.mint,
        selectedStock.decimals,
        selectedStock.referencePriceUsd
      );
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

  // Debounced quote fetching with AbortController and rate-limit smoothing
  useEffect(() => {
    if (view !== 'trade') return;

    let isMounted = true;
    const abortCtrl = new AbortController();

    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setQuote(null);
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);

    const timer = setTimeout(async () => {
      try {
        let inputMint, outputMint, rawAmount;

        if (tradeMode === 'buy') {
          inputMint = SOLANA_USDC_MINT;
          outputMint = selectedStock.mint;
          rawAmount = Math.round(val * 10 ** 6);
        } else {
          inputMint = selectedStock.mint;
          outputMint = SOLANA_USDC_MINT;
          rawAmount = Math.round(val * 10 ** selectedStock.decimals);
        }

        const q = await getJupiterStockQuote({
          inputMint,
          outputMint,
          amountRaw: rawAmount,
          slippageBps: 50,
          signal: abortCtrl.signal,
        });

        if (isMounted) {
          setQuote(q);
          setQuoteError(null);

          // Update stock price from the quote directly
          if (q?.outAmount) {
            let derived = null;
            if (tradeMode === 'buy') {
              const shares = Number(q.outAmount) / 10 ** selectedStock.decimals;
              if (shares > 0) derived = Number((val / shares).toFixed(2));
            } else {
              const usdc = Number(q.outAmount) / 10 ** 6;
              if (val > 0) derived = Number((usdc / val).toFixed(2));
            }
            if (derived) {
              setStockPrices((prev) => ({ ...prev, [selectedStock.symbol]: derived }));
            }
          }
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (isMounted) {
          setQuote(null);
          const rawMsg = String(err?.message || '');
          if (rawMsg.toLowerCase().includes('too many requests') || rawMsg.includes('429')) {
            setQuoteError('Market is busy, retrying in a moment...');
          } else {
            setQuoteError(rawMsg || 'No trade route available for this asset.');
          }
        }
      } finally {
        if (isMounted) setQuoteLoading(false);
      }
    }, 650);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      abortCtrl.abort();
    };
  }, [amount, selectedStock, tradeMode, view]);

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
  }, [quote, tradeMode, selectedStock]);

  const handleOpenTrade = (stock) => {
    setSelectedStock(stock);
    setQuote(null);
    setQuoteError(null);
    setExecutionError(null);
    setView('trade');
  };

  const handleExecuteTrade = async () => {
    if (!authenticated) {
      if (onRequireLogin) onRequireLogin();
      return;
    }

    if (!solanaAddress) {
      setExecutionError('Solana wallet not connected.');
      return;
    }

    if (!quote) {
      setExecutionError('Please wait for trade quote to load.');
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionStep('Preparing trade transaction...');

    try {
      const swapRes = await getJupiterStockSwapTransaction({
        userPublicKey: solanaAddress,
        quoteResponse: quote,
      });

      if (!swapRes?.swapTransaction) {
        throw new Error('Routing service did not return a valid swap transaction.');
      }

      setExecutionStep('Confirming trade in your wallet...');

      const txHash = await executeSolanaSwapTransaction({
        solWallet,
        swapTransactionBase64: swapRes.swapTransaction,
      });

      setTradeSuccess({
        txHash,
        mode: tradeMode,
        symbol: selectedStock.symbol,
        stockName: selectedStock.name,
        amountUsdc: tradeMode === 'buy' ? amount : estimatedOutput,
        shares: tradeMode === 'buy' ? estimatedOutput : amount,
      });

      refreshBalances();
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('User rejected') || err?.name === 'UserRejectedRequestError') {
        setExecutionError('Trade was cancelled by user.');
      } else {
        setExecutionError(msg || 'Failed to execute trade.');
      }
    } finally {
      setIsExecuting(false);
      setExecutionStep('');
    }
  };

  // ---------------------------------------------------------------------
  // VIEW: TRADE SUCCESS SCREEN
  // ---------------------------------------------------------------------
  if (tradeSuccess) {
    return (
      <div className="p-6 rounded-2xl text-center space-y-4 bg-[#0a1410] border border-emerald-500/30 text-white">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
          <CheckCircle2 size={32} />
        </div>

        <div>
          <h3 className="text-base font-extrabold text-white">Stock Trade Executed!</h3>
          <p className="text-xs text-emerald-400 font-medium mt-1">
            Settled on Solana Mainnet
          </p>
        </div>

        <div className="p-4 rounded-xl text-left space-y-2 text-xs bg-[#060c09] border border-emerald-500/20">
          <div className="flex justify-between">
            <span className="text-slate-400">Asset</span>
            <span className="font-bold text-white">
              {tradeSuccess.stockName} ({tradeSuccess.symbol})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">
              {tradeSuccess.mode === 'buy' ? 'Shares Acquired' : 'Shares Sold'}
            </span>
            <span className="font-bold text-emerald-400 font-mono">
              {tradeSuccess.shares} {tradeSuccess.symbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Total Value</span>
            <span className="font-bold text-white">${tradeSuccess.amountUsdc} USDC</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-emerald-950">
            <span className="text-slate-400">Transaction</span>
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
            setView('list');
            refreshBalances();
          }}
          className="w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition text-white"
          style={{
            background: halalGreenGradient,
            border: 'none',
          }}
        >
          Trade More Halal Stocks
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // VIEW 1: STOCKS LIST PAGE (Shows all 21 stocks with Trade button side)
  // ---------------------------------------------------------------------
  if (view === 'list') {
    return (
      <div className="space-y-3.5 text-white">
        {/* Shariah Compliance Header Badge */}
        <div className="p-3 rounded-2xl flex items-center justify-between bg-emerald-950/30 border border-emerald-500/25">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <span>Shariah-Screened Equities</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full font-semibold bg-emerald-500/20 text-emerald-300">
                  21 Stocks
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                AAOIFI & S&P Shariah Standards • Solana Mainnet
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by symbol, company, or sector..."
            className="w-full bg-[#09120e] border border-emerald-500/25 focus:border-emerald-500 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSelectedCategory(c)}
              className={`px-3 py-1 rounded-lg shrink-0 font-medium transition cursor-pointer ${
                selectedCategory === c
                  ? 'bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/20'
                  : 'bg-emerald-950/40 text-slate-300 hover:text-white border border-emerald-500/20'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* All Stocks List with Trade Button Side-by-Side */}
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-0.5">
          {filteredStocks.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 bg-[#09120e] rounded-2xl border border-emerald-500/20">
              No Halal stocks match your search.
            </div>
          ) : (
            filteredStocks.map((stock) => {
              const price = stockPrices[stock.symbol] || stock.referencePriceUsd;
              return (
                <div
                  key={stock.symbol}
                  className="p-3 rounded-2xl bg-[#09120e] border border-emerald-500/20 hover:border-emerald-500/40 transition flex items-center justify-between gap-3 group"
                >
                  {/* Stock Info */}
                  <div
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    onClick={() => handleOpenTrade(stock)}
                  >
                    <StockLogo stock={stock} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-white group-hover:text-emerald-300 transition">
                          {stock.symbol}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Halal
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 truncate max-w-[170px]">
                        {stock.name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {stock.sector}
                      </div>
                    </div>
                  </div>

                  {/* Price & Trade Button Side-by-Side */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-emerald-400">
                        ${price ? Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                      </div>
                      <div className="text-[10px] text-slate-500">Per Share</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenTrade(stock)}
                      className="py-1.5 px-3 rounded-xl font-bold text-xs cursor-pointer transition flex items-center gap-1 text-white shadow-md active:scale-95"
                      style={{
                        background: halalGreenGradient,
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      <span>Trade</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // VIEW 2: TRADE DETAILS PAGE (Opened on clicking Trade)
  // ---------------------------------------------------------------------
  const currentPrice = stockPrices[selectedStock.symbol] || selectedStock.referencePriceUsd;

  return (
    <div className="space-y-4 text-white">
      {/* Back to Stock List Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setView('list');
            setQuote(null);
            setQuoteError(null);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-emerald-400 cursor-pointer transition"
        >
          <ArrowLeft size={14} />
          <span>Back to All Stocks</span>
        </button>
        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
          <ShieldCheck size={11} /> Shariah Compliant
        </span>
      </div>

      {/* Selected Stock Overview Card */}
      <div className="p-3.5 rounded-2xl bg-[#09120e] border border-emerald-500/30 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <StockLogo stock={selectedStock} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base text-white">{selectedStock.symbol}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Halal Certified
              </span>
            </div>
            <div className="text-xs text-slate-300 truncate max-w-[200px]">
              {selectedStock.name}
            </div>
            <div className="text-[10px] text-slate-400">
              {selectedStock.sector}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0 ml-2">
          <div className="text-sm font-mono font-bold text-emerald-400">
            ${currentPrice ? Number(currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
          </div>
          <div className="text-[10px] text-slate-500">Per Share</div>
        </div>
      </div>

      {/* Compact Shariah Screening Summary */}
      <div className="p-2.5 rounded-xl text-[11px] space-y-1 bg-[#060c09] border border-emerald-500/25 text-slate-300">
        <div className="font-semibold text-emerald-400 text-xs flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Sparkles size={11} />
            AAOIFI & S&P Shariah Certified
          </span>
          <button
            type="button"
            onClick={() => setShowShariahDetails((prev) => !prev)}
            className="text-[10px] text-slate-400 hover:text-emerald-400 cursor-pointer"
          >
            {showShariahDetails ? 'Less' : 'Details'}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 leading-normal">
          Zero interest banking, gambling, or alcohol. Total debt &lt; 33%.
        </p>
        {showShariahDetails && (
          <div className="text-[10px] pt-1 text-slate-400 border-t border-emerald-950/60">
            Compliance Note: <span className="text-emerald-400">{selectedStock.complianceSummary}</span>
          </div>
        )}
      </div>

      {/* Trade Direction Selector (Buy / Sell) */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-[#060c09] border border-emerald-500/20 rounded-2xl">
        <button
          type="button"
          onClick={() => setTradeMode('buy')}
          className="py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
          style={
            tradeMode === 'buy'
              ? { background: halalGreenGradient, color: '#ffffff', border: 'none', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }
              : { background: 'transparent', color: '#94a3b8', border: 'none' }
          }
        >
          <span>Buy {selectedStock.symbol}</span>
        </button>
        <button
          type="button"
          onClick={() => setTradeMode('sell')}
          className="py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
          style={
            tradeMode === 'sell'
              ? { background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)' }
              : { background: 'transparent', color: '#94a3b8', border: 'none' }
          }
        >
          <span>Sell {selectedStock.symbol}</span>
        </button>
      </div>

      {/* Amount Input */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-xs font-semibold text-slate-300">
            {tradeMode === 'buy' ? 'Investment Amount (USDC)' : `Sell Amount (${selectedStock.symbol})`}
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

        <div className="flex items-center p-3 rounded-2xl bg-[#060c09] border border-emerald-500/30 focus-within:border-emerald-500 transition">
          <span className="text-lg font-bold text-slate-400 mr-2">
            $
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
          <span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 shrink-0">
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
                  background: active ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  color: active ? '#34d399' : '#94a3b8',
                  border: `1px solid ${active ? '#10b981' : 'rgba(16, 185, 129, 0.15)'}`,
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
        <div className="p-3 rounded-xl flex items-center justify-between text-xs bg-amber-500/10 border border-amber-500/25 text-amber-300">
          <div className="flex items-center gap-1.5">
            <AlertCircle size={14} className="shrink-0" />
            <span>Need more USDC to complete this trade?</span>
          </div>
          <button
            type="button"
            onClick={onSwitchToDeposit}
            className="px-2.5 py-1 rounded-lg font-bold text-[10px] cursor-pointer text-white"
            style={{
              background: halalGreenGradient,
            }}
          >
            Deposit USDC
          </button>
        </div>
      )}

      {/* Quote Preview */}
      <div className="p-3.5 rounded-2xl text-xs space-y-2 bg-[#060c09] border border-emerald-500/20 text-slate-300">
        <div className="flex justify-between items-center">
          <span>You Receive (Estimated)</span>
          <span className="font-bold font-mono text-white text-sm">
            {quoteLoading ? (
              <RefreshCw size={12} className="animate-spin inline text-emerald-400" />
            ) : estimatedOutput ? (
              `${estimatedOutput} ${tradeMode === 'buy' ? selectedStock.symbol : 'USDC'}`
            ) : (
              '--'
            )}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span>Routing & Settlement</span>
          <span className="text-emerald-400 font-medium">Optimal Market Execution (Solana)</span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span>Slippage Tolerance</span>
          <span className="font-mono text-white">0.50%</span>
        </div>
      </div>

      {/* Execution / Quote Error Box */}
      {(executionError || quoteError) && (
        <div className="p-3 rounded-xl flex items-start gap-2 text-xs bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{executionError || quoteError}</span>
        </div>
      )}

      {/* Execute Trade Button */}
      <button
        type="button"
        onClick={handleExecuteTrade}
        disabled={isExecuting || quoteLoading || (!quote && authenticated)}
        className="w-full py-3.5 px-4 rounded-xl font-extrabold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99] text-white"
        style={{
          background: halalGreenGradient,
          opacity: isExecuting || quoteLoading ? 0.7 : 1,
          boxShadow: '0 8px 24px -4px rgba(16, 185, 129, 0.4)',
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
                ? `Buy ${selectedStock.symbol}`
                : `Sell ${selectedStock.symbol} for USDC`}
            </span>
            <ArrowRight size={14} />
          </>
        )}
      </button>
    </div>
  );
}

export default HalalStockTrading;
