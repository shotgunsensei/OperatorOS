// Re-export the /portfolio OG image so /john gets the same card.
// Both routes serve identical content, so the OG metadata stays
// identical — kept as a thin re-export instead of duplicating the
// 100-line JSX so future visual tweaks only happen in one place.
export { default, alt, size, contentType } from '../portfolio/opengraph-image';
