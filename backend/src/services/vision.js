/**
 * vision.js — Análise de imagens via GPT-4o Vision
 * Fase 2: determina se uma foto é um veículo de entrada e extrai dados básicos.
 */

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Analisa uma imagem com GPT-4o Vision.
 * @param {string} imageUrl  URL pública ou data URI base64
 * @returns {Promise<{ isVeiculo: boolean, dados: object, descricao: string }>}
 */
export async function analisarImagem(imageUrl) {
  if (!imageUrl || !process.env.OPENAI_API_KEY) {
    return { isVeiculo: false, dados: {}, descricao: '' };
  }

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analise a imagem e responda APENAS com JSON válido, sem markdown:
{
  "is_veiculo": boolean,
  "marca": string|null,
  "modelo": string|null,
  "cor": string|null,
  "ano_estimado": number|null,
  "condicao": "bom"|"regular"|"ruim"|null,
  "descricao": string
}
is_veiculo = true SOMENTE se o assunto principal da imagem for um veículo automotor (carro, caminhonete, moto) que aparenta ser enviado para avaliação ou troca. is_veiculo = false para: documentos (CNH, RG, comprovantes), selfies, pessoas, paisagens, objetos, prints de tela, texto escrito, fotos de interior sem veículo visível, imagens com veículo ao fundo mas não como assunto principal.
descricao = frase curta em português descrevendo o conteúdo da imagem.`,
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'low' },
          },
        ],
      }],
      max_tokens: 300,
    });

    const content = resp.choices[0]?.message?.content || '{}';
    const match   = content.match(/\{[\s\S]*\}/);
    if (!match) return { isVeiculo: false, dados: {}, descricao: content };

    const dados = JSON.parse(match[0]);
    return {
      isVeiculo: dados.is_veiculo === true,
      dados: {
        marca:        dados.marca        || null,
        modelo:       dados.modelo       || null,
        cor:          dados.cor          || null,
        ano_estimado: dados.ano_estimado || null,
        condicao:     dados.condicao     || null,
      },
      descricao: dados.descricao || '',
    };
  } catch (err) {
    console.error('[vision] Erro ao analisar imagem:', err.message);
    return { isVeiculo: false, dados: {}, descricao: '' };
  }
}
