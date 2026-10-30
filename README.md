# Cente Payment standalone bundle

Build: `npm i -D vite @vitejs/plugin-react vite-plugin-css-injected-by-js tailwindcss@3 postcss autoprefixer && npx vite build`
Output: `dist/cente-payment.js` (copy to `public/js/` in Laravel).

Drop-in files: copy `src/` over your project's `src/` (your `config`, `lib/wallet-utils`,
`components/wallet/AutoBridgeRunner` stay as they are).

## Blade usage

Auto-mount (attributes are escaped by Blade `{{ }}`):

    <div data-cente-payment
         data-app-id="{{ config('services.privy.app_id') }}"
         data-user-email="{{ auth()->user()->email }}"
         data-default-amount="50"
         data-redirect-url="https://app.gocente.com"></div>
    <script src="{{ asset('js/cente-payment.js') }}" defer></script>

Manual:

    <div id="cente-root"></div>
    <script src="{{ asset('js/cente-payment.js') }}"></script>
    <script>
      const h = window.CentePayment.mount('#cente-root', @json(['appId' => config('services.privy.app_id'), 'userEmail' => auth()->user()->email]));
      // h.unmount() or window.CentePayment.unmount()
    </script>

Event: `window.addEventListener('cente-payment-success', e => console.log(e.detail))`

## Checklist before go-live
- CSP: allow Privy auth domain + Meld/MoonPay frames (script-src, frame-src, connect-src).
- `config.logoUrl` must be an absolute URL.
- Pin `@privy-io/react-auth` and test one full Solana fund flow (see notes on result shape).
- Production: `moonpaySandbox` stays false (default).
