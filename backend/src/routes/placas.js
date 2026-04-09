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
      `https://apiplacas.com.br/api/v1/placa/${placa}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (compatible; AguiarVeiculos/1.0)',
          Accept: 'application/json',
        },
        timeout: 8000,
      }
    );

    const modeloCompleto = [d.modelo, d.submodelo, d.versao]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(' ')
      .trim() || d.modelo || '';

    return res.json({
      found:  true,
      placa,
      marca:  d.marca  || '',
      modelo: modeloCompleto,
      ano:    parseInt(d.anoModelo || d.ano || 0, 10),
      cor:    d.cor    || '',
      fipe:   d.fipe?.valor ? parseFloat(d.fipe.valor) : null,
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
