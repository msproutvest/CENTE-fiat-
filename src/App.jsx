import React from 'react';
import CentePayment from './components/CentePayment';

export function App() {
  return (
    <div
      className="min-h-screen bg-[#0b0e14] flex items-center justify-center p-4 sm:p-8"
      style={{
        minHeight: '100vh',
        backgroundColor: '#0b0e14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      <CentePayment />
    </div>
  );
}

export default App;
