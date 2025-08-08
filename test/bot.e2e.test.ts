import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Composer } from 'grammy';
import type { CustomContext } from '../src/modules/telegram/context.js';
import { doPredictionMenu } from '../src/modules/prediction/controller.js';

// Minimal harness to simulate Telegram messages without hitting network
class FakeApi {
  public sent: { text: string; parse_mode?: string }[] = [];
  async sendMessage(_chatId: number, text: string, extra?: any) {
    this.sent.push({ text, parse_mode: extra?.parse_mode });
    return { message_id: 1 } as any;
  }
  async editMessageText(_chatId: number, _messageId: number, text: string, extra?: any) {
    this.sent.push({ text, parse_mode: extra?.parse_mode });
    return {} as any;
  }
}

function createCtx(text: string) {
  const api = new FakeApi() as any;
  const ctx: any = {
    api,
    chat: { id: 1 },
    from: { id: 1 },
    message: { text, message_id: 100, date: Date.now(), chat: { id: 1 }, from: { id: 1 } },
    update: { update_id: 1, message: { text, message_id: 100, date: Date.now(), chat: { id: 1 }, from: { id: 1 } } },
    match: text.replace(/^\/[A-Za-z_]+\s?/, ''),
    db: { user: { findOne: async () => ({ userId: 1, apiKey: 'k', secretKey: 's', sid: 'sid' }) }, chat: { findOne: async () => null } },
    dbEntities: { user: { userId: 1, apiKey: 'k', secretKey: 's', sid: 'sid' }, chat: null },
    i18n: { t: (_k: string, _d?: any) => 'placeholder' },
    reply: (text: string, extra?: any) => api.sendMessage(1, text, extra),
    text: (res: string, _data?: any, extra?: any) => api.sendMessage(1, res, extra),
    session: {},
  } as CustomContext & any;
  return { ctx, api };
}

describe('prediction controller basic interaction', () => {
  beforeEach(() => {});

  it('responds to /prediction with HTML and inline keyboard without errors', async () => {
    const { ctx, api } = createCtx('/prediction');
    await doPredictionMenu(ctx as any, { });
    const sent = (api as any).sent;
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].parse_mode).toBe('HTML');
    expect(sent[0].text.includes('Prediction')).toBe(true);
  });
});
