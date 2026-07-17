import { ExternalLink } from 'lucide-react';
import type { CaseCategory } from '@/types';
import { decorateCrossPromoUrl, trackCrossPromoClick } from '@/lib/crossPromoTelemetry';

interface AppliedLink {
  name: string;
  href: string;
  blurb: string;
  tagline: string;
  product: string;
}

const TECHDECK: AppliedLink = {
  name: 'TechDeck.app',
  href: 'https://techdeck.app',
  blurb: 'IT cockpit for MSPs and power users',
  tagline: 'Take this diagnostic mindset to live IT operations.',
  product: 'techdeck',
};

const TORQUESHED: AppliedLink = {
  name: 'TorqueShed.pro',
  href: 'https://torqueshed.pro',
  blurb: 'Automotive diagnostics, parts, and shop tooling',
  tagline: 'Apply the same root-cause workflow in the bay.',
  product: 'torqueshed',
};

const HUB: AppliedLink = {
  name: 'ShotgunNinjas.com',
  href: 'https://shotgunninjas.com',
  blurb: 'The full Shotgun Ninjas operator ecosystem',
  tagline: 'See where else this skill set ships.',
  product: 'shotgunninjas',
};

function pickLinks(category: CaseCategory): AppliedLink[] {
  switch (category) {
    case 'automotive':
      return [TORQUESHED, TECHDECK];
    case 'networking':
    case 'servers':
    case 'windows-ad':
    case 'electronics':
      return [TECHDECK, TORQUESHED];
    case 'mixed':
    default:
      return [TECHDECK, HUB];
  }
}

interface Props {
  category: CaseCategory;
}

export default function EcosystemCrossPromo({ category }: Props) {
  const links = pickLinks(category);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500/70" />
        <h2 className="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-500">
          Apply this in the field
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => {
          const placementId = `debrief-${category}-${link.product}`;
          const decoratedHref = decorateCrossPromoUrl(link.href, placementId);
          return (
          <a
            key={link.name}
            href={decoratedHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackCrossPromoClick({
                placementId,
                targetProduct: link.product,
                targetUrl: decoratedHref,
              })
            }
            className="group rounded-lg border border-zinc-800/60 bg-[#0d1219]/60 hover:border-red-500/30 hover:bg-[#111822] p-4 transition-all"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-sm font-mono text-zinc-100 group-hover:text-red-300 transition-colors">
                {link.name}
              </span>
              <ExternalLink size={12} className="text-zinc-600 group-hover:text-red-300/70 transition-colors" />
            </div>
            <p className="text-xs text-zinc-400 mb-1.5 leading-relaxed">{link.blurb}</p>
            <p className="text-[11px] text-zinc-500 italic leading-relaxed">{link.tagline}</p>
          </a>
          );
        })}
      </div>
    </div>
  );
}
