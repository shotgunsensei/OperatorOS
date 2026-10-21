import { Coffee, ArrowUpRight } from 'lucide-react';
import { LUNCH_BREAK_PATH } from '../../../../packages/modules/lunch-break.js';

/** Public navigation entry, deliberately outside billing/tenant module records. */
export default function LunchBreakEntry() {
  return (
    <a
      href={LUNCH_BREAK_PATH}
      data-testid="lunch-break-entry"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        padding: '18px 20px',
        margin: '0 0 24px',
        border: '1px solid #384a30',
        borderRadius: 12,
        background: '#182219',
        color: '#eef4e9',
        textDecoration: 'none',
        minHeight: 64,
      }}
    >
      <Coffee size={24} aria-hidden="true" />
      <span style={{ flex: '1 1 200px' }}>
        <strong style={{ display: 'block', fontSize: 16 }}>Lunch Break</strong>
        <span style={{ display: 'block', fontSize: 13, color: '#bdcab5', marginTop: 4 }}>
          Your game hub. A little play, a fresh perspective.
        </span>
      </span>
      <span style={{ fontSize: 12, color: '#d5f984' }}>Free hub</span>
      <ArrowUpRight size={19} aria-hidden="true" />
    </a>
  );
}
