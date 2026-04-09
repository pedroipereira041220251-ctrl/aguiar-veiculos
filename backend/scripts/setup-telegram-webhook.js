#!/usr/bin/env node
/**
 * setup-telegram-webhook.js
 *
 * Registra o webhook do Telegram Bot apontando para o backend em produção.
 * Uso:
 *   node --env-file=../.env scripts/setup-telegram-webhook.js <URL_DO_BACKEND>
 *
 * Exemplo:
 *   node --env-file=../.env scripts/setup-telegram-webhook.js https://meubackend.railway.app
 *
 * Em desenvolvimento: o bot usa polling automaticamente (NODE_ENV=development).
 * Este script só é necessário em produção.
 */

const backendUrl = process.argv[2];

if (!backendUrl) {
  console.error('❌  Informe a URL do backend como argumento.');
  console.error('   Exemplo: node scripts/setup-telegram-webhook.js https://meubackend.railway.app');
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || token === 'xxxxx') {
  console.error('❌  TELEGRAM_BOT_TOKEN não configurado no .env');
  process.exit(1);
}

const webhookUrl = `${backendUrl.replace(/\/$/, '')}/webhooks/telegram`;

async function main() {
  console.log(`\n📡 Registrando webhook do Telegram...`);
  console.log(`   URL: ${webhookUrl}\n`);

  // 1. Verificar bot
  const meRes  = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meData = await meRes.json();
  if (!meData.ok) {
    console.error('❌  Token inválido:', meData.description);
    process.exit(1);
  }
  console.log(`✅  Bot: @${meData.result.username} (${meData.result.first_name})`);

  // 2. Registrar webhook
  const setRes  = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      url:             webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    }),
  });
  const setData = await setRes.json();
  if (!setData.ok) {
    console.error('❌  Falha ao registrar webhook:', setData.description);
    process.exit(1);
  }
  console.log(`✅  Webhook registrado com sucesso!`);

  // 3. Confirmar
  const infoRes  = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const infoData = await infoRes.json();
  console.log(`\n📋 Status do webhook:`);
  console.log(`   URL:             ${infoData.result.url}`);
  console.log(`   Pendentes:       ${infoData.result.pending_update_count}`);
  console.log(`   Último erro:     ${infoData.result.last_error_message || 'nenhum'}`);
  console.log('\n🎉  Pronto! O bot Telegram está configurado para produção.\n');
}

main().catch(err => {
  console.error('❌  Erro inesperado:', err.message);
  process.exit(1);
});
