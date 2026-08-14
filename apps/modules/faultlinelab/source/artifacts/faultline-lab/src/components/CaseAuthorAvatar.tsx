import { useState } from 'react';
import { getCaseAuthorImageUrl } from '@/data/caseCatalog/authorImage';
import type { CaseCatalogEntry } from '@/data/caseCatalog';

interface Props {
  entry: Pick<CaseCatalogEntry, 'title' | 'authorImagePath'>;
  size?: number;
  className?: string;
}

function initialsFor(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function CaseAuthorAvatar({ entry, size = 40, className = '' }: Props) {
  const src = getCaseAuthorImageUrl(entry.authorImagePath);
  const [errored, setErrored] = useState(false);
  const dim = { width: size, height: size };
  const baseClass =
    'shrink-0 rounded-full overflow-hidden bg-zinc-800/60 border border-zinc-700/60 text-cyan-300 font-mono uppercase flex items-center justify-center select-none';

  if (src && !errored) {
    return (
      <img
        src={src}
        alt={`${entry.title} author portrait`}
        style={dim}
        loading="lazy"
        onError={() => setErrored(true)}
        className={`${baseClass} object-cover ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${entry.title} author placeholder`}
      style={{ ...dim, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      className={`${baseClass} ${className}`}
    >
      {initialsFor(entry.title)}
    </div>
  );
}
