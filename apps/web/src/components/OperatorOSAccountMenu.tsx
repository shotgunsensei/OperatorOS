'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, UserRound } from 'lucide-react';
import styles from './OperatorOSChrome.module.css';

export default function OperatorOSAccountMenu({ label = 'Account', items, compact = false, triggerTestId }: {
  label?: string;
  compact?: boolean;
  triggerTestId?: string;
  items: readonly { label: string; href?: string; onSelect?: () => void; disabled?: boolean; testId?: string }[];
}) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger className={styles.accountTrigger} aria-label="Open account menu" data-testid={triggerTestId}><UserRound size={16} aria-hidden="true" />{!compact && <><span>{label}</span><ChevronDown size={13} aria-hidden="true" /></>}</DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className={styles.accountMenu} sideOffset={8} align="end">
      <DropdownMenu.Label className={styles.menuLabel}>OperatorOS account</DropdownMenu.Label>
      {items.map(item => <DropdownMenu.Item key={item.label} asChild disabled={item.disabled} onSelect={item.onSelect}>
        {item.href ? <a href={item.href} className={styles.accountItem} data-testid={item.testId}>{item.label}</a> : <button type="button" className={styles.accountItem} disabled={item.disabled} data-testid={item.testId}>{item.label}</button>}
      </DropdownMenu.Item>)}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
