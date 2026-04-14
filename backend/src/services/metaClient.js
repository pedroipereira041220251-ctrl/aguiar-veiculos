/**
 * metaClient.js — Envio de mensagens via Meta Graph API (Instagram DM)
 * Fase 2: usado pelo agente para responder clientes no Instagram.
 */

import axios from 'axios';

const GRAPH = 'https://graph.facebook.com/v20.0';

/**
 * Envia mensagem de texto via Instagram DM.
 * @param {string} recipientId  PSID do destinatário
 * @param {string} text         Texto da mensagem
 */
export async function sendInstagramMessage(recipientId, text) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || token === 'xxxxx') {
    console.warn('[metaClient] META_ACCESS_TOKEN não configurado');
    return;
  }

  await axios.post(
    `${GRAPH}/me/messages`,
    { recipient: { id: recipientId }, message: { text } },
    { params: { access_token: token } },
  );
}
