import axios from 'axios';

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

// ── consultarPlaca ─────────────────────────────────────────
// API: apiplacas.com.br/api/v1/placa/{placa}
// Retorna { found, placa, marca, modelo, versao, ano, cor, fipe } ou { found: false }
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

    // Se a API retornou 200 mas sem dados essenciais → placa não encontrada
    if (!marca || !modeloCompleto) return { found: false };

    return {
      found:  true,
      placa:  placaNorm,
      marca,
      modelo: modeloCompleto,
      versao: versaoCompleta,
      ano:    anoVeiculo,
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
