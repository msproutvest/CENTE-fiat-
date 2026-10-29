import React from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { Toaster } from 'sonner';
import { CenteFiatOnramp } from './CenteFiatOnramp';
import { AutoBridgeRunner } from './wallet/AutoBridgeRunner';
import { config } from '../config';

export function CentePayment({
  appId = config.privyAppId,
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
          ethereum: { createOnLogin: 'all-users' },
          solana: { createOnLogin: 'all-users' },
        },
        fundingMethodConfig: {
          moonpay: { useSandbox: true },
        },
      }}
    >
      <Toaster richColors position="top-right" theme="dark" closeButton />
      <AutoBridgeRunner />
      <CenteFiatOnramp
        appId={appId}
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
