import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SOCIAL_IMAGE_ALT } from '@/lib/seo';

export const alt = SOCIAL_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const image = await readFile(join(process.cwd(), 'public', 'media', 'audiences', 'choose-your-lane-social.png'));
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': contentType } });
}
