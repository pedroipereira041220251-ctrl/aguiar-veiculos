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
      `https://wdapi2.com.br/consulta/${placaNorm}/${token}`,
      { timeout: 10000 }
    );
    console.log('[plates] resposta raw:', JSON.stringify(d));

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

    // Se a API retornou 200 mas sem dados essenciais → placa não encontrada
    if (!marca || !modeloCompleto) return { found: false };

    return {
      found:  true,
      placa:  placaNorm,
      marca,
      modelo: modeloCompleto,
      ano:    parseInt(d.anoModelo || d.ano || 0, 10),
      cor:    d.cor    || '',
      fipe:   fipeValor,
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
