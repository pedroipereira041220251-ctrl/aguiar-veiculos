import { Router } from 'express';
import axios from 'axios';

const router = Router();

function melhorFipe(dados, versao, ano) {
  if (!dados?.length) return null;
  if (dados.length === 1) return dados[0];
  const norm = s => (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').trim();
  const words = norm(versao).split(/\s+/).filter(Boolean);
  let best = 0, bestScore = -1;
  dados.forEach((d, i) => {
    const m = norm(d.texto_modelo || '');
    let score = words.filter(w => m.includes(w)).length;
    if (ano && String(d.ano_modelo) === String(ano)) score += 0.5;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return dados[best];
}

// ── GET /api/placas/:placa ─────────────────────────────────
// Proxy para apiplacas.com.br. PLATE_API_TOKEN nunca exposto ao frontend.
router.get('/:placa', async (req, res) => {
  const placa = req.params.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (placa.length < 7) return res.json({ found: false });

  const token = process.env.PLATE_API_TOKEN;
  if (!token || token === 'xxxxx') return res.json({ found: false });

  try {
    const { data: d } = await axios.get(
      `https://wdapi2.com.br/consulta/${placa}/${token}`,
      { timeout: 8000 }
    );

    const marca  = d.MARCA  || d.marca  || '';
    const modelo = d.MODELO || d.modelo || '';
    const sub    = d.SUBMODELO || d.submodelo || '';
    const versao = d.VERSAO || d.versao || '';
    const modeloCompleto = [modelo, sub, versao]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(' ')
      .trim() || modelo;

    const versaoCompleta = [sub, versao]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(' ')
      .trim();

    const anoVeiculo = parseInt(d.anoModelo || d.ano || 0, 10);
    const versaoRaw = versaoCompleta || modeloCompleto;
    const fipeEntry = melhorFipe(d.fipe?.dados, versaoRaw, anoVeiculo);
    const fipeTexto = fipeEntry?.texto_valor || '';
    const fipeValor = fipeTexto
      ? parseFloat(fipeTexto.replace(/[^0-9,]/g, '').replace(',', '.'))
      : null;

    console.log('[placas] versao buscada:', versaoRaw);
    (d.fipe?.dados ?? []).forEach((entry, i) => {
      const sel = entry === fipeEntry ? ' ← SELECIONADO' : '';
      console.log(`[placas]   [${i}] ${entry.texto_modelo} | ${entry.texto_valor} | ano ${entry.ano_modelo}${sel}`);
    });

    return res.json({
      found:  true,
      placa,
      marca,
      modelo: modelo,
      ano:    anoVeiculo,
      cor:    d.cor    || '',
      fipe:   fipeValor,
      versao: versaoCompleta,
    });
  } catch (err) {
    if (err.response?.status === 404) return res.json({ found: false });
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.error('[placas] Token inválido ou sem permissão');
      return res.json({ found: false });
    }
    console.error('[GET /placas/:placa]', err.message);
    return res.json({ found: false });
  }
});

export default router;
