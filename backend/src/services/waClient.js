import axios from 'axios';

// ── Z-API wrapper ──────────────────────────────────────────
// Documentação: https://developer.z-api.io/
// Todos os envios usam o número único da loja (ZAPI_INSTANCE_ID)

const BASE = () =>
  `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}`;

const headers = () => ({
  'Content-Type': 'application/json',
  'Client-Token': process.env.ZAPI_CLIENT_TOKEN,
});

// Formatar número: garantir DDI + sem caracteres especiais
// No Brasil, números móveis precisam do 9º dígito para envio
function formatPhone(phone) {
  let n = String(phone).replace(/\D/g, '');
  // Se começa com 55 (Brasil) e tem 12 dígitos (sem o 9º dígito), insere o 9
  if (n.startsWith('55') && n.length === 12) {
    n = '55' + n.slice(2, 4) + '9' + n.slice(4);
  }
  return n;
}

// ── sendText ───────────────────────────────────────────────
export async function sendText(to, text) {
  await axios.post(
    `${BASE()}/send-text`,
    { phone: formatPhone(to), message: text },
    { headers: headers() }
  );
}

// ── sendListMessage ────────────────────────────────────────
// List Message: menus com múltiplas opções (máx ~10 itens)
// payload: { title, description, buttonLabel, sections: [{ title, rows: [{ id, title, description? }] }] }
export async function sendListMessage(to, payload) {
  await axios.post(
    `${BASE()}/send-list`,
    { phone: formatPhone(to), ...payload },
    { headers: headers() }
  );
}

// ── sendButtonMessage ──────────────────────────────────────
// Reply Buttons: confirmações rápidas (máx 3 botões)
// buttons: [{ label, data }]  — data mapeia para buttonId no Z-API
export async function sendButtonMessage(to, text, buttons, footer = '') {
  await axios.post(
    `${BASE()}/send-button-list`,
    {
      phone: formatPhone(to),
      message: text,
      footer,
      buttonList: {
        buttons: buttons.map(b => ({ buttonId: b.data, buttonText: { displayText: b.label } })),
      },
    },
    { headers: headers() }
  );
}

// ── sendImage ──────────────────────────────────────────────
export async function sendImage(to, imageUrl, caption = '') {
  await axios.post(
    `${BASE()}/send-image`,
    { phone: formatPhone(to), image: imageUrl, caption },
    { headers: headers() }
  );
}
