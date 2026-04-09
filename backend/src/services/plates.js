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
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (compatible; AguiarVeiculos/1.0)',
          Accept: 'application/json',
        },
        timeout: 6000,
      }
    );

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
    if (err.response?.status === 404) return { found: false };
    return { found: false };
  }
}
