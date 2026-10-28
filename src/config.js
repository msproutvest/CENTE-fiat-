import { Globe, CreditCard, Zap } from 'lucide-react';

export const config = {
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID || '',
  defaultAmount: 20,
  defaultToken: 'USDC',
  defaultNetwork: 'Solana',
  defaultCurrency: 'USD',
  
  // Solana SPL Stablecoin Mint Addresses (Mainnet)
  solanaTokens: {
    USDC: {
      symbol: 'USDC',
      name: 'USD Coin',
      mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      chain: 'solana:mainnet',
    },
    USDT: {
      symbol: 'USDT',
      name: 'Tether USD',
      mintAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      decimals: 6,
      chain: 'solana:mainnet',
    },
  },

  logoUrl: 'https://app.gocente.com/assets/images/logo-latest-light.png',
};

export const theme = {
  fontFamily: '"Red Hat Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  goldPrimary: '#b8860b',
  goldSecondary: '#d4af37',
  goldAccent: '#daa520',
  goldBorder: 'rgba(212, 175, 55, 0.25)',
  goldBorderActive: '#daa520',
  goldGlow: '0 0 14px rgba(218, 165, 32, 0.18)',
  cardBg: '#10141d',
  inputBg: '#0b0e14',
  methodBg: 'rgba(11, 14, 20, 0.7)',
  methodSelectedBg: '#151a24',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
};

export const paymentMethods = [
  {
    id: 'meld',
    name: 'Meld',
    tag: 'Global',
    subtitle: 'Transak, Swapped & 100+ local payment methods',
    icon: Globe,
  },
  {
    id: 'stripe',
    name: 'Stripe',
    tag: 'Europe / US',
    subtitle: 'Cards, Apple Pay, Google Pay & bank transfers',
    icon: CreditCard,
  },
  {
    id: 'moonpay',
    name: 'MoonPay',
    tag: 'Popular',
    subtitle: 'Fast crypto purchase via cards & bank wire',
    icon: Zap,
  },
];
