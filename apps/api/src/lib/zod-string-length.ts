import type { z } from 'zod';

/** Preserve existing UTF-16 limits shared with JS .length and HTML maxLength. */
export function utf16Length(minimum: number, maximum: number) {
  return (value: string, ctx: z.RefinementCtx) => {
    if (value.length < minimum) ctx.addIssue({ code: 'too_small', origin: 'string', minimum, inclusive: true });
    if (value.length > maximum) ctx.addIssue({ code: 'too_big', origin: 'string', maximum, inclusive: true });
  };
}
