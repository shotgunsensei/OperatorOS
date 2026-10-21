import type { Metadata } from 'next';
import { lunchBreakGames } from '../../../../../packages/modules/lunch-break.js';
import LunchBreakHub from '@/components/LunchBreakHub';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Lunch Break | OperatorOS',
  description:
    'Take a breather. Your OperatorOS game hub for Pool Hall, Scrapshift, Roaming Garden, Neon Racer and Kage.',
  // Publication/domain acceptance remains an owner gate.
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  // The public hub does not expose the authenticated application's PWA shell.
  manifest: null,
  referrer: 'no-referrer',
};

export default function LunchBreakPage() {
  return <LunchBreakHub games={lunchBreakGames(process.env)} />;
}
