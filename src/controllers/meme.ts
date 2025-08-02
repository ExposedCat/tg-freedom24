import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';

export const memeController = new Composer<CustomContext>();

memeController.command('meme', async ctx => {
  const [, ...parts] = ctx.message?.text?.split(' ') || [];
  const fullText = parts.join(' ');

  if (!fullText.includes(' / ')) {
    await ctx.text('meme.usage');
    return;
  }

  const [topText, bottomText] = fullText.split(' / ').map(text => text.trim());

  if (!topText || !bottomText) {
    await ctx.text('meme.usage');
    return;
  }

  const baseUrl = 'https://memecomplete.com/share/images/custom';
  const memeUrl = `${baseUrl}/${encodeURIComponent(topText)}/${encodeURIComponent(bottomText)}.jpg`;

  const message = `<a href="${memeUrl}">⁠</a>${topText} / ${bottomText}`;

  try {
    await ctx.reply(message, { parse_mode: 'HTML' });

    try {
      await ctx.deleteMessage();
    } catch {
      void 0;
    }
  } catch (error) {
    console.error(error);
    await ctx.text('meme.error');
  }
});
