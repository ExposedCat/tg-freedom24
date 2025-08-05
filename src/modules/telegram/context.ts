import type { I18nContextFlavor, TemplateData } from '@grammyjs/i18n';
import type { Context, SessionFlavor } from 'grammy';

import type { Chat } from '../chat/types.js';
import type { Database } from '../database/types.js';
import type { User } from '../user/types.js';
import type { Extra } from './bot.js';

export interface Custom<C extends Context> {
  text: (text: string, templateData?: TemplateData, extra?: Extra) => ReturnType<C['reply']>;

  dbEntities: {
    user: User | null;
    chat: Chat | null;
  };

  db: Database;
}

export type CustomContextMethods = Custom<Context>;

export type CustomContext = Context &
  Custom<Context> &
  I18nContextFlavor &
  // biome-ignore lint/complexity/noBannedTypes: <explanation>
  SessionFlavor<{}>;

export function createReplyWithTextFunc(ctx: CustomContext): CustomContextMethods['text'] {
  return (resourceKey, templateData, extra = {}) => {
    extra.parse_mode = 'HTML';
    extra.link_preview_options = {
      is_disabled: true,
    };
    const text = ctx.i18n.t(resourceKey, templateData);
    return ctx.reply(text, extra);
  };
}
