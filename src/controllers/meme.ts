import { Composer } from 'grammy';
import type { CustomContext } from '../types/context.js';

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

  const baseUrl = 'https://memecomplete.com/share/images/custom';
  const backgroundParam =
    'https%3A%2F%2Fexternal-content.duckduckgo.com%2Fiu%2F%3Fu%3Dhttps%253A%252F%252Fwww.meme-arsenal.com%252Fmemes%252F753d2cb2e64bb0ff7144f2b1b203132d.jpg%26f%3D1%26nofb%3D1%26ipt%3D410106a1840acb84707a7bf33472b424b80353f739a38ae1cb6abde41067b253';
  const token = '0czc5w59hy830pj22koi';

  const memeUrl = `${baseUrl}/${encodeURIComponent(topText)}~q/${encodeURIComponent(bottomText)}?format=jpg&background=${backgroundParam}&token=${token}`;

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
