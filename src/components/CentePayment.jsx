import React, { useMemo } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { Toaster } from 'sonner';
import { CenteFiatOnramp } from './CenteFiatOnramp';
import { AutoBridgeRunner } from './wallet/AutoBridgeRunner';
import { config } from '../config';
import { safeRedirectUrl, DEFAULT_REDIRECT } from '../lib/safe-redirect';

function ConfigError({ message }) {
  return (
    <div
      role="alert"
      style={{
        maxWidth: '448px',
        margin: '0 auto',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        background: 'rgba(245, 158, 11, 0.08)',
        color: '#b45309',
        fontSize: '13px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {message}
    </div>
  );
}

export function CentePayment({
  appId = config.privyAppId,
  defaultAmount = config.defaultAmount,
  defaultToken = config.defaultToken || 'USDC',
  userEmail = '',
  redirectUrl = DEFAULT_REDIRECT,
  allowedRedirectHosts,
  network = config.defaultNetwork || 'Solana',
  moonpaySandbox = config.moonpaySandbox ?? false,
  minAmount,
  maxAmount,
  toasts = true,
  toastPosition = 'top-right',
  debug = false,
}) {
  // Validate the redirect once, at the plugin boundary.
  const safeRedirect = safeRedirectUrl(redirectUrl, allowedRedirectHosts);

  const privyConfig = useMemo(
    () => ({
      loginMethods: ['email'],
      appearance: {
        theme: 'dark',
        accentColor: '#daa520',
        logo: config.logoUrl,
      },
      embeddedWallets: {
        ethereum: { createOnLogin: 'all-users' },
        solana: { createOnLogin: 'all-users' },
      },
      fundingMethodConfig: {
        moonpay: { useSandbox: Boolean(moonpaySandbox) },
      },
    }),
    [moonpaySandbox]
  );

  if (!appId || String(appId).includes('insert-your-privy-app-id')) {
    return <ConfigError message="Payment widget is not configured: missing Privy app ID." />;
  }

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      {toasts && <Toaster richColors position={toastPosition} theme="dark" closeButton />}
      <AutoBridgeRunner />
      <CenteFiatOnramp
        appId={appId}
        defaultAmount={defaultAmount}
        defaultToken={defaultToken}
        initialEmail={userEmail}
        redirectUrl={safeRedirect}
        allowedRedirectHosts={allowedRedirectHosts}
        network={network}
        {...(minAmount !== undefined ? { minAmount } : {})}
        {...(maxAmount !== undefined ? { maxAmount } : {})}
        debug={debug}
      />
    </PrivyProvider>
  );
}

export default CentePayment;