export function buildRefreshMarkup(refreshText: string, callbackData: string) {
  return {
    inline_keyboard: [[{ text: refreshText, callback_data: callbackData }]],
  };
}
