import React, { type AnchorHTMLAttributes } from 'react';
import Link from 'next/link';

/** Authentication changes hosts. Use a document navigation, never an RSC prefetch. */
export default function MarketingLink({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return href.startsWith('/login') || /^https?:\/\//.test(href)
    ? <a href={href} {...props} />
    : <Link href={href} {...props} />;
}
