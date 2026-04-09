#!/usr/bin/env node
/**
 * testar-conexoes.js
 *
 * Verifica se todas as integrações estão configuradas e acessíveis.
 * Uso: node --env-file=../.env scripts/testar-conexoes.js
 */

import { createClient } from '@supabase/supabase-js';

const OK  = '✅ ';
const ERR = '❌ ';
const AVS = '⚠️  ';

let passou = 0;
let falhou = 0;

function ok(msg)   { console.log(OK  + msg); passou++; }
function err(msg)  { console.log(ERR + msg); falhou++; }
function aviso(msg){ console.log(AVS + msg); }

// ── 1. Variáveis de ambiente obrigatórias ─────────────────
console.log('\n🔍 1. Variáveis de ambiente\n');

const vars = {
  SUPABASE_URL:           process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY:   process.env.SUPABASE_SERVICE_KEY,
  OPENAI_API_KEY:         process.env.OPENAI_API_KEY,
  TELEGRAM_BOT_TOKEN:     process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_OWNER_CHAT_ID: process.env.TELEGRAM_OWNER_CHAT_ID,
  ZAPI_INSTANCE_ID:       process.env.ZAPI_INSTANCE_ID,
  ZAPI_TOKEN:             process.env.ZAPI_TOKEN,
  OWNER_PHONE_NUMBER:     process.env.OWNER_PHONE_NUMBER,
};

const opcionais = {
  ZAPI_CLIENT_TOKEN: process.env.ZAPI_CLIENT_TOKEN,
  ZAPI_WEBHOOK_SECRET: process.env.ZAPI_WEBHOOK_SECRET,
  PLATE_API_URL: process.env.PLATE_API_URL,
};

for (const [k, v] of Object.entries(vars)) {
  if (!v || v === 'xxxxx') err(`${k} não configurado`);
  else ok(`${k} configurado`);
}
for (const [k, v] of Object.entries(opcionais)) {
  if (!v || v === 'xxxxx') aviso(`${k} não configurado (opcional)`);
  else ok(`${k} configurado`);
}

// ── 2. Supabase ───────────────────────────────────────────
console.log('\n🔍 2. Supabase\n');
try {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  // Testar tabela veiculos
  const { error: eV } = await supabase.from('veiculos').select('id').limit(1);
  if (eV) err(`Tabela veiculos: ${eV.message}`);
  else    ok('Tabela veiculos acessível');

  // Testar tabela configuracoes (singleton)
  const { data: cfg, error: eCfg } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
  if (eCfg) err(`Tabela configuracoes: ${eCfg.message}`);
  else      ok('Tabela configuracoes acessível (seed ok)');

  // Testar Storage bucket
  const { data: buckets, error: eBuckets } = await supabase.storage.listBuckets();
  if (eBuckets) {
    aviso(`Storage: ${eBuckets.message}`);
  } else {
    const bucket = buckets?.find(b => b.name === 'fotos-veiculos');
    if (bucket) ok('Storage bucket "fotos-veiculos" existe');
    else        err('Storage bucket "fotos-veiculos" NÃO encontrado — rode o SQL do schema.sql seção 14');
  }

  // Testar view financeira
  const { error: eView } = await supabase.from('vw_veiculos_com_financeiro').select('id').limit(1);
  if (eView) err(`View financeira: ${eView.message}`);
  else       ok('View vw_veiculos_com_financeiro acessível');

} catch (e) {
  err(`Supabase: ${e.message}`);
}

// ── 3. OpenAI ─────────────────────────────────────────────
console.log('\n🔍 3. OpenAI\n');
try {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  if (res.ok) ok('OpenAI API key válida');
  else        err(`OpenAI: HTTP ${res.status}`);
} catch (e) {
  err(`OpenAI: ${e.message}`);
}

// ── 4. Telegram ───────────────────────────────────────────
console.log('\n🔍 4. Telegram\n');
try {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'xxxxx') {
    aviso('Telegram não configurado (pulando)');
  } else {
    const res  = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok) {
      ok(`Telegram Bot: @${data.result.username}`);
      // Verificar webhook info
      const wi   = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const wiD  = await wi.json();
      if (wiD.result.url) ok(`Webhook registrado: ${wiD.result.url}`);
      else                aviso('Webhook NÃO registrado (ok em dev — usa polling)');
    } else {
      err(`Telegram token inválido: ${data.description}`);
    }
  }
} catch (e) {
  err(`Telegram: ${e.message}`);
}

// ── 5. Z-API (WhatsApp) ───────────────────────────────────
console.log('\n🔍 5. Z-API (WhatsApp)\n');
try {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token      = process.env.ZAPI_TOKEN;
  if (!instanceId || instanceId === 'xxxxx' || !token || token === 'xxxxx') {
    aviso('Z-API não configurado (pulando)');
  } else {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.ZAPI_CLIENT_TOKEN) headers['Client-Token'] = process.env.ZAPI_CLIENT_TOKEN;

    const res  = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/connected`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      // Z-API retorna { value: true/false } no endpoint /connected
      const connected = data.value === true || data.connected === true;
      if (connected) ok('Z-API: WhatsApp conectado ✓');
      else           err('Z-API: WhatsApp DESCONECTADO — escaneie o QR Code no painel Z-API');
    } else {
      err(`Z-API: HTTP ${res.status} — verifique ZAPI_INSTANCE_ID e ZAPI_TOKEN`);
    }
  }
} catch (e) {
  err(`Z-API: ${e.message}`);
}

// ── Resumo ────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(`\n📊 Resultado: ${passou} ok  |  ${falhou} com erro\n`);
if (falhou === 0) {
  console.log('🎉  Todas as conexões estão OK! Pode testar o sistema.\n');
} else {
  console.log('⚠️   Corrija os erros acima antes de testar.\n');
  process.exit(1);
}
