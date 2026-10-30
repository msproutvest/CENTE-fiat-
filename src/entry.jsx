import './polyfills';
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import CentePayment from './components/CentePayment';

const activeRoots = new Map();

function parseDataset(el) {
  const ds = el.dataset || {};
  return {
    appId: ds.appId,
    userEmail: ds.userEmail,
    defaultAmount: ds.defaultAmount ? Number(ds.defaultAmount) : undefined,
    defaultToken: ds.defaultToken,
    redirectUrl: ds.redirectUrl,
    allowedRedirectHosts: ds.allowedRedirectHosts
      ? ds.allowedRedirectHosts.split(',').map((s) => s.trim())
      : undefined,
    network: ds.network,
    moonpaySandbox: ds.moonpaySandbox !== undefined ? ds.moonpaySandbox === 'true' : undefined,
    minAmount: ds.minAmount ? Number(ds.minAmount) : undefined,
    maxAmount: ds.maxAmount ? Number(ds.maxAmount) : undefined,
    debug: ds.debug === 'true',
  };
}

export function mount(target, props = {}) {
  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (!container) {
    console.warn('[CentePayment] Mount target element not found:', target);
    return null;
  }

  // Unmount prior root if already attached to this container
  if (activeRoots.has(container)) {
    try {
      activeRoots.get(container).unmount();
    } catch {}
    activeRoots.delete(container);
  }

  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(CentePayment, props));

  const handle = {
    unmount: () => {
      try {
        root.unmount();
      } catch {}
      activeRoots.delete(container);
    },
  };

  activeRoots.set(container, handle);
  return handle;
}

export function unmount(target) {
  if (!target) {
    activeRoots.forEach((handle) => {
      try {
        handle.unmount();
      } catch {}
    });
    activeRoots.clear();
    return;
  }

  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (container && activeRoots.has(container)) {
    try {
      activeRoots.get(container).unmount();
    } catch {}
    activeRoots.delete(container);
  }
}

export function autoMount() {
  if (typeof document === 'undefined') return;
  const elements = document.querySelectorAll('[data-cente-payment]');
  elements.forEach((el) => {
    if (!activeRoots.has(el)) {
      const props = parseDataset(el);
      mount(el, props);
    }
  });
}

if (typeof window !== 'undefined') {
  window.CentePayment = {
    mount,
    unmount,
    autoMount,
    Component: CentePayment,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
}

export { CentePayment };
export default CentePayment;
