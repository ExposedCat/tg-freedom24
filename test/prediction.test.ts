import { describe, it, expect } from 'vitest';

describe('e2e /prediction', () => {
  it('бот отвечает саммари Prediction', async () => {
    const { tgServer } = global.__e2e__;

    // генерируем апдейт
    await tgServer.sendUpdate({
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 100, type: 'private' },
        from: { id: 100, is_bot: false, first_name: 'tester' },
        text: '/prediction',
      },
    });

    // историю отдаёт сам сервер
    const history = await tgServer.getUpdatesHistory();
    const botMsg = history.find(
      (u: any) => u.message && u.message.from.is_bot,
    );

    expect(botMsg).toBeDefined();
    expect(botMsg.message.text).toContain('Prediction');
    expect(botMsg.message.text).toContain('≥');
    expect(botMsg.message.text).toContain('≤');
    expect(botMsg.message.parse_mode).toBe('HTML');
  });
});
