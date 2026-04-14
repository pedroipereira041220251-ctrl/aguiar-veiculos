/**
 * whisper.js — Transcrição de áudio via OpenAI Whisper-1
 * Fase 2: usado pelo webhook WA e Telegram antes de rotear ao ownerBot / agente.
 */

import OpenAI from 'openai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Transcreve um arquivo de áudio via Whisper-1.
 * @param {string} audioUrl  URL pública do arquivo de áudio
 * @returns {Promise<string|null>}  Texto transcrito ou null em caso de falha
 */
export async function transcreverAudio(audioUrl) {
  if (!audioUrl || !process.env.OPENAI_API_KEY) return null;

  let tmpPath = null;
  try {
    const resp = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 30_000 });

    // Detectar extensão pelo Content-Type (WhatsApp usa ogg/opus por padrão)
    const ct  = resp.headers['content-type'] || '';
    const ext = ct.includes('ogg')  ? 'ogg'
              : ct.includes('mp4')  ? 'mp4'
              : ct.includes('mpeg') ? 'mp3'
              : ct.includes('wav')  ? 'wav'
              : 'ogg';

    tmpPath = path.join(os.tmpdir(), `aguiar_audio_${Date.now()}.${ext}`);
    fs.writeFileSync(tmpPath, Buffer.from(resp.data));

    const result = await openai.audio.transcriptions.create({
      file:     fs.createReadStream(tmpPath),
      model:    'whisper-1',
      language: 'pt',
    });

    return result.text?.trim() || null;
  } catch (err) {
    console.error('[whisper] Erro ao transcrever:', err.message);
    return null;
  } finally {
    if (tmpPath) try { fs.unlinkSync(tmpPath); } catch {}
  }
}
