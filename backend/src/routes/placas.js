import { Router } from 'express';
import axios from 'axios';

const router = Router();

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

    const fipeTexto = d.fipe?.dados?.[0]?.texto_valor || '';
    const fipeValor = fipeTexto
      ? parseFloat(fipeTexto.replace(/[^0-9,]/g, '').replace(',', '.'))
      : null;

    return res.json({
      found:  true,
      placa,
      marca,
      modelo: modeloCompleto,
      ano:    parseInt(d.anoModelo || d.ano || 0, 10),
      cor:    d.cor    || '',
      fipe:   fipeValor,
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
