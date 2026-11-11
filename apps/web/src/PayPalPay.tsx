import { useEffect, useRef, useState } from 'react';
import type { Config } from './api';

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: {
        style?: Record<string, unknown>;
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onError: (err: unknown) => void;
        onCancel?: () => void;
      }) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
    };
  }
}

let sdk: Promise<void> | null = null;
function loadSdk(clientId: string): Promise<void> {
  sdk ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('The PayPal script could not load.'));
    document.head.append(s);
  });
  return sdk;
}

interface Props {
  config: Config;
  createOrder: () => Promise<string>;
  onCaptured: (orderId: string) => Promise<void>;
  onError: (e: unknown) => void;
  onCancel: () => void;
}

/** Real PayPal buttons in sandbox mode; a clearly labelled simulated approval otherwise. */
export function PayPalPay({ config, createOrder, onCaptured, onError, onCancel }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (config.paypalMode !== 'sandbox' || !box.current) return;
    let closed = false;
    loadSdk(config.paypalClientId)
      .then(() => {
        if (closed || !box.current || !window.paypal) return;
        box.current.innerHTML = '';
        return window.paypal
          .Buttons({
            style: { layout: 'horizontal', tagline: false, height: 44 },
            createOrder,
            onApprove: async (data) => onCaptured(data.orderID),
            onError,
            onCancel,
          })
          .render(box.current);
      })
      .catch(onError);
    return () => {
      closed = true;
    };
  }, [config, createOrder, onCaptured, onError, onCancel]);

  if (config.paypalMode === 'sandbox') return <div ref={box} className="paypal" />;

  return (
    <div className="paypal">
      <button
        className="btn btn--paypal"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onCaptured(await createOrder());
          } catch (e) {
            onError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Paying…' : 'Approve with PayPal (simulated)'}
      </button>
      <p className="small muted">PayPal keys aren't configured on this server, so approval is simulated. Every other step is real.</p>
    </div>
  );
}
