import axios from 'axios';

// ── consultarPlaca ─────────────────────────────────────────
// API: apiplacas.com.br/api/v1/placa/{placa}
// Retorna { found, placa, marca, modelo, ano, cor, fipe } ou { found: false }
export async function consultarPlaca(placa) {
  const placaNorm = String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (placaNorm.length < 7) return { found: false };

  const token = process.env.PLATE_API_TOKEN;
  if (!token || token === 'xxxxx') return { found: false };

  try {
    const { data: d } = await axios.get(
      `https://apiplacas.com.br/api/v1/placa/${placaNorm}`,
      {
        params: { token },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://apiplacas.com.br/',
          'Origin': 'https://apiplacas.com.br',
        },
        timeout: 10000,
      }
    );
    console.log('[plates] resposta raw:', JSON.stringify(d));

    const modeloCompleto = [d.modelo, d.submodelo, d.versao]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(' ')
      .trim() || d.modelo || '';

    return {
      found:  true,
      placa:  placaNorm,
      marca:  d.marca  || '',
      modelo: modeloCompleto,
      ano:    parseInt(d.anoModelo || d.ano || 0, 10),
      cor:    d.cor    || '',
      fipe:   d.fipe?.valor ? parseFloat(d.fipe.valor) : null,
    };
  } catch (err) {
    if (err.response?.status === 404) {
      console.log('[plates] 404 para placa:', placaNorm);
      return { found: false };
    }
    console.error('[plates] Erro ao consultar placa:', err.message, err.response?.status, err.response?.data);
    return { found: false };
  }
}
