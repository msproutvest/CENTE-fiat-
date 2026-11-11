import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Zap,
  Clock,
  ArrowRight,
  CircleCheck,
} from 'lucide-react';
import { config, theme } from '../config';
import { getAuroraDepositAddress, getAuroraDepositStatus } from '../services/auroraIntents';

export function AuroraDeposit({ solanaAddress, apiKey = config.aurora?.apiKey, onBack }) {
  const networks = config.aurora?.networks || [];
  const [selectedNetworkId, setSelectedNetworkId] = useState(networks[0]?.id || 'usdt-tron');
  const [depositAddress, setDepositAddress] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [deposits, setDeposits] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const selectedNetwork =
    networks.find((n) => n.id === selectedNetworkId) || networks[0];

  // Fetch or generate persistent deposit address whenever network or solana address changes
  useEffect(() => {
    let isMounted = true;

    async function loadAddress() {
      if (!solanaAddress || !selectedNetwork) return;

      if (!apiKey) {
        setError('Aurora Intent API key is not configured. Please set VITE_AURORA_INTENTS_API_KEY in your environment.');
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

          // Generate QR code client-side
          try {
            const dataUrl = await QRCode.toDataURL(res.depositAddress, {
              width: 200,
              margin: 1,
              color: {
                dark: '#daa520',
                light: '#0b0e14',
              },
            });
            if (isMounted) setQrCodeDataUrl(dataUrl);
          } catch (qrErr) {
            console.warn('[AuroraDeposit] QR code generation error:', qrErr);
          }
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err?.message || 'Failed to generate deposit address. Please try again.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAddress();

    return () => {
      isMounted = false;
    };
  }, [selectedNetworkId, solanaAddress]);

  // Status polling for incoming deposits
  const checkStatus = async () => {
    if (!depositAddress || !apiKey) return;
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
    if (!depositAddress) return;

    checkStatus();
    const interval = setInterval(checkStatus, 7000);
    return () => clearInterval(interval);
  }, [depositAddress]);

  const handleCopy = async () => {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
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

  return (
    <div className="space-y-4" style={{ fontFamily: theme.fontFamily }}>
      {/* Network / Asset Selector Tabs */}
      <div>
        <label
          className="block text-xs font-semibold mb-2"
          style={{ color: theme.textSecondary }}
        >
          Select Deposit Asset & Network
        </label>
        <div className="grid grid-cols-2 gap-2">
          {networks.map((net) => {
            const isSelected = net.id === selectedNetworkId;
            return (
              <button
                key={net.id}
                type="button"
                onClick={() => setSelectedNetworkId(net.id)}
                className="p-3 rounded-xl text-left transition flex flex-col justify-between"
                style={{
                  background: isSelected ? theme.methodSelectedBg : theme.methodBg,
                  border: isSelected
                    ? `1.5px solid ${theme.goldAccent}`
                    : `1px solid rgba(255, 255, 255, 0.08)`,
                  boxShadow: isSelected ? theme.goldGlow : 'none',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="font-bold text-xs"
                    style={{ color: isSelected ? theme.goldAccent : theme.textPrimary }}
                  >
                    {net.symbol}
                  </span>
                  {net.badge && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: isSelected ? 'rgba(218, 165, 32, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                        color: isSelected ? '#fcd34d' : theme.textSecondary,
                      }}
                    >
                      {net.badge}
                    </span>
                  )}
                </div>
                <div className="text-[11px]" style={{ color: theme.textSecondary }}>
                  {net.protocol}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          className="flex flex-col items-center justify-center p-8 rounded-2xl"
          style={{
            background: theme.inputBg,
            border: `1px solid ${theme.goldBorder}`,
          }}
        >
          <RefreshCw
            size={24}
            className="animate-spin mb-3"
            style={{ color: theme.goldAccent }}
          />
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            Generating personal deposit address via Aurora Intent...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div
          className="p-4 rounded-xl flex items-start gap-2.5"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#f87171',
            fontSize: '12px',
          }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold mb-1">Deposit Address Unavailable</p>
            <p className="text-[11px] opacity-90">{error}</p>
            <button
              type="button"
              onClick={() => setSelectedNetworkId((prev) => prev)}
              className="mt-2 text-[11px] font-bold underline cursor-pointer"
              style={{ color: theme.goldAccent }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Address & QR Code View */}
      {depositAddress && !loading && (
        <div className="space-y-3">
          {/* QR Code Container */}
          <div
            className="flex flex-col items-center justify-center p-4 rounded-2xl"
            style={{
              background: theme.inputBg,
              border: `1px solid ${theme.goldBorder}`,
            }}
          >
            <div
              className="p-2 rounded-xl"
              style={{
                background: '#0b0e14',
                border: `1px solid ${theme.goldBorder}`,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              }}
            >
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt={`${selectedNetwork.symbol} Deposit QR`}
                  className="w-36 h-36 rounded-lg select-none"
                />
              ) : (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                    depositAddress
                  )}&bgcolor=0b0e14&color=daa520&margin=3`}
                  alt="Deposit QR"
                  className="w-36 h-36 rounded-lg select-none"
                />
              )}
            </div>
            <span
              className="text-[11px] mt-2.5 font-medium"
              style={{ color: theme.textSecondary }}
            >
              Scan with your {selectedNetwork.symbol} wallet
            </span>
          </div>

          {/* Address Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs px-0.5">
              <span className="font-semibold" style={{ color: theme.textSecondary }}>
                Your {selectedNetwork.protocol} Deposit Address
              </span>
              <span
                className="text-[10px] font-medium flex items-center gap-1"
                style={{ color: '#4ade80' }}
              >
                <ShieldCheck size={12} /> Auto-Swaps to Solana
              </span>
            </div>

            <div
              className="flex items-center gap-2 p-3 rounded-xl"
              style={{
                background: theme.inputBg,
                border: `1px solid rgba(212, 175, 55, 0.3)`,
              }}
            >
              <code
                className="flex-1 font-mono text-[11px] break-all select-all font-semibold leading-relaxed"
                style={{ color: theme.goldAccent }}
              >
                {depositAddress}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 rounded-lg transition shrink-0 active:scale-95 flex items-center justify-center cursor-pointer"
                style={{
                  background: copied ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                  color: copied ? '#4ade80' : theme.textPrimary,
                  border: copied ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                }}
                title="Copy address"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Details / Instructions Panel */}
          <div
            className="p-3.5 rounded-xl text-[11px] space-y-2"
            style={{
              background: 'rgba(11, 14, 20, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              color: theme.textSecondary,
            }}
          >
            <div className="flex justify-between items-center">
              <span>Network</span>
              <span className="font-semibold" style={{ color: theme.textPrimary }}>
                {selectedNetwork.networkName}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Minimum Deposit</span>
              <span className="font-semibold" style={{ color: theme.goldAccent }}>
                {selectedNetwork.minDeposit}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Arrival Time</span>
              <span className="flex items-center gap-1 font-semibold" style={{ color: theme.textPrimary }}>
                <Clock size={11} /> {selectedNetwork.estimatedArrival}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Delivery Recipient</span>
              <span
                className="font-mono text-[10px] font-semibold"
                style={{ color: theme.goldAccent }}
              >
                {solanaAddress ? `${solanaAddress.slice(0, 4)}...${solanaAddress.slice(-4)}` : 'Solana Wallet'}
              </span>
            </div>
          </div>

          {/* Live Status Tracker */}
          <div
            className="p-3 rounded-xl flex items-center justify-between text-xs"
            style={{
              background: 'rgba(11, 14, 20, 0.8)',
              border: '1px solid rgba(212, 175, 55, 0.15)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px]" style={{ color: theme.textSecondary }}>
                Listening for incoming deposits...
              </span>
            </div>
            <button
              type="button"
              onClick={checkStatus}
              disabled={isRefreshing}
              className="text-[10px] font-semibold flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition hover:opacity-80"
              style={{
                color: theme.goldAccent,
                background: 'rgba(218, 165, 32, 0.1)',
                border: '1px solid rgba(218, 165, 32, 0.2)',
              }}
            >
              <RefreshCw size={10} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Incoming Activity / History if detected */}
          {deposits.length > 0 && (
            <div
              className="p-3 rounded-xl space-y-2"
              style={{
                background: 'rgba(16, 20, 29, 0.95)',
                border: '1px solid rgba(74, 222, 128, 0.3)',
              }}
            >
              <div className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: '#4ade80' }}>
                <CircleCheck size={13} />
                Recent Deposit Activity
              </div>
              {deposits.slice(0, 3).map((dep, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-[11px] py-1 border-t border-white/5"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-white">
                      {dep.amount ? `${dep.amount} ` : ''}{dep.asset}
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded capitalize font-medium"
                      style={{
                        background: dep.status === 'success' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(250, 204, 21, 0.2)',
                        color: dep.status === 'success' ? '#4ade80' : '#facc15',
                      }}
                    >
                      {dep.status}
                    </span>
                  </div>
                  {dep.txHash && (
                    <span className="font-mono text-[9px] text-gray-400">
                      {dep.txHash.slice(0, 6)}...{dep.txHash.slice(-4)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Safety Notice */}
          <div
            className="p-2.5 rounded-xl flex items-center gap-2 text-[10px]"
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              color: '#fcd34d',
            }}
          >
            <AlertTriangle size={13} className="shrink-0" />
            <span>
              Send only <strong>{selectedNetwork.symbol}</strong> via <strong>{selectedNetwork.protocol}</strong>. Min deposit {selectedNetwork.minDeposit}. Deposits are automatically swapped and delivered directly to your Solana wallet.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
