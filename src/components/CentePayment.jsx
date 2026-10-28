import React from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { CenteFiatOnramp } from './CenteFiatOnramp';
import { config } from '../config';

export function CentePayment({
  appId = config.privyAppId,
  masterWallet = null, // Defaults to null: Dynamically fetches authenticated user's wallet
  defaultAmount = config.defaultAmount,
  defaultToken = config.defaultToken,
  userEmail = '',
  redirectUrl = 'https://app.gocente.com',
  network = config.defaultNetwork,
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email'],
        appearance: {
          theme: 'dark',
          accentColor: '#daa520',
          logo: config.logoUrl,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          solana: { createOnLogin: 'all-users' },
        },
        fundingMethodConfig: {
          moonpay: { useSandbox: true },
        },
      }}
    >
      <CenteFiatOnramp
        appId={appId}
        masterWallet={masterWallet}
        defaultAmount={defaultAmount}
        defaultToken={defaultToken}
        initialEmail={userEmail}
        redirectUrl={redirectUrl}
        network={network}
      />
    </PrivyProvider>
  );
}

export default CentePayment;
