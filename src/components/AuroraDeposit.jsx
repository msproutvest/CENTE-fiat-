import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
  Info,
} from 'lucide-react';
import { config } from '../config';
import { getAuroraDepositAddress, getAuroraDepositStatus } from '../services/auroraIntents';

export function AuroraDeposit({ solanaAddress, apiKey = config.aurora?.apiKey, onBack }) {
  const assets = config.cryptoDepositAssets || [];

  // 1. Coin / Asset selection (null by default - do not autopick)
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState(null);

  // 2. Network selection (null by default - do not autopick)
  const [selectedNetworkId, setSelectedNetworkId] = useState(null);

  const selectedAsset = useMemo(
    () => (selectedAssetSymbol ? assets.find((a) => a.symbol === selectedAssetSymbol) : null),
    [assets, selectedAssetSymbol]
  );

  const selectedNetwork = useMemo(
    () =>
      selectedAsset && selectedNetworkId
        ? selectedAsset.networks.find((n) => n.id === selectedNetworkId)
        : null,
    [selectedAsset, selectedNetworkId]
  );

  // Deposit address and QR states
  const [depositAddress, setDepositAddress] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [deposits, setDeposits] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch or generate deposit address once both asset and network are chosen
  useEffect(() => {
    let isMounted = true;

    async function loadAddress() {
      if (!solanaAddress || !selectedNetwork || !selectedAsset) return;

      // Special Case: Direct Solana SPL deposit
      if (selectedNetwork.isDirectSolana) {
        setDepositAddress(solanaAddress);
        setError(null);
        setLoading(false);
        try {
          const dataUrl = await QRCode.toDataURL(solanaAddress, {
            width: 180,
            margin: 1,
            color: { dark: '#10b981', light: '#09120e' },
          });
          if (isMounted) setQrCodeDataUrl(dataUrl);
        } catch (qrErr) {
          console.warn('[Deposit] QR generation error:', qrErr);
        }
        return;
      }

      if (!apiKey) {
        setError('Deposit service key is not configured.');
        return;
      }

      setLoading(true);
      setError(null);
      setDepositAddress('');
      setQrCodeDataUrl('');

      try {
        const res = await getAuroraDepositAddress({
          depositChain: selectedNetwork.depositChain,
          recipient: solanaAddress,
          destinationAsset: selectedNetwork.destinationAsset || 'nep141:sol.omft.near',
          apiKey,
        });

        if (!isMounted) return;

        if (res?.depositAddress) {
          setDepositAddress(res.depositAddress);

          try {
            const dataUrl = await QRCode.toDataURL(res.depositAddress, {
              width: 180,
              margin: 1,
              color: { dark: '#10b981', light: '#09120e' },
            });
            if (isMounted) setQrCodeDataUrl(dataUrl);
          } catch (qrErr) {
            console.warn('[Deposit] QR generation error:', qrErr);
          }
        } else {
          setError('Could not generate deposit address. Please try another network.');
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err?.message || 'Failed to generate deposit address. Please try another network.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAddress();

    return () => {
      isMounted = false;
    };
  }, [selectedNetworkId, selectedAssetSymbol, solanaAddress, apiKey]);

  // Status polling for incoming deposits
  const checkStatus = async () => {
    if (!depositAddress || !apiKey || selectedNetwork?.isDirectSolana) return;
    setIsRefreshing(true);
    try {
      const res = await getAuroraDepositStatus({ depositAddress, apiKey });
      if (res?.success && Array.isArray(res?.deposits)) {
        setDeposits(res.deposits);
      }
    } catch {}
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (!depositAddress || selectedNetwork?.isDirectSolana) return;

    checkStatus();
    const interval = setInterval(checkStatus, 8000);
    return () => clearInterval(interval);
  }, [depositAddress, selectedNetworkId]);

  const handleCopy = async () => {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = depositAddress;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // STEP 1: ASK USER FOR THE ASSET FIRST (No autopick)
  if (!selectedAsset) {
    return (
      <div className="space-y-3 text-white">
        <div>
          <h4 className="text-sm font-bold text-white">Select Coin</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Choose the cryptocurrency you want to deposit
          </p>
        </div>

        <div className="space-y-2 pt-1">
          {assets.map((asset) => (
            <button
              key={asset.symbol}
              type="button"
              onClick={() => {
                setSelectedAssetSymbol(asset.symbol);
                setSelectedNetworkId(null);
                setError(null);
              }}
              className="w-full p-3 rounded-2xl bg-[#09120e] border border-emerald-500/20 hover:border-emerald-500/50 hover:bg-[#0c1913] transition flex items-center justify-between cursor-pointer text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-950/60 border border-emerald-500/25 flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={asset.icon}
                    alt={asset.symbol}
                    className="w-5 h-5 object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
                <div>
                  <div className="font-extrabold text-sm text-white group-hover:text-emerald-300 transition">
                    {asset.symbol}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">{asset.name}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-semibold">
                  {asset.networks?.length} {asset.networks?.length === 1 ? 'network' : 'networks'}
                </span>
                <ChevronRight
                  size={16}
                  className="text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition"
                />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // STEP 2: ASK USER FOR THE NETWORK NEXT (No autopick)
  if (!selectedNetwork) {
    return (
      <div className="space-y-3 text-white">
        {/* Back to coins button + active coin indicator */}
        <div className="flex items-center justify-between pb-2 border-b border-emerald-500/15">
          <button
            type="button"
            onClick={() => {
              setSelectedAssetSymbol(null);
              setSelectedNetworkId(null);
              setError(null);
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Back to Coins</span>
          </button>
          <div className="flex items-center gap-2">
            <img src={selectedAsset.icon} alt={selectedAsset.symbol} className="w-4 h-4 object-contain" />
            <span className="text-xs font-bold text-white">{selectedAsset.symbol}</span>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-bold text-white">Select Network</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Ensure your withdrawal network matches the deposit network
          </p>
        </div>

        <div className="space-y-2 pt-1">
          {selectedAsset.networks?.map((net) => (
            <button
              key={net.id}
              type="button"
              onClick={() => {
                setSelectedNetworkId(net.id);
                setError(null);
              }}
              className="w-full p-3 rounded-2xl bg-[#09120e] border border-emerald-500/20 hover:border-emerald-500/50 hover:bg-[#0c1913] transition flex items-center justify-between cursor-pointer text-left group"
            >
              <div className="min-w-0 pr-2">
                <div className="font-bold text-xs text-white flex items-center gap-2 group-hover:text-emerald-300 transition">
                  <span>{net.networkName}</span>
                  {net.badge && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {net.badge}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Protocol: {net.protocol} • Min: {net.minDeposit} • Arrival: {net.estimatedArrival}
                </div>
              </div>

              <ChevronRight
                size={16}
                className="text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition shrink-0"
              />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // STEP 3: BOTH SELECTED — ONLY ADDRESS SCAN, INSTRUCTIONS & BACK BUTTON (No long page, no dropdowns)
  return (
    <div className="space-y-3.5 text-white">
      {/* Top Header: Back Button + Selected Pair indicator */}
      <div className="flex items-center justify-between pb-2 border-b border-emerald-500/15">
        <button
          type="button"
          onClick={() => {
            setSelectedNetworkId(null);
            setDepositAddress('');
            setQrCodeDataUrl('');
            setError(null);
          }}
          className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          <img src={selectedAsset.icon} alt={selectedAsset.symbol} className="w-4 h-4 object-contain" />
          <span className="text-xs font-extrabold text-white">{selectedAsset.symbol}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/25">
            {selectedNetwork.protocol}
          </span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-[#09120e] border border-emerald-500/20">
          <RefreshCw size={24} className="animate-spin mb-3 text-emerald-400" />
          <p className="text-xs text-slate-400 text-center">
            Generating {selectedAsset.symbol} ({selectedNetwork.networkName}) deposit address...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-4 rounded-xl flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 text-red-400 text-xs">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold mb-1">Deposit Address Unavailable</p>
            <p className="text-[11px] opacity-90 mb-2">{error}</p>
            <button
              type="button"
              onClick={() => setSelectedNetworkId(null)}
              className="text-[11px] font-bold text-emerald-400 underline hover:text-emerald-300"
            >
              Choose another network
            </button>
          </div>
        </div>
      )}

      {/* Address Scan, Deposit Address & Instructions */}
      {depositAddress && !loading && (
        <div className="space-y-3">
          {/* Address Scan: QR Code */}
          <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-[#09120e] border border-emerald-500/25">
            <div className="p-2 rounded-xl bg-[#060c09] border border-emerald-500/30 shadow-lg">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt={`${selectedAsset.symbol} Deposit QR`}
                  className="w-36 h-36 rounded-lg select-none"
                />
              ) : (
                <div className="w-36 h-36 rounded-lg flex items-center justify-center text-xs text-slate-400">
                  QR loading...
                </div>
              )}
            </div>
            <span className="text-[11px] mt-2 text-slate-400 text-center">
              Scan with your {selectedAsset.symbol} ({selectedNetwork.protocol}) wallet
            </span>
          </div>

          {/* Deposit Address Box */}
          <div className="p-3 rounded-2xl bg-[#09120e] border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px] font-semibold">
                {selectedAsset.symbol} Deposit Address
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                <ShieldCheck size={11} /> Verified
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#060c09] border border-emerald-500/20 font-mono text-xs text-white break-all select-all font-semibold leading-relaxed">
              {depositAddress}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="w-full py-2.5 px-3 rounded-xl font-bold text-xs cursor-pointer transition flex items-center justify-center gap-2 text-white"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 4px 14px -2px rgba(16, 185, 129, 0.4)',
              }}
            >
              {copied ? (
                <>
                  <Check size={14} />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy Address</span>
                </>
              )}
            </button>
          </div>

          {/* Instructions */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200/90 leading-relaxed">
            Send only <strong className="text-white font-bold">{selectedAsset.symbol}</strong> via the{' '}
            <strong className="text-white font-bold">{selectedNetwork.networkName} ({selectedNetwork.protocol})</strong>{' '}
            network to this address. Sending any other asset may result in permanent loss.
          </div>

          {/* Specifications Table */}
          <div className="p-3 rounded-xl bg-[#060c09] border border-emerald-500/20 text-[11px] space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Minimum Deposit</span>
              <span className="font-bold text-white">{selectedNetwork.minDeposit || '$2'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Expected Arrival</span>
              <span className="font-bold text-emerald-400">{selectedNetwork.estimatedArrival || '~1 min'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Network Standard</span>
              <span className="font-bold text-white">{selectedNetwork.protocol}</span>
            </div>
          </div>

          {/* Deposit Detection Bar */}
          <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-300 text-[11px]">
                {deposits.length > 0 ? `${deposits.length} Deposit(s) Detected` : 'Listening for incoming deposits...'}
              </span>
            </div>
            <button
              type="button"
              onClick={checkStatus}
              disabled={isRefreshing}
              className="text-slate-400 hover:text-emerald-400 text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={11} className={isRefreshing ? 'animate-spin text-emerald-400' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Detected Deposits List */}
          {deposits.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Recent Deposits
              </span>
              {deposits.map((dep, idx) => (
                <div
                  key={dep.id || idx}
                  className="p-2.5 rounded-xl bg-[#060c09] border border-emerald-500/25 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-white">
                      {dep.amount || 'Deposit'} {selectedAsset.symbol}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {dep.status || 'Processing'}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    {dep.status || 'Success'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AuroraDeposit;
