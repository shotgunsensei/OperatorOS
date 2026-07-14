import { Crown, Package, Zap, Layers } from 'lucide-react';
import type { CatalogProduct } from '@/data/catalog';

export function categoryIcon(category: string) {
  switch (category) {
    case 'tier':
      return <Crown className="w-5 h-5" />;
    case 'content-pack':
      return <Package className="w-5 h-5" />;
    case 'feature-upgrade':
      return <Zap className="w-5 h-5" />;
    case 'bundle':
      return <Layers className="w-5 h-5" />;
    default:
      return <Package className="w-5 h-5" />;
  }
}

export function ctaLabel(
  product: CatalogProduct,
  isOwned: boolean,
  isComingSoon: boolean,
  isDisabled: boolean = false
): string {
  if (isOwned) return 'Owned';
  if (isDisabled) return 'Unavailable';
  if (isComingSoon) return 'Coming soon';
  if (product.pricingType === 'free') return 'Get started';
  if (product.pricingType.startsWith('subscription')) return `Subscribe`;
  return 'Buy';
}

export function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">{label}</h4>
      {children}
    </div>
  );
}

export function SectionHeader({
  icon,
  label,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  helper?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 flex-wrap">
      <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-2">
        {icon}
        {label}
      </h3>
      {helper && <span className="text-[11px] text-zinc-600">{helper}</span>}
    </div>
  );
}
