import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import supabase from '../db/supabase.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Schemas Zod ────────────────────────────────────────────
const criarVeiculoSchema = z.object({
  placa:        z.string().min(7).transform(v => v.toUpperCase()),
  marca:        z.string().min(1),
  modelo:       z.string().min(1),
  ano:          z.number().int().min(1950).max(2030),
  cor:          z.string().min(1),
  km:           z.number().int().min(0),
  preco_compra: z.number().positive(),
  preco_venda:  z.number().positive(),
  obs:          z.string().optional(),
  fipe_referencia: z.number().positive().optional(),
  ipva_vencimento: z.string().optional(),   // MM/AAAA → será parseado
  transferencia_ok: z.boolean().optional(),
  criado_via:   z.enum(['whatsapp','telegram','painel','api']).default('painel'),
});

const editarVeiculoSchema = z.object({
  placa:        z.string().min(7).transform(v => v.toUpperCase()).optional(),
  marca:        z.string().min(1).optional(),
  modelo:       z.string().min(1).optional(),
  ano:          z.number().int().min(1950).max(2030).optional(),
  cor:          z.string().min(1).optional(),
  km:           z.number().int().min(0).optional(),
  preco_compra: z.number().positive().optional(),
  preco_venda:  z.number().positive().optional(),
  obs:          z.string().optional(),
  fipe_referencia: z.number().positive().optional(),
  status:       z.enum(['disponivel','reservado','vendido','inativo']).optional(),
});

const venderSchema = z.object({
  preco_venda_final: z.number().positive(),
  data_venda:        z.string().optional(), // YYYY-MM-DD
  nome_comprador:    z.string().optional(),
  nome_vendedor:     z.string().optional(),
  forma_pagamento:   z.string().optional(),
});

const documentacaoSchema = z.object({
  transferencia_ok:  z.boolean().optional(),
  laudo_vistoria_ok: z.boolean().optional(),
  dut_ok:            z.boolean().optional(),
  crlv_ok:           z.boolean().optional(),
  ipva_vencimento:   z.string().nullable().optional(), // YYYY-MM-DD or null
});

const custoSchema = z.object({
  tipo:       z.string().min(1),
  valor:      z.number().positive(),
  descricao:  z.string().optional(),
  criado_via: z.enum(['whatsapp','telegram','painel','api']).default('painel'),
});

const ordemFotosSchema = z.array(z.object({
  id:    z.string().uuid(),
  ordem: z.number().int().min(0),
}));

// ── GET /api/veiculos ──────────────────────────────────────
// Filtros: status, busca (placa/modelo). Inclui URL da primeira foto.
router.get('/', async (req, res) => {
  try {
    const { status, busca } = req.query;

    let query = supabase
      .from('vw_veiculos_com_financeiro')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (busca) {
      query = query.or(`placa.ilike.%${busca}%,modelo.ilike.%${busca}%,marca.ilike.%${busca}%`);
    }

    const { data: veiculos, error } = await query;
    if (error) throw error;

    // Para cada veículo, buscar URL da primeira foto (ordem=0)
    const ids = veiculos.map(v => v.id);
    let fotosMap = {};

    if (ids.length > 0) {
      const { data: fotos, error: fotosError } = await supabase
        .from('fotos_veiculo')
        .select('veiculo_id, url')
        .in('veiculo_id', ids)
        .order('ordem', { ascending: true });

      if (!fotosError && fotos) {
        // pegar apenas a primeira foto de cada veículo
        for (const f of fotos) {
          if (!fotosMap[f.veiculo_id]) fotosMap[f.veiculo_id] = f.url;
        }
      }
    }

    const resultado = veiculos.map(v => ({
      ...v,
      foto_capa: fotosMap[v.id] || null,
    }));

    res.json(resultado);
  } catch (err) {
    console.error('[GET /veiculos]', err);
    res.status(500).json({ error: 'Erro ao listar veículos' });
  }
});

// ── GET /api/veiculos/:id ──────────────────────────────────
// Ficha completa: custos, fotos ordenadas, documentação, lucro_real
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [{ data: veiculo, error }, { data: custos, error: eCustos },
           { data: fotos, error: eFotos }, { data: doc, error: eDoc }] = await Promise.all([
      supabase.from('vw_veiculos_com_financeiro').select('*').eq('id', id).single(),
      supabase.from('custos_veiculo').select('*').eq('veiculo_id', id).order('data_custo', { ascending: false }),
      supabase.from('fotos_veiculo').select('*').eq('veiculo_id', id).order('ordem', { ascending: true }),
      supabase.from('documentacao_veiculo').select('*').eq('veiculo_id', id).maybeSingle(),
    ]);

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Veículo não encontrado' });
      throw error;
    }
    if (eCustos) throw eCustos;
    if (eFotos) throw eFotos;
    if (eDoc) throw eDoc;

    res.json({ ...veiculo, custos: custos || [], fotos: fotos || [], documentacao: doc });
  } catch (err) {
    console.error('[GET /veiculos/:id]', err);
    res.status(500).json({ error: 'Erro ao buscar veículo' });
  }
});

// ── POST /api/veiculos ────────────────────────────────────
// Cria veículo + documentacao_veiculo vazio automaticamente
router.post('/', async (req, res) => {
  try {
    const parsed = criarVeiculoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: Object.entries(parsed.error.flatten().fieldErrors).map(([k,v]) => `${k}: ${v}`).join(", ") || "Dados inválidos" });

    const { ipva_vencimento, transferencia_ok, ...veiculoData } = parsed.data;

    // Inserir veículo
    const { data: veiculo, error } = await supabase
      .from('veiculos')
      .insert(veiculoData)
      .select()
      .single();
    if (error) throw error;

    // Criar documentacao_veiculo automaticamente
    const docPayload = { veiculo_id: veiculo.id };
    if (ipva_vencimento) {
      // aceita MM/AAAA ou YYYY-MM
      const parts = ipva_vencimento.split('/');
      if (parts.length === 2) {
        const [mm, aaaa] = parts;
        docPayload.ipva_vencimento = `${aaaa}-${mm.padStart(2,'0')}-01`;
      }
    }
    if (transferencia_ok !== undefined) docPayload.transferencia_ok = transferencia_ok;

    const { error: docError } = await supabase
      .from('documentacao_veiculo')
      .insert(docPayload);
    if (docError) throw docError;

    res.status(201).json(veiculo);
  } catch (err) {
    console.error('[POST /veiculos]', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Placa já cadastrada' });
    res.status(500).json({ error: 'Erro ao criar veículo' });
  }
});

// ── PATCH /api/veiculos/:id ───────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const parsed = editarVeiculoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: Object.entries(parsed.error.flatten().fieldErrors).map(([k,v]) => `${k}: ${v}`).join(", ") || "Dados inválidos" });
    if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    const { data, error } = await supabase
      .from('veiculos')
      .update(parsed.data)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Veículo não encontrado' });
      throw error;
    }

    res.json(data);
  } catch (err) {
    console.error('[PATCH /veiculos/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar veículo' });
  }
});

// ── DELETE /api/veiculos/:id ──────────────────────────────
// Soft delete: status = 'inativo' — NUNCA DELETE físico
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('veiculos')
      .update({ status: 'inativo' })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Veículo não encontrado' });
      throw error;
    }
    res.json(data);
  } catch (err) {
    console.error('[DELETE /veiculos/:id]', err);
    res.status(500).json({ error: 'Erro ao inativar veículo' });
  }
});

// ── PATCH /api/veiculos/:id/vender ───────────────────────
router.patch('/:id/vender', async (req, res) => {
  try {
    const parsed = venderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: Object.entries(parsed.error.flatten().fieldErrors).map(([k,v]) => `${k}: ${v}`).join(", ") || "Dados inválidos" });

    const { preco_venda_final, data_venda, nome_comprador, nome_vendedor, forma_pagamento } = parsed.data;

    // Buscar veículo e custos para calcular lucro_real na resposta
    const { data: veiculo, error: eV } = await supabase
      .from('vw_veiculos_com_financeiro')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (eV) {
      if (eV.code === 'PGRST116') return res.status(404).json({ error: 'Veículo não encontrado' });
      throw eV;
    }
    if (veiculo.status === 'vendido') return res.status(409).json({ error: 'Veículo já está marcado como vendido' });

    const hoje = new Date();
    const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;

    const updatePayload = {
      preco_venda_final,
      data_venda: data_venda || dataHoje,
      status: 'vendido',
    };
    if (nome_vendedor)   updatePayload.nome_vendedor   = nome_vendedor;
    if (nome_comprador)  updatePayload.nome_comprador  = nome_comprador;
    if (forma_pagamento) updatePayload.forma_pagamento = forma_pagamento;

    const { data, error } = await supabase
      .from('veiculos')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    // lucro_real = preco_venda_final - preco_compra - total_custos
    const lucro_real = preco_venda_final - veiculo.preco_compra - Number(veiculo.total_custos);
    res.json({ ...data, lucro_real });
  } catch (err) {
    console.error('[PATCH /veiculos/:id/vender]', err);
    res.status(500).json({ error: 'Erro ao registrar venda' });
  }
});

// ── GET /api/veiculos/:id/custos ──────────────────────────
router.get('/:id/custos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('custos_veiculo')
      .select('*')
      .eq('veiculo_id', req.params.id)
      .order('data_custo', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[GET /veiculos/:id/custos]', err);
    res.status(500).json({ error: 'Erro ao listar custos' });
  }
});

// ── POST /api/veiculos/:id/custos ─────────────────────────
router.post('/:id/custos', async (req, res) => {
  try {
    const parsed = custoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: Object.entries(parsed.error.flatten().fieldErrors).map(([k,v]) => `${k}: ${v}`).join(", ") || "Dados inválidos" });

    // Verificar se veículo existe
    const { data: veiculo, error: eV } = await supabase
      .from('veiculos')
      .select('id, status')
      .eq('id', req.params.id)
      .single();
    if (eV || !veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });

    const { data, error } = await supabase
      .from('custos_veiculo')
      .insert({ ...parsed.data, veiculo_id: req.params.id })
      .select()
      .single();
    if (error) throw error;

    // Retornar custo + resumo financeiro atualizado
    const { data: fin } = await supabase
      .from('vw_veiculos_com_financeiro')
      .select('total_custos,investimento_total,lucro_estimado,margem_pct')
      .eq('id', req.params.id)
      .single();

    res.status(201).json({ custo: data, financeiro: fin });
  } catch (err) {
    console.error('[POST /veiculos/:id/custos]', err);
    res.status(500).json({ error: 'Erro ao lançar custo' });
  }
});

// ── DELETE /api/custos/:id ────────────────────────────────
// DELETE físico (custo é correção — PRD seção 4.3)
router.delete('/custos/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('custos_veiculo')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /custos/:id]', err);
    res.status(500).json({ error: 'Erro ao deletar custo' });
  }
});

// ── POST /api/veiculos/:id/fotos ──────────────────────────
router.post('/:id/fotos', upload.array('fotos', 20), async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se veículo existe
    const { data: veiculo, error: eV } = await supabase
      .from('veiculos')
      .select('id')
      .eq('id', id)
      .single();
    if (eV || !veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });

    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    // Buscar maior ordem atual para continuar a sequência
    const { data: existentes } = await supabase
      .from('fotos_veiculo')
      .select('ordem')
      .eq('veiculo_id', id)
      .order('ordem', { ascending: false })
      .limit(1);
    let ordemBase = existentes?.[0]?.ordem ?? -1;

    const inseridas = [];
    for (const file of req.files) {
      ordemBase += 1;
      const ext = file.originalname.split('.').pop().toLowerCase();
      const path = `${id}/${Date.now()}-${ordemBase}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('fotos-veiculos')
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('fotos-veiculos')
        .getPublicUrl(path);

      const { data: foto, error: fotoError } = await supabase
        .from('fotos_veiculo')
        .insert({ veiculo_id: id, url: publicUrl, storage_path: path, ordem: ordemBase })
        .select()
        .single();
      if (fotoError) throw fotoError;
      inseridas.push(foto);
    }

    res.status(201).json(inseridas);
  } catch (err) {
    console.error('[POST /veiculos/:id/fotos]', err);
    res.status(500).json({ error: 'Erro ao fazer upload de fotos' });
  }
});

// ── DELETE /api/fotos/:id ─────────────────────────────────
router.delete('/fotos/:id', async (req, res) => {
  try {
    const { data: foto, error: eF } = await supabase
      .from('fotos_veiculo')
      .select('storage_path')
      .eq('id', req.params.id)
      .single();
    if (eF || !foto) return res.status(404).json({ error: 'Foto não encontrada' });

    // Deletar do Storage
    await supabase.storage.from('fotos-veiculos').remove([foto.storage_path]);

    // Deletar da tabela
    const { error } = await supabase.from('fotos_veiculo').delete().eq('id', req.params.id);
    if (error) throw error;

    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /fotos/:id]', err);
    res.status(500).json({ error: 'Erro ao deletar foto' });
  }
});

// ── PATCH /api/veiculos/:id/fotos/ordem ──────────────────
router.patch('/:id/fotos/ordem', async (req, res) => {
  try {
    const parsed = ordemFotosSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: Object.entries(parsed.error.flatten().fieldErrors).map(([k,v]) => `${k}: ${v}`).join(", ") || "Dados inválidos" });

    // Atualizar cada foto em paralelo
    await Promise.all(
      parsed.data.map(({ id, ordem }) =>
        supabase.from('fotos_veiculo').update({ ordem }).eq('id', id).eq('veiculo_id', req.params.id)
      )
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /veiculos/:id/fotos/ordem]', err);
    res.status(500).json({ error: 'Erro ao reordenar fotos' });
  }
});

// ── PATCH /api/veiculos/:id/documentacao ─────────────────
router.patch('/:id/documentacao', async (req, res) => {
  try {
    const parsed = documentacaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: Object.entries(parsed.error.flatten().fieldErrors).map(([k,v]) => `${k}: ${v}`).join(", ") || "Dados inválidos" });
    if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    // Upsert: se não existe, cria
    const { data, error } = await supabase
      .from('documentacao_veiculo')
      .upsert({ veiculo_id: req.params.id, ...parsed.data }, { onConflict: 'veiculo_id' })
      .select()
      .single();
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('[PATCH /veiculos/:id/documentacao]', err);
    res.status(500).json({ error: 'Erro ao atualizar documentação' });
  }
});

// ── PATCH /api/veiculos/:id/reservar ─────────────────────
router.patch('/:id/reservar', async (req, res) => {
  try {
    const { data: veiculo, error: eV } = await supabase
      .from('veiculos').select('status').eq('id', req.params.id).single();
    if (eV) return res.status(404).json({ error: 'Veículo não encontrado' });
    if (veiculo.status !== 'disponivel') return res.status(409).json({ error: 'Apenas veículos disponíveis podem ser reservados' });

    const { data, error } = await supabase
      .from('veiculos').update({ status: 'reservado' }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[PATCH /veiculos/:id/reservar]', err);
    res.status(500).json({ error: 'Erro ao reservar veículo' });
  }
});

// ── PATCH /api/veiculos/:id/liberar ──────────────────────
// Volta de reservado para disponivel
router.patch('/:id/liberar', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('veiculos').update({ status: 'disponivel' }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[PATCH /veiculos/:id/liberar]', err);
    res.status(500).json({ error: 'Erro ao liberar veículo' });
  }
});

export default router;
