import TelegramBot from 'node-telegram-bot-api';

// ── Singleton do bot Telegram ──────────────────────────────
let bot;

function getBot() {
  if (bot) return bot;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'xxxxx') {
    console.warn('[telegramClient] TELEGRAM_BOT_TOKEN não configurado');
    return null;
  }

  // Em produção: webhook. Em dev: polling
  const isDev = process.env.NODE_ENV !== 'production';
  bot = new TelegramBot(token, { polling: isDev });

  if (isDev) {
    console.log('[telegramClient] Modo polling ativo (dev)');
  }

  return bot;
}

// ── sendMessage ────────────────────────────────────────────
// keyboard: { inline_keyboard: [[{ text, callback_data }]] } (InlineKeyboardMarkup)
export async function sendMessage(chatId, text, keyboard = null) {
  const b = getBot();
  if (!b) return;

  const opts = {
    parse_mode: 'Markdown',
    ...(keyboard && { reply_markup: keyboard }),
  };

  await b.sendMessage(chatId, text, opts);
}

// ── editMessage ────────────────────────────────────────────
// Edita mensagem existente (ex: atualizar menu após callback_query)
export async function editMessage(chatId, messageId, text, keyboard = null) {
  const b = getBot();
  if (!b) return;

  const opts = {
    chat_id:    chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    ...(keyboard && { reply_markup: keyboard }),
  };

  await b.editMessageText(text, opts);
}

// ── answerCallbackQuery ────────────────────────────────────
// Confirma ao Telegram que o callback foi processado (remove loading spinner)
export async function answerCallback(callbackQueryId, text = '') {
  const b = getBot();
  if (!b) return;
  await b.answerCallbackQuery(callbackQueryId, { text });
}

// ── buildInlineKeyboard ────────────────────────────────────
// Helper para montar InlineKeyboardMarkup a partir de array de botões
// buttons: [{ label, data }]
// cols: quantos botões por linha
export function buildInlineKeyboard(buttons, cols = 2) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += cols) {
    rows.push(
      buttons.slice(i, i + cols).map(b => ({
        text:          b.label,
        callback_data: b.data,
      }))
    );
  }
  return { inline_keyboard: rows };
}

// ── initPolling ────────────────────────────────────────────
// Inicializa o bot em modo polling (dev) e registra handlers de mensagem.
// Deve ser chamado UMA VEZ no startup do servidor.
export async function initPolling() {
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) return; // em produção usa webhook

  const b = getBot();
  if (!b) return;

  // Importação dinâmica para evitar dependência circular
  const { processarUpdatePolling } = await import('../webhooks/telegram.js');

  b.on('message', msg => {
    processarUpdatePolling({ message: msg }).catch(err =>
      console.error('[telegram/polling] erro mensagem:', err)
    );
  });

  b.on('callback_query', cb => {
    processarUpdatePolling({ callback_query: cb }).catch(err =>
      console.error('[telegram/polling] erro callback:', err)
    );
  });

  b.on('polling_error', err => {
    console.error('[telegram/polling] erro:', err.message);
  });

  console.log('[telegramClient] Polling handlers registrados');
}

export { getBot };
