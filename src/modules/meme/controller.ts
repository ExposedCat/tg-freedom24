import { Composer } from 'grammy';
import type { CustomContext } from '../telegram/context.js';
import { getMemeUrl } from './service.js';

export const memeController = new Composer<CustomContext>();

memeController.command('meme', async ctx => {
  if (!ctx.match || !ctx.from) {
    await ctx.text('meme.usage');
    return;
  }

  const parts = ctx.match.trim().split('/');
  if (parts.length !== 2) {
    await ctx.text('meme.usage');
    return;
  }

  const topText = parts[0].trim().replace(/\s+/g, '_');
  const bottomText = parts[1].trim().replace(/\s+/g, '_');

  const memeUrl = getMemeUrl(topText, bottomText);

  try {
    await ctx.replyWithPhoto(memeUrl);
    try {
      await ctx.deleteMessage();
    } catch {
      //ignore
    }
  } catch (error) {
    console.error(error);
  }
});
