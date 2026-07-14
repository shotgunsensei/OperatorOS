import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PricingScreen from './PricingScreen';
import StoreScreen from './StoreScreen';
import { useAppStore } from '@/stores/useAppStore';
import { resetEntitlements } from '@/lib/entitlements';

const { startStripeCheckoutMock } = vi.hoisted(() => ({
  startStripeCheckoutMock: vi.fn(async () => ({ url: 'https://stripe.test/session' })),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    startStripeCheckout: startStripeCheckoutMock,
  };
});

vi.mock('./EcosystemFooter', () => ({
  default: () => null,
}));

function ViewHarness() {
  const view = useAppStore((s) => s.view);
  if (view === 'pricing') return <PricingScreen />;
  if (view === 'store') return <StoreScreen />;
  return null;
}

describe('Pricing → Store → ProductDetail yearly preselect (UI flow)', () => {
  beforeEach(() => {
    // jsdom doesn't implement navigation; ProductDetail assigns
    // window.location.href on checkout success, which throws otherwise.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, href: '' },
    });
    useAppStore.setState({
      view: 'pricing',
      pendingStoreProduct: null,
      isSignedIn: true,
    });
    startStripeCheckoutMock.mockClear();
  });

  afterEach(() => {
    resetEntitlements();
    cleanup();
  });

  it('clicking Yearly then Subscribe on /pricing produces a yearly checkout call', async () => {
    render(<ViewHarness />);

    // 1. PricingScreen is up.
    const yearlyToggle = screen.getByRole('button', { name: /Yearly/i });

    // 2. User clicks the Yearly billing toggle.
    fireEvent.click(yearlyToggle);
    expect(yearlyToggle.getAttribute('aria-pressed')).toBe('true');

    // 3. User clicks Subscribe on the Pro tier card. This calls
    //    openStoreWithProduct('pro-subscription', 'pricing-page', 'year'),
    //    which sets pendingStoreProduct and switches view to 'store'.
    const subscribeOnPricing = screen.getByRole('button', { name: /^Subscribe$/i });
    await act(async () => {
      fireEvent.click(subscribeOnPricing);
    });

    // 4. ViewHarness now renders StoreScreen, whose useEffect consumes
    //    pendingStoreProduct and opens ProductDetail with
    //    initialBillingInterval='year'. The CTA reflects yearly pricing.
    const productDetailCta = await screen.findByRole('button', {
      name: /Subscribe — \$79\.00\/yr/i,
    });
    expect(productDetailCta).toBeDefined();

    // 5. User clicks Subscribe on the ProductDetail modal. This is the
    //    actual handoff to the checkout endpoint via startStripeCheckout.
    await act(async () => {
      fireEvent.click(productDetailCta);
    });

    // 6. The handoff must call startStripeCheckout with interval='year'.
    //    If the billing-interval prop is dropped anywhere in the chain
    //    (Pricing → store → ProductDetail), this assertion fails.
    await waitFor(() => {
      expect(startStripeCheckoutMock).toHaveBeenCalledTimes(1);
    });
    expect(startStripeCheckoutMock).toHaveBeenCalledWith('pro-subscription', 'year');
  });

  it('without clicking Yearly, Subscribe routes to a monthly checkout call', async () => {
    render(<ViewHarness />);

    const subscribeOnPricing = screen.getByRole('button', { name: /^Subscribe$/i });
    await act(async () => {
      fireEvent.click(subscribeOnPricing);
    });

    const productDetailCta = await screen.findByRole('button', {
      name: /Subscribe — \$8\.99\/mo/i,
    });
    await act(async () => {
      fireEvent.click(productDetailCta);
    });

    await waitFor(() => {
      expect(startStripeCheckoutMock).toHaveBeenCalledTimes(1);
    });
    expect(startStripeCheckoutMock).toHaveBeenCalledWith('pro-subscription', 'month');
  });
});
