/**
 * ownerBot.js — canal agnóstico
 *
 * Recebe: { text, canal, owner_id, body?, message_id? }
 * Retorna: { message, keyboard?, type }
 *   type: 'list'    → WA List Message    / TG InlineKeyboard (cols)
 *         'buttons' → WA Reply Buttons   / TG InlineKeyboard
 *         'text'    → texto simples nos dois canais
 *
 * keyboard.buttons = [{ label, data }] — formato único
 * keyboard.sections = [...] — apenas para WA List Message
 */

import supabase from '../db/supabase.js';
import { consultarPlaca } from './plates.js';

// ─────────────────────────────────────────────────────────
// ENTRY POINTS
// ─────────────────────────────────────────────────────────

// Mapa estático de opções numeradas por submenu (WhatsApp texto simples)
const MENU_OPCOES = {
  main:      ['submenu_veiculos', 'submenu_consultas', 'sair'],
  veiculos:  ['novo', 'custo', 'venda', 'edicao', 'voltar'],
  consultas: ['estoque', 'financeiro', 'leads', 'alertas', 'voltar'],
};

export async function activateMenu(canal, ownerId) {
  await upsertSession(canal, ownerId, { modo_gestao: true, estado: null, dados_parciais: { current_submenu: 'main' } });
  return buildMenuPrincipal(canal);
}

export async function handler({ text, canal, owner_id, body }) {
  const sessao = await getSessao(canal, owner_id);
  const txt    = (text || '').trim();
  const data   = txt.toLowerCase();  // para comparar callbacks Telegram

  // Normalizar: remove acentos, minúsculo, só letras/números/espaço
  const norm = data
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim();

  // ── Número → selecionar opção do menu atual (WhatsApp texto) ────
  const numInput = parseInt(data, 10);
  if (!isNaN(numInput) && sessao?.modo_gestao && !sessao?.estado) {
    const submenu = sessao?.dados_parciais?.current_submenu || 'main';
    const escolha = MENU_OPCOES[submenu]?.[numInput - 1];
    if (escolha) return handler({ text: escolha, canal, owner_id, body });
  }

  // ── Sair ──────────────────────────────────────────────
  if (data === 'sair' || norm === 'sair') {
    await resetSessao(canal, owner_id);
    return txt_('Modo gestão encerrado. Mande /menu para recomeçar.');
  }

  // ── Submenus (sem estado de wizard ativo) ─────────────
  if (!sessao?.estado) {
    if (data === 'submenu_veiculos' || norm === 'veiculos') {
      await upsertSession(canal, owner_id, { dados_parciais: { current_submenu: 'veiculos' } });
      return buildSubmenuVeiculos(canal);
    }
    if (data === 'submenu_consultas' || norm === 'consultas') {
      await upsertSession(canal, owner_id, { dados_parciais: { current_submenu: 'consultas' } });
      return buildSubmenuConsultas(canal);
    }
    if (data === 'voltar' || norm === 'voltar') {
      await upsertSession(canal, owner_id, { dados_parciais: { current_submenu: 'main' } });
      return buildMenuPrincipal(canal);
    }

    // Atalhos diretos — aceita data key ou texto normalizado
    if (data === 'novo'        || norm === 'novo veiculo' || norm === 'novo')        return iniciarCadastro(canal, owner_id);
    if (data === 'custo'       || norm === 'lancar custo' || norm === 'custo')        return iniciarCusto(canal, owner_id);
    if (data === 'venda'       || norm === 'registrar venda' || norm === 'venda')     return iniciarVenda(canal, owner_id);
    if (data === 'edicao'      || norm === 'editar veiculo' || norm === 'edicao')     return iniciarEdicao(canal, owner_id);
    if (data === 'estoque'     || norm === 'ver estoque' || norm === 'estoque')       return consultarEstoque();
    if (data === 'financeiro'  || norm === 'financeiro')                              return consultarFinanceiro();
    if (data === 'leads'       || norm === 'leads de hoje' || norm === 'leads')       return consultarLeads();
    if (data === 'alertas'     || norm === 'alertas')                                 return consultarAlertas();

    // Texto livre sem sessão → mostrar menu
    return buildMenuPrincipal(canal);
  }

  // ── Wizards ativos ─────────────────────────────────────
  const estado = sessao.estado;
  const dados  = sessao.dados_parciais || {};

  if (estado === 'cadastro')       return handleCadastro(txt, data, norm, dados, canal, owner_id);
  if (estado === 'cadastro_fotos') return handleCadastroFotos(data, norm, dados, canal, owner_id, body);
  if (estado === 'edicao')         return handleEdicao(txt, data, norm, dados, canal, owner_id);
  if (estado === 'custo')          return handleCusto(txt, data, norm, dados, canal, owner_id);
  if (estado === 'custo_loop')     return handleCustoLoop(data, norm, dados, canal, owner_id);
  if (estado === 'venda')          return handleVenda(txt, data, norm, dados, canal, owner_id);

  return buildMenuPrincipal(canal);
}

// ─────────────────────────────────────────────────────────
// MENU BUILDERS
// ─────────────────────────────────────────────────────────

function buildMenuPrincipal(canal) {
  if (canal === 'telegram') {
    return {
      type: 'list',
      message: '🔧 *Menu de Gestão — Aguiar Veículos*\n\nEscolha uma opção:',
      keyboard: {
        buttons: [
          { label: '🚗 Novo veículo',    data: 'novo'    },
          { label: '💰 Lançar custo',    data: 'custo'   },
          { label: '🤝 Registrar venda', data: 'venda'   },
          { label: '✏️ Editar veículo',  data: 'edicao'  },
          { label: '📦 Ver estoque',     data: 'estoque' },
          { label: '📊 Financeiro',      data: 'financeiro' },
          { label: '👥 Leads de hoje',   data: 'leads'   },
          { label: '🔔 Alertas',         data: 'alertas' },
          { label: '❌ Sair',            data: 'sair'    },
        ],
        cols: 2,
      },
    };
  }

  // WhatsApp — List Message com submenus
  return {
    type: 'list',
    message: '🔧 *Menu de Gestão — Aguiar Veículos*\n\nEscolha uma categoria:',
    keyboard: {
      title:       'Menu Principal',
      buttonLabel: 'Ver opções',
      sections: [{
        title: 'Categorias',
        rows: [
          { id: 'submenu_veiculos',  title: '🚗 Veículos',  description: 'Cadastrar, custos, vendas' },
          { id: 'submenu_consultas', title: '🔍 Consultas', description: 'Estoque, financeiro, leads' },
          { id: 'sair',             title: '❌ Sair',       description: 'Encerrar modo gestão' },
        ],
      }],
      buttons: [
        { label: '🚗 Veículos',  data: 'submenu_veiculos'  },
        { label: '🔍 Consultas', data: 'submenu_consultas' },
        { label: '❌ Sair',      data: 'sair'              },
      ],
      cols: 1,
    },
  };
}

function buildSubmenuVeiculos(canal) {
  const buttons = [
    { label: '🚗 Novo veículo',    data: 'novo'   },
    { label: '💰 Lançar custo',    data: 'custo'  },
    { label: '🤝 Registrar venda', data: 'venda'  },
    { label: '✏️ Editar veículo',  data: 'edicao' },
    { label: '⬅️ Voltar',         data: 'voltar' },
  ];

  if (canal === 'telegram') {
    return { type: 'list', message: '🚗 *Veículos* — escolha uma ação:', keyboard: { buttons, cols: 2 } };
  }

  return {
    type: 'list',
    message: '🚗 *Veículos* — escolha uma ação:',
    keyboard: {
      title: 'Veículos', buttonLabel: 'Ver opções',
      sections: [{ title: 'Ações', rows: buttons.map(b => ({ id: b.data, title: b.label })) }],
      buttons,
    },
  };
}

function buildSubmenuConsultas(canal) {
  const buttons = [
    { label: '📦 Ver estoque',   data: 'estoque'    },
    { label: '📊 Financeiro',    data: 'financeiro' },
    { label: '👥 Leads de hoje', data: 'leads'      },
    { label: '🔔 Alertas',       data: 'alertas'    },
    { label: '⬅️ Voltar',       data: 'voltar'     },
  ];

  if (canal === 'telegram') {
    return { type: 'list', message: '🔍 *Consultas* — escolha uma opção:', keyboard: { buttons, cols: 2 } };
  }

  return {
    type: 'list',
    message: '🔍 *Consultas* — escolha uma opção:',
    keyboard: {
      title: 'Consultas', buttonLabel: 'Ver opções',
      sections: [{ title: 'Opções', rows: buttons.map(b => ({ id: b.data, title: b.label })) }],
      buttons,
    },
  };
}

function buildConfirm(message, buttons, footer = '') {
  return {
    type: 'buttons',
    message,
    keyboard: { buttons, footer },
  };
}

// ─────────────────────────────────────────────────────────
// WIZARD: CADASTRAR VEÍCULO (seção 5.4)
// ─────────────────────────────────────────────────────────

async function iniciarCadastro(canal, ownerId) {
  await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { step: 0 } });
  return txt_('🚗 *Novo veículo*\n\nDigite a *placa* do veículo:');
}

async function handleCadastro(txt, data, norm, dados, canal, ownerId) {
  const step = dados.step ?? 0;

  // ── Step 0: receber placa e consultar API ──────────────
  if (step === 0) {
    const placa = txt.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placa.length < 7) return txt_('⚠️ Placa inválida. Digite novamente (ex: ABC1234 ou ABC1D23):');

    const api = await consultarPlaca(placa);
    if (api.found) {
      const fipeStr = api.fipe ? ` · FIPE: ${fmt(api.fipe)}` : '';
      await upsertSession(canal, ownerId, {
        estado: 'cadastro',
        dados_parciais: { step: '0_confirm', placa, ...api },
      });
      return buildConfirm(
        `🔍 Encontrei:\n*${api.marca} ${api.modelo} ${api.ano}* · ${api.cor}${fipeStr}\n\nConfirma?`,
        [
          { label: '✅ Confirmar', data: 'confirmar' },
          { label: '✏️ Corrigir',  data: 'corrigir'  },
        ]
      );
    }

    // Placa não encontrada → preencher manualmente
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { step: 1, placa } });
    return txt_(`⚠️ Placa não encontrada. Vamos preencher manualmente.\n\n*Marca* (ex: Honda, Toyota):`);
  }

  // ── Step 0_confirm: resposta do confirm de placa ───────
  if (step === '0_confirm') {
    if (data === 'confirmar' || norm === 'confirmar' || data === '1') {
      // Pular steps 1-4, ir para step 5
      await upsertSession(canal, ownerId, {
        estado: 'cadastro',
        dados_parciais: { ...dados, step: 5 },
      });
      return txt_('✅ Dados confirmados.\n\n📍 *Quilometragem* (km):');
    }
    // Corrigir → voltar para step 1
    await upsertSession(canal, ownerId, {
      estado: 'cadastro',
      dados_parciais: { ...dados, step: 1 },
    });
    return txt_('✏️ Ok, vamos corrigir.\n\n*Marca* (ex: Honda, Toyota):');
  }

  // ── Step 1: marca ─────────────────────────────────────
  if (step === 1) {
    if (!txt) return txt_('⚠️ Informe a marca:');
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { ...dados, step: 2, marca: txt } });
    return txt_('*Modelo* (ex: Civic, Corolla):');
  }

  // ── Step 2: modelo ────────────────────────────────────
  if (step === 2) {
    if (!txt) return txt_('⚠️ Informe o modelo:');
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { ...dados, step: 3, modelo: txt } });
    return txt_('*Ano* (ex: 2021):');
  }

  // ── Step 3: ano ───────────────────────────────────────
  if (step === 3) {
    const ano = parseInt(txt, 10);
    if (!ano || ano < 1950 || ano > 2030) return txt_('⚠️ Ano inválido. Informe entre 1950 e 2030:');
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { ...dados, step: 4, ano } });
    return txt_('*Cor* (ex: Prata, Preto):');
  }

  // ── Step 4: cor ───────────────────────────────────────
  if (step === 4) {
    if (!txt) return txt_('⚠️ Informe a cor:');
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { ...dados, step: 5, cor: txt } });
    return txt_('📍 *Quilometragem* (km):');
  }

  // ── Step 5: km ────────────────────────────────────────
  if (step === 5) {
    const km = parseInt(txt.replace(/\D/g, ''), 10);
    if (isNaN(km) || km < 0) return txt_('⚠️ Quilometragem inválida. Digite apenas números:');
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { ...dados, step: 6, km } });
    return txt_('💵 *Preço de compra* (R$):');
  }

  // ── Step 6: preco_compra ──────────────────────────────
  if (step === 6) {
    const val = parseValor(txt);
    if (!val || val <= 0) return txt_('⚠️ Valor inválido. Ex: 45000 ou 45.000,00');
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { ...dados, step: 7, preco_compra: val } });
    return txt_('💰 *Preço de venda* (R$):');
  }

  // ── Step 7: preco_venda ───────────────────────────────
  if (step === 7) {
    const val = parseValor(txt);
    if (!val || val <= 0) return txt_('⚠️ Valor inválido. Ex: 55000 ou 55.000,00');
    if (val <= (dados.preco_compra || 0)) return txt_('⚠️ O preço de venda deve ser maior que o de compra. Tente novamente:');
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { ...dados, step: 8, preco_venda: val } });
    return buildConfirm(
      '📝 *Observações* (opcional):',
      [{ label: '⏭️ Pular', data: 'pular' }]
    );
  }

  // ── Step 8: obs ───────────────────────────────────────
  if (step === 8) {
    const obs = (data === 'pular' || data === '1') ? null : txt;
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { ...dados, step: 9, obs } });
    return buildConfirm(
      '📅 *Vencimento do IPVA* (MM/AAAA) opcional:',
      [{ label: '⏭️ Pular', data: 'pular' }]
    );
  }

  // ── Step 9: ipva_vencimento ───────────────────────────
  if (step === 9) {
    const ipva = (data === 'pular' || data === '1') ? null : txt;
    await upsertSession(canal, ownerId, { estado: 'cadastro', dados_parciais: { ...dados, step: 10, ipva_vencimento: ipva } });
    return buildConfirm(
      '📋 *Transferência* já está em dia?',
      [
        { label: '✅ Sim',    data: 'sim'   },
        { label: '⏭️ Pular', data: 'pular' },
      ]
    );
  }

  // ── Step 10: transferencia_ok → concluir ──────────────
  if (step === 10) {
    const transf = (data === 'sim' || data === '1');
    const payload = { ...dados, transferencia_ok: transf };
    return finalizarCadastro(payload, canal, ownerId);
  }

  return buildMenuPrincipal(canal);
}

async function finalizarCadastro(dados, canal, ownerId) {
  try {
    const body = {
      placa:           dados.placa,
      marca:           dados.marca,
      modelo:          dados.modelo,
      ano:             dados.ano,
      cor:             dados.cor,
      km:              dados.km,
      preco_compra:    dados.preco_compra,
      preco_venda:     dados.preco_venda,
      obs:             dados.obs || undefined,
      fipe_referencia: dados.fipe || undefined,
      criado_via:      canal,
    };

    const { data: veiculo, error } = await supabase
      .from('veiculos')
      .insert(body)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        await resetSessao(canal, ownerId);
        return txt_('⚠️ Placa já cadastrada. Operação cancelada.');
      }
      throw error;
    }

    // Criar documentacao_veiculo
    const docPayload = { veiculo_id: veiculo.id, transferencia_ok: dados.transferencia_ok };
    if (dados.ipva_vencimento) {
      const parts = dados.ipva_vencimento.split('/');
      if (parts.length === 2) docPayload.ipva_vencimento = `${parts[1]}-${parts[0].padStart(2,'0')}-01`;
    }
    await supabase.from('documentacao_veiculo').insert(docPayload);

    const lucroEst = dados.preco_venda - dados.preco_compra;
    const margem   = ((lucroEst / dados.preco_venda) * 100).toFixed(1);

    const resumo = [
      `✅ *${dados.marca} ${dados.modelo} ${dados.ano}* cadastrado!`,
      `Placa: ${dados.placa} · ${dados.cor} · ${dados.km?.toLocaleString('pt-BR')} km`,
      `💵 Compra: ${fmt(dados.preco_compra)}`,
      `💰 Venda: ${fmt(dados.preco_venda)}`,
      `📈 Lucro estimado: ${fmt(lucroEst)} (${margem}%)`,
    ].join('\n');

    // Salvar id do veículo criado para eventual upload de fotos
    await upsertSession(canal, ownerId, {
      estado: 'cadastro_fotos',
      dados_parciais: { veiculo_id: veiculo.id, veiculo_label: `${dados.marca} ${dados.modelo}` },
    });

    return buildConfirm(
      `${resumo}\n\n📸 Deseja adicionar fotos?`,
      [
        { label: '📸 Adicionar', data: 'fotos_sim'  },
        { label: '✅ Concluir',  data: 'fotos_nao'  },
      ]
    );
  } catch (err) {
    console.error('[ownerBot/finalizarCadastro]', err);
    await resetSessao(canal, ownerId);
    return txt_('❌ Erro ao salvar veículo. Tente novamente com /menu.');
  }
}

// ─────────────────────────────────────────────────────────
// WIZARD: FOTOS DO VEÍCULO (pós-cadastro)
// ─────────────────────────────────────────────────────────

async function handleCadastroFotos(data, norm, dados, canal, ownerId, body) {
  // Mapear números para botões
  if (data === '2' || (data === '1' && dados.aguardando_foto)) data = 'fotos_nao';
  else if (data === '1' && !dados.aguardando_foto)             data = 'fotos_sim';

  // Usuário recusou enviar fotos
  if (data === 'fotos_nao' || norm === 'concluir') {
    await resetSessao(canal, ownerId);
    return txt_(`✅ *${dados.veiculo_label}* cadastrado com sucesso!\n\nAcesse o painel para adicionar fotos a qualquer momento.\n\nMande /menu para continuar.`);
  }

  // Usuário quer adicionar fotos
  if (data === 'fotos_sim' || norm === 'adicionar fotos') {
    await upsertSession(canal, ownerId, {
      estado: 'cadastro_fotos',
      dados_parciais: { ...dados, aguardando_foto: true },
    });
    return buildConfirm(
      `📸 Envie as fotos do *${dados.veiculo_label}* uma a uma.\nQuando terminar, clique em Concluir.`,
      [{ label: '✅ Concluir', data: 'fotos_nao' }]
    );
  }

  // Chegou uma foto
  if (dados.aguardando_foto) {
    // ── Telegram ──────────────────────────────────────────
    if (canal === 'telegram' && body?.message?.photo) {
      const fotos  = body.message.photo;
      const melhor = fotos[fotos.length - 1];
      const fileId = melhor.file_id;
      try {
        const tgToken  = process.env.TELEGRAM_BOT_TOKEN;
        const axios    = (await import('axios')).default;
        const fileRes  = await axios.get(`https://api.telegram.org/bot${tgToken}/getFile?file_id=${fileId}`);
        const filePath = fileRes.data?.result?.file_path;
        if (!filePath) throw new Error('file_path não retornado');

        const fotoResp = await axios.get(`https://api.telegram.org/file/bot${tgToken}/${filePath}`, { responseType: 'arraybuffer' });
        const buffer   = Buffer.from(fotoResp.data);
        const ext      = filePath.split('.').pop() || 'jpg';
        return await _salvarFoto(dados, buffer, ext, `image/${ext}`);
      } catch (err) {
        console.error('[ownerBot/fotos/tg]', err.message);
        return buildConfirm('⚠️ Erro ao salvar foto. Tente outra ou conclua.', [{ label: '✅ Concluir', data: 'fotos_nao' }]);
      }
    }

    // ── WhatsApp (Z-API) ───────────────────────────────────
    if (canal === 'whatsapp') {
      const tipo    = (body?.type || '').toLowerCase();
      const isImagem = tipo === 'image' || tipo === 'imagemessage' || tipo === 'sticker';

      if (isImagem) {
        // Z-API pode enviar a imagem como URL ou base64 em campos diferentes
        const imageUrl =
          body?.image?.url ||
          body?.image?.imageMessage?.url ||
          body?.downloadUrl ||
          (typeof body?.image === 'string' && body.image.startsWith('http') ? body.image : null);

        const base64Str =
          typeof body?.image === 'string' && !body.image.startsWith('http') ? body.image : null;

        console.log('[ownerBot/fotos/wa] imageUrl:', imageUrl?.slice(0, 80), '| hasBase64:', !!base64Str);

        try {
          let buffer, ext = 'jpg', contentType = 'image/jpeg';

          if (base64Str) {
            buffer = Buffer.from(base64Str, 'base64');
          } else if (imageUrl) {
            const axios    = (await import('axios')).default;
            const fotoResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
            buffer      = Buffer.from(fotoResp.data);
            contentType = fotoResp.headers['content-type'] || 'image/jpeg';
            ext         = contentType.split('/')[1]?.split(';')[0] || 'jpg';
          } else {
            console.warn('[ownerBot/fotos/wa] sem URL/base64. body.type:', body?.type, 'body.image keys:', Object.keys(body?.image || {}));
            return buildConfirm('⚠️ Não consegui extrair a foto. Tente enviar novamente.', [{ label: '✅ Concluir', data: 'fotos_nao' }]);
          }

          return await _salvarFoto(dados, buffer, ext, contentType);
        } catch (err) {
          console.error('[ownerBot/fotos/wa]', err.message);
          return buildConfirm('⚠️ Erro ao salvar foto. Tente outra ou conclua.', [{ label: '✅ Concluir', data: 'fotos_nao' }]);
        }
      }
    }

    // Mensagem de texto enquanto aguarda foto
    return buildConfirm(
      `📸 Envie a foto do *${dados.veiculo_label}* como imagem.`,
      [{ label: '✅ Concluir', data: 'fotos_nao' }]
    );
  }

  await resetSessao(canal, ownerId);
  return buildMenuPrincipal(canal);
}

// ─────────────────────────────────────────────────────────
// HELPER: salvar foto no Supabase Storage
// ─────────────────────────────────────────────────────────

async function _salvarFoto(dados, buffer, ext, contentType) {
  const storagePath = `${dados.veiculo_id}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('fotos-veiculos')
    .upload(storagePath, buffer, { contentType });
  if (upErr) throw upErr;

  const { data: { publicUrl } } = supabase.storage
    .from('fotos-veiculos')
    .getPublicUrl(storagePath);

  const { data: existentes } = await supabase
    .from('fotos_veiculo')
    .select('ordem')
    .eq('veiculo_id', dados.veiculo_id)
    .order('ordem', { ascending: false })
    .limit(1);
  const ordem = (existentes?.[0]?.ordem ?? -1) + 1;

  await supabase.from('fotos_veiculo').insert({
    veiculo_id:   dados.veiculo_id,
    url:          publicUrl,
    storage_path: storagePath,
    ordem,
  });

  return buildConfirm(
    `✅ Foto ${ordem + 1} salva! Envie mais fotos ou conclua.`,
    [{ label: '✅ Concluir', data: 'fotos_nao' }]
  );
}

// ─────────────────────────────────────────────────────────
// WIZARD: LANÇAR CUSTO (seção 5.5)
// ─────────────────────────────────────────────────────────
// WIZARD: EDITAR VEÍCULO
// ─────────────────────────────────────────────────────────

async function iniciarEdicao(canal, ownerId) {
  await upsertSession(canal, ownerId, { estado: 'edicao', dados_parciais: { step: 1 } });
  return txt_('✏️ *Editar veículo*\n\nDigite a *placa* do veículo:');
}

async function handleEdicao(txt, data, norm, dados, canal, ownerId) {
  const step = dados.step ?? 1;

  // ── Step 1: placa ─────────────────────────────────────
  if (step === 1) {
    const placa = txt.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placa.length < 7) return txt_('⚠️ Placa inválida. Tente novamente:');

    const { data: veiculo } = await supabase
      .from('veiculos')
      .select('id, modelo, ano, preco_venda, km, cor, obs')
      .eq('placa', placa)
      .neq('status', 'inativo')
      .maybeSingle();

    if (!veiculo) return txt_(`⚠️ Veículo *${placa}* não encontrado. Tente outra placa:`);

    await upsertSession(canal, ownerId, {
      estado: 'edicao',
      dados_parciais: { step: '1_campo', placa, veiculo_id: veiculo.id, modelo: `${veiculo.modelo} ${veiculo.ano}` },
    });

    return buildConfirm(
      `Veículo: *${veiculo.modelo} ${veiculo.ano}* (${placa})\n💰 Venda: ${fmt(veiculo.preco_venda)} · ${veiculo.km?.toLocaleString('pt-BR')} km · ${veiculo.cor}\n\nO que deseja editar?`,
      [
        { label: '💰 Preço de venda', data: 'campo_preco'  },
        { label: '📍 Quilometragem',  data: 'campo_km'     },
        { label: '🎨 Cor',            data: 'campo_cor'    },
        { label: '📝 Observações',    data: 'campo_obs'    },
      ]
    );
  }

  // ── Step 1_campo: escolheu o campo ───────────────────
  if (step === '1_campo') {
    const NUM_CAMPO = { '1': 'campo_preco', '2': 'campo_km', '3': 'campo_cor', '4': 'campo_obs' };
    if (NUM_CAMPO[data]) data = NUM_CAMPO[data];

    const campos = {
      campo_preco: { label: 'novo preço de venda (R$)', field: 'preco_venda' },
      campo_km:    { label: 'nova quilometragem',       field: 'km'          },
      campo_cor:   { label: 'nova cor',                 field: 'cor'         },
      campo_obs:   { label: 'observações',              field: 'obs'         },
    };
    if (norm === 'preco de venda' || norm === 'preco') data = 'campo_preco';
    if (norm === 'quilometragem'  || norm === 'km')    data = 'campo_km';
    if (norm === 'cor')                                data = 'campo_cor';
    if (norm === 'observacoes'    || norm === 'obs')   data = 'campo_obs';
    const campo = campos[data];
    if (!campo) return buildMenuPrincipal(canal);

    await upsertSession(canal, ownerId, {
      estado: 'edicao',
      dados_parciais: { ...dados, step: '2_valor', field: campo.field },
    });
    return txt_(`Digite o ${campo.label}:`);
  }

  // ── Step 2_valor: salvar novo valor ──────────────────
  if (step === '2_valor') {
    let valor = txt.trim();
    if (dados.field === 'preco_venda' || dados.field === 'km') {
      const num = parseValor(valor);
      if (!num || num <= 0) return txt_('⚠️ Valor inválido. Tente novamente:');
      valor = num;
    }

    const { error } = await supabase
      .from('veiculos')
      .update({ [dados.field]: valor })
      .eq('id', dados.veiculo_id);

    if (error) {
      console.error('[ownerBot/edicao]', error);
      await resetSessao(canal, ownerId);
      return txt_('❌ Erro ao salvar. Tente novamente com /menu.');
    }

    await resetSessao(canal, ownerId);
    return txt_(`✅ *${dados.modelo}* atualizado com sucesso!\n\nMande /menu para continuar.`);
  }

  return buildMenuPrincipal(canal);
}

// ─────────────────────────────────────────────────────────

async function iniciarCusto(canal, ownerId) {
  await upsertSession(canal, ownerId, { estado: 'custo', dados_parciais: { step: 1 } });
  return txt_('💰 *Lançar custo*\n\nDigite a *placa* do veículo:');
}

async function handleCusto(txt, data, norm, dados, canal, ownerId) {
  const step = dados.step ?? 1;

  // ── Step 1: placa ─────────────────────────────────────
  if (step === 1) {
    const placa = txt.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placa.length < 7) return txt_('⚠️ Placa inválida. Tente novamente:');

    const { data: veiculo } = await supabase
      .from('vw_veiculos_com_financeiro')
      .select('id, modelo, ano, preco_venda, investimento_total, lucro_estimado')
      .eq('placa', placa)
      .neq('status', 'inativo')
      .maybeSingle();

    if (!veiculo) return txt_(`⚠️ Veículo *${placa}* não encontrado. Tente outra placa:`);

    await upsertSession(canal, ownerId, {
      estado: 'custo',
      dados_parciais: { step: '1_confirm', placa, veiculo_id: veiculo.id, modelo: `${veiculo.modelo} ${veiculo.ano}` },
    });

    return buildConfirm(
      `Veículo encontrado:\n*${veiculo.modelo} ${veiculo.ano}* (${placa})\nInvestimento atual: ${fmt(veiculo.investimento_total)}\n\nConfirma?`,
      [
        { label: `✅ ${veiculo.modelo}`,  data: 'confirmar'    },
        { label: '🔄 Outra placa',        data: 'outra_placa'  },
      ]
    );
  }

  if (step === '1_confirm') {
    if (data === '2') data = 'outra_placa';
    if (data === '1') data = 'confirmar';
    if (data === 'outra_placa' || norm === 'outra placa') {
      await upsertSession(canal, ownerId, { estado: 'custo', dados_parciais: { step: 1 } });
      return txt_('Digite a placa do veículo:');
    }
    await upsertSession(canal, ownerId, { estado: 'custo', dados_parciais: { ...dados, step: 2 } });
    return txt_('🔧 *Tipo de custo*:\npintura, funilaria, mecânica, revisão, documentação, outros\n\nDigite o tipo:');
  }

  // ── Step 2: tipo ──────────────────────────────────────
  if (step === 2) {
    if (!txt) return txt_('⚠️ Informe o tipo de custo:');
    await upsertSession(canal, ownerId, { estado: 'custo', dados_parciais: { ...dados, step: 3, tipo: txt } });
    return txt_('💵 *Valor do custo* (R$):');
  }

  // ── Step 3: valor ─────────────────────────────────────
  if (step === 3) {
    const val = parseValor(txt);
    if (!val || val <= 0) return txt_('⚠️ Valor inválido. Ex: 1500 ou 1.500,00');
    await upsertSession(canal, ownerId, { estado: 'custo', dados_parciais: { ...dados, step: 4, valor: val } });
    return buildConfirm(
      '📝 *Observação* (opcional):',
      [
        { label: '💬 Adicionar', data: 'adicionar' },
        { label: '⏭️ Pular',    data: 'pular'     },
      ]
    );
  }

  // ── Step 4: descricao → salvar ────────────────────────
  if (step === 4) {
    if (data === '1') data = 'adicionar';
    if (data === '2') data = 'pular';
    const descricao = data === 'pular' ? null : (data === 'adicionar' ? null : txt);

    if (data === 'adicionar' || norm === 'adicionar') {
      await upsertSession(canal, ownerId, { estado: 'custo', dados_parciais: { ...dados, step: '4_obs' } });
      return txt_('Digite a observação:');
    }

    return finalizarCusto({ ...dados, descricao }, canal, ownerId);
  }

  if (step === '4_obs') {
    return finalizarCusto({ ...dados, descricao: txt }, canal, ownerId);
  }

  return buildMenuPrincipal(canal);
}

async function finalizarCusto(dados, canal, ownerId) {
  try {
    const { error } = await supabase.from('custos_veiculo').insert({
      veiculo_id: dados.veiculo_id,
      tipo:       dados.tipo,
      valor:      dados.valor,
      descricao:  dados.descricao || null,
      criado_via: canal,
    });
    if (error) throw error;

    const { data: fin } = await supabase
      .from('vw_veiculos_com_financeiro')
      .select('total_custos, investimento_total, lucro_estimado, margem_pct')
      .eq('id', dados.veiculo_id)
      .single();

    const resumo = [
      `✅ Custo lançado!`,
      `🔧 ${dados.tipo}: ${fmt(dados.valor)}`,
      dados.descricao ? `📝 ${dados.descricao}` : '',
      '',
      `*${dados.modelo}* — resumo atualizado:`,
      `Total custos: ${fmt(fin?.total_custos)}`,
      `Investimento: ${fmt(fin?.investimento_total)}`,
      `Lucro estimado: ${fmt(fin?.lucro_estimado)} (${fin?.margem_pct}%)`,
    ].filter(Boolean).join('\n');

    await upsertSession(canal, ownerId, {
      estado: 'custo_loop',
      dados_parciais: { veiculo_id: dados.veiculo_id, modelo: dados.modelo },
    });

    return buildConfirm(
      `${resumo}\n\n➕ Lançar mais um custo?`,
      [
        { label: '➕ Sim',       data: 'sim'  },
        { label: '✅ Concluir', data: 'nao'  },
      ]
    );
  } catch (err) {
    console.error('[ownerBot/finalizarCusto]', err);
    await resetSessao(canal, ownerId);
    return txt_('❌ Erro ao lançar custo. Tente novamente com /menu.');
  }
}

async function handleCustoLoop(data, norm, dados, canal, ownerId) {
  if (data === '1') data = 'sim';
  if (data === '2') data = 'nao';
  if (data === 'sim' || norm === 'sim') {
    await upsertSession(canal, ownerId, {
      estado: 'custo',
      dados_parciais: { step: 2, veiculo_id: dados.veiculo_id, modelo: dados.modelo },
    });
    return txt_('🔧 *Tipo de custo*:\npintura, funilaria, mecânica, revisão, documentação, outros\n\nDigite o tipo:');
  }
  await resetSessao(canal, ownerId);
  return txt_('✅ Custos salvos. Mande /menu para continuar.');
}

// ─────────────────────────────────────────────────────────
// WIZARD: REGISTRAR VENDA (seção 5.6)
// ─────────────────────────────────────────────────────────

async function iniciarVenda(canal, ownerId) {
  await upsertSession(canal, ownerId, { estado: 'venda', dados_parciais: { step: 1 } });
  return txt_('🤝 *Registrar venda*\n\nDigite a *placa* do veículo:');
}

async function handleVenda(txt, data, norm, dados, canal, ownerId) {
  const step = dados.step ?? 1;

  // ── Step 1: placa ─────────────────────────────────────
  if (step === 1) {
    const placa = txt.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placa.length < 7) return txt_('⚠️ Placa inválida. Tente novamente:');

    const { data: veiculo } = await supabase
      .from('vw_veiculos_com_financeiro')
      .select('id, modelo, ano, preco_venda, total_custos, preco_compra')
      .eq('placa', placa)
      .eq('status', 'disponivel')
      .maybeSingle();

    if (!veiculo) return txt_(`⚠️ Veículo *${placa}* não encontrado ou não disponível. Tente outra placa:`);

    await upsertSession(canal, ownerId, {
      estado: 'venda',
      dados_parciais: {
        step: '1_confirm', placa,
        veiculo_id: veiculo.id,
        modelo:     `${veiculo.modelo} ${veiculo.ano}`,
        preco_venda: veiculo.preco_venda,
        preco_compra: veiculo.preco_compra,
        total_custos: veiculo.total_custos,
      },
    });

    return buildConfirm(
      `Veículo encontrado:\n*${veiculo.modelo} ${veiculo.ano}* (${placa})\nPreço de venda: ${fmt(veiculo.preco_venda)}\n\nConfirma?`,
      [
        { label: `✅ ${veiculo.modelo} · ${fmt(veiculo.preco_venda)}`, data: 'confirmar'   },
        { label: '🔄 Outra placa',                                      data: 'outra_placa' },
      ]
    );
  }

  if (step === '1_confirm') {
    if (data === '2') data = 'outra_placa';
    if (data === '1') data = 'confirmar';
    if (data === 'outra_placa' || norm === 'outra placa') {
      await upsertSession(canal, ownerId, { estado: 'venda', dados_parciais: { step: 1 } });
      return txt_('Digite a placa do veículo:');
    }
    await upsertSession(canal, ownerId, { estado: 'venda', dados_parciais: { ...dados, step: 2 } });
    return txt_(`💵 *Por qual valor foi vendido?* (R$)\n_(Preço pedido era ${fmt(dados.preco_venda)})_`);
  }

  // ── Step 2: preco_venda_final ─────────────────────────
  if (step === 2) {
    const val = parseValor(txt);
    if (!val || val <= 0) return txt_('⚠️ Valor inválido. Ex: 52000 ou 52.000,00');
    await upsertSession(canal, ownerId, { estado: 'venda', dados_parciais: { ...dados, step: 3, preco_venda_final: val } });
    return buildConfirm(
      '🧑‍💼 *Nome do vendedor?*',
      [
        { label: '🧑‍💼 Informar', data: 'informar' },
        { label: '⏭️ Pular',     data: 'pular'    },
      ]
    );
  }

  // ── Step 3: vendedor ──────────────────────────────────
  if (step === 3) {
    if (data === '1') data = 'informar';
    if (data === '2') data = 'pular';
    if (data === 'informar' || norm === 'informar') {
      await upsertSession(canal, ownerId, { estado: 'venda', dados_parciais: { ...dados, step: '3_vendedor' } });
      return txt_('Digite o nome do vendedor:');
    }
    // pular → ir para comprador
    await upsertSession(canal, ownerId, { estado: 'venda', dados_parciais: { ...dados, step: 4, nome_vendedor: null } });
    return buildConfirm(
      '👤 *Nome do comprador?*',
      [
        { label: '👤 Informar', data: 'informar' },
        { label: '⏭️ Pular',   data: 'pular'    },
      ]
    );
  }

  if (step === '3_vendedor') {
    await upsertSession(canal, ownerId, { estado: 'venda', dados_parciais: { ...dados, step: 4, nome_vendedor: txt } });
    return buildConfirm(
      '👤 *Nome do comprador?*',
      [
        { label: '👤 Informar', data: 'informar' },
        { label: '⏭️ Pular',   data: 'pular'    },
      ]
    );
  }

  // ── Step 4: nome comprador → finalizar ────────────────
  if (step === 4) {
    if (data === '1') data = 'informar';
    if (data === '2') data = 'pular';
    if (data === 'informar' || norm === 'informar') {
      await upsertSession(canal, ownerId, { estado: 'venda', dados_parciais: { ...dados, step: '4_nome' } });
      return txt_('Digite o nome do comprador:');
    }
    return finalizarVenda({ ...dados, nome_comprador: null }, canal, ownerId);
  }

  if (step === '4_nome') {
    return finalizarVenda({ ...dados, nome_comprador: txt }, canal, ownerId);
  }

  return buildMenuPrincipal(canal);
}

async function finalizarVenda(dados, canal, ownerId) {
  try {
    const updatePayload = {
      preco_venda_final: dados.preco_venda_final,
      data_venda:        (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
      status:            'vendido',
    };
    if (dados.nome_vendedor)  updatePayload.nome_vendedor  = dados.nome_vendedor;
    if (dados.nome_comprador) updatePayload.nome_comprador = dados.nome_comprador;

    const { error } = await supabase
      .from('veiculos')
      .update(updatePayload)
      .eq('id', dados.veiculo_id);
    if (error) throw error;

    // lucro_real = preco_venda_final - preco_compra - total_custos
    const lucroReal = dados.preco_venda_final - Number(dados.preco_compra) - Number(dados.total_custos);
    const margem    = ((lucroReal / dados.preco_venda_final) * 100).toFixed(1);

    await resetSessao(canal, ownerId);

    const linhas = [
      `✅ *Venda registrada!*`,
      `🚗 ${dados.modelo} (${dados.placa})`,
      `💵 Valor recebido: ${fmt(dados.preco_venda_final)}`,
      `📈 Lucro real: ${fmt(lucroReal)} (${margem}%)`,
    ];
    if (dados.nome_vendedor)  linhas.push(`🧑‍💼 Vendedor: ${dados.nome_vendedor}`);
    if (dados.nome_comprador) linhas.push(`👤 Comprador: ${dados.nome_comprador}`);
    linhas.push('');
    linhas.push('Mande /menu para continuar.');

    return txt_(linhas.join('\n'));
  } catch (err) {
    console.error('[ownerBot/finalizarVenda]', err);
    await resetSessao(canal, ownerId);
    return txt_('❌ Erro ao registrar venda. Tente novamente com /menu.');
  }
}

// ─────────────────────────────────────────────────────────
// CONSULTAS RÁPIDAS (seção 5.7)
// ─────────────────────────────────────────────────────────

async function consultarEstoque() {
  const { data: veiculos } = await supabase
    .from('vw_veiculos_com_financeiro')
    .select('status, preco_venda, investimento_total, lucro_estimado, modelo, ano, placa, km')
    .neq('status', 'inativo')
    .order('created_at', { ascending: false });

  if (!veiculos?.length) return txt_('📦 Nenhum veículo no estoque.');

  const disp = veiculos.filter(v => v.status === 'disponivel');
  const res  = veiculos.filter(v => v.status === 'reservado');
  const vend = veiculos.filter(v => v.status === 'vendido');

  const totalInv  = disp.reduce((s, v) => s + Number(v.investimento_total), 0);
  const totalLucro = disp.reduce((s, v) => s + Number(v.lucro_estimado), 0);

  const lista = disp.slice(0, 8).map(v =>
    `• ${v.placa} — ${v.modelo} ${v.ano} · ${fmt(v.preco_venda)}`
  ).join('\n');

  return txt_([
    `📦 *Estoque Atual*`,
    ``,
    `🟢 Disponível: ${disp.length} · 🟡 Reservado: ${res.length} · ✅ Vendido: ${vend.length}`,
    ``,
    `💰 Total investido: ${fmt(totalInv)}`,
    `📈 Lucro potencial: ${fmt(totalLucro)}`,
    ``,
    disp.length ? `*Disponíveis:*\n${lista}` : '',
    disp.length > 8 ? `_...e mais ${disp.length - 8} veículos. Ver detalhes no painel._` : '',
  ].filter(Boolean).join('\n'));
}

async function consultarFinanceiro() {
  const agora = new Date();
  const mes   = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const ini   = `${mes}-01`;
  const fim   = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: vendas } = await supabase
    .from('vw_veiculos_com_financeiro')
    .select('preco_venda_final, lucro_real, preco_compra, total_custos')
    .eq('status', 'vendido')
    .gte('data_venda', ini)
    .lte('data_venda', fim);

  if (!vendas?.length) return txt_(`📊 Nenhuma venda em ${mes}.`);

  const receita = vendas.reduce((s, v) => s + Number(v.preco_venda_final || 0), 0);
  const lucro   = vendas.reduce((s, v) => s + Number(v.lucro_real || 0), 0);
  const margem  = receita > 0 ? ((lucro / receita) * 100).toFixed(1) : '0';

  return txt_([
    `📊 *Financeiro — ${mes}*`,
    ``,
    `🛒 Vendas: ${vendas.length}`,
    `💵 Receita: ${fmt(receita)}`,
    `📈 Lucro real: ${fmt(lucro)}`,
    `📉 Margem: ${margem}%`,
    ``,
    `_Detalhes completos no painel._`,
  ].join('\n'));
}

async function consultarLeads() {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: leads } = await supabase
    .from('leads')
    .select('nome, canal, status_funil, atendimento_humano, score_qualificacao, veiculos:veiculo_interesse_id(modelo, ano)')
    .gte('created_at', desde)
    .order('created_at', { ascending: false });

  if (!leads?.length) return txt_('👥 Nenhum lead nas últimas 24h.');

  const lista = leads.map(l => {
    const veiculo = l.veiculos ? `${l.veiculos.modelo} ${l.veiculos.ano}` : '—';
    const humano  = l.atendimento_humano ? ' 🤝' : '';
    const score   = l.score_qualificacao ? ` ⭐${l.score_qualificacao}` : '';
    const canal   = l.canal === 'whatsapp' ? 'WA' : 'IG';
    return `• ${l.nome || 'Sem nome'} [${canal}${humano}${score}] — ${veiculo}`;
  }).join('\n');

  return txt_(`👥 *Leads nas últimas 24h* (${leads.length})\n\n${lista}`);
}

async function consultarAlertas() {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: config } = await supabase
      .from('configuracoes')
      .select('alerta_ipva_dias, alerta_parado_dias')
      .eq('id', 1)
      .maybeSingle();
    const diasIpva   = config?.alerta_ipva_dias   || 15;
    const diasParado = config?.alerta_parado_dias  || 45;

    const limiteIpva   = new Date(Date.now() + diasIpva * 86400000).toISOString().slice(0, 10);
    const limiteParado = new Date(Date.now() - diasParado * 86400000).toISOString();

    const [{ data: ipva, error: errIpva }, { data: parados, error: errParados }] = await Promise.all([
      supabase
        .from('documentacao_veiculo')
        .select('ipva_vencimento, veiculos:veiculo_id(placa, modelo, status)')
        .lte('ipva_vencimento', limiteIpva)
        .gte('ipva_vencimento', hoje),
      supabase
        .from('veiculos')
        .select('placa, modelo, updated_at')
        .eq('status', 'disponivel')
        .lte('updated_at', limiteParado),
    ]);

    if (errIpva)    console.error('[consultarAlertas] ipva:', errIpva.message);
    if (errParados) console.error('[consultarAlertas] parados:', errParados.message);

    const ipvaAtivos    = (ipva    || []).filter(i => i.veiculos?.status !== 'inativo');
    const paradosAtivos = parados  || [];

    if (!ipvaAtivos.length && !paradosAtivos.length) return txt_('✅ Nenhum alerta ativo no momento.');

    const linhas = ['🔔 *Alertas ativos*', ''];

    if (ipvaAtivos.length) {
      linhas.push(`🔴 *IPVA vencendo (${diasIpva} dias):* ${ipvaAtivos.length}`);
      ipvaAtivos.slice(0, 3).forEach(i => {
        linhas.push(`  • ${i.veiculos?.placa} — ${i.veiculos?.modelo} · vence ${i.ipva_vencimento}`);
      });
      linhas.push('');
    }

    if (paradosAtivos.length) {
      linhas.push(`🟡 *Parados > ${diasParado} dias:* ${paradosAtivos.length}`);
      paradosAtivos.slice(0, 3).forEach(v => {
        linhas.push(`  • ${v.placa} — ${v.modelo}`);
      });
      linhas.push('');
    }

    linhas.push('_Ver detalhes completos no painel._');
    return txt_(linhas.join('\n'));
  } catch (err) {
    console.error('[consultarAlertas]', err.message);
    return txt_('❌ Erro ao buscar alertas. Tente novamente.');
  }
}

// ─────────────────────────────────────────────────────────
// SESSÃO — CRUD
// ─────────────────────────────────────────────────────────

async function getSessao(canal, ownerId) {
  const { data } = await supabase
    .from('bot_sessions')
    .select('*')
    .eq('canal', canal)
    .eq('owner_id', String(ownerId))
    .maybeSingle();
  return data;
}

async function upsertSession(canal, ownerId, campos) {
  await supabase
    .from('bot_sessions')
    .upsert(
      { canal, owner_id: String(ownerId), modo_gestao: true, ...campos },
      { onConflict: 'canal,owner_id' }
    );
}

async function resetSessao(canal, ownerId) {
  await supabase
    .from('bot_sessions')
    .upsert(
      { canal, owner_id: String(ownerId), modo_gestao: false, estado: null, dados_parciais: {} },
      { onConflict: 'canal,owner_id' }
    );
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function txt_(message) {
  return { type: 'text', message };
}

function fmt(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseValor(txt) {
  // Aceita: 45000 | 45.000 | 45.000,00 | 45,000.00 | R$ 45.000,00
  const s = String(txt).replace(/[R$\s]/g, '');
  // Formato BR: ponto como milhar, vírgula como decimal
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // Formato US: vírgula como milhar, ponto como decimal
  if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(s)) {
    return parseFloat(s.replace(/,/g, ''));
  }
  // Sem separador
  return parseFloat(s.replace(',', '.')) || null;
}
