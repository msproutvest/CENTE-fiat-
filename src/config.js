import { Globe, CreditCard, Zap } from 'lucide-react';

export const config = {
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID || '',
  defaultAmount: 20,
  defaultToken: 'USDC',
  defaultNetwork: 'Solana',
  defaultCurrency: 'USD',
  
  // Solana SPL Stablecoin Mint Addresses (Mainnet) - Restricted to USDC
  solanaTokens: {
    USDC: {
      symbol: 'USDC',
      name: 'USD Coin',
      mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      chain: 'solana:mainnet',
    },
  },

  // Aurora Intent Cross-Chain Deposit Configuration
  aurora: {
    apiUrl: 'https://intents-api.aurora.dev',
    apiKey: import.meta.env.VITE_AURORA_INTENTS_API_KEY || '',
    networks: [
      {
        id: 'usdt-tron',
        symbol: 'USDT',
        networkName: 'TRON (TRC20)',
        depositChain: 'tron',
        protocol: 'TRC-20',
        badge: 'Lowest Fee',
        minDeposit: '$2',
        minDepositUsd: 2,
        estimatedArrival: '~1 min',
        destinationAsset: 'nep141:sol.omft.near',
        contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      },
      {
        id: 'btc-native',
        symbol: 'BTC',
        networkName: 'Bitcoin (Native)',
        depositChain: 'btc',
        protocol: 'Native SegWit',
        badge: 'Direct',
        minDeposit: '$1',
        minDepositUsd: 1,
        estimatedArrival: '~10-20 min',
        destinationAsset: 'nep141:sol.omft.near',
      },
    ],
  },

  logoUrl: 'https://app.gocente.com/assets/images/logo-latest-light.png',
};

export const theme = {
  fontFamily: '"Red Hat Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  greenPrimary: '#059669',
  greenSecondary: '#10b981',
  greenAccent: '#34d399',
  greenBorder: 'rgba(16, 185, 129, 0.25)',
  greenBorderActive: '#10b981',
  greenGlow: '0 0 16px rgba(16, 185, 129, 0.25)',
  cardBg: '#0e1714',
  inputBg: '#09100e',
  methodBg: 'rgba(9, 16, 14, 0.7)',
  methodSelectedBg: '#13231e',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
};

export const paymentMethods = [
  {
    id: 'stripe',
    name: 'Stripe',
    tag: 'Europe / US',
    subtitle: 'Cards, Apple Pay, Google Pay & bank transfers',
    icon: CreditCard,
  },
  {
    id: 'meld',
    name: 'Meld',
    tag: 'Global',
    subtitle: 'Transak, Swapped & 100+ local payment methods',
    icon: Globe,
  },
  {
    id: 'moonpay',
    name: 'MoonPay',
    tag: 'Popular',
    subtitle: 'Fast crypto purchase via cards & bank wire',
    icon: Zap,
  },
];
