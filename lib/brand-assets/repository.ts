// Radar Creative AI - Brand Assets / Repository
// Acesso a tabela public.brand_assets via supabaseAdmin (service role),
// mesmo padrao do resto do projeto.

import { supabaseAdmin } from "@/lib/supabase";
import type { BrandAsset, BrandAssetType } from "@/lib/brand-assets/types";
import { removeBrandAssetObject } from "@/lib/brand-assets/storage";
import { syncOfficialCharacterReferences } from "@/lib/brand-character/reference-sync";

type BrandAssetRow = {
  id: string;
  name: string;
  type: BrandAssetType;
  file_url: string;
  storage_path: string | null;
  mime_type: string | null;
  usage: string | null;
  is_default: boolean;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  "id,name,type,file_url,storage_path,mime_type,usage,is_default,metadata," +
  "created_by_user_id,created_by_email,created_at,updated_at";

function rowToBrandAsset(row: BrandAssetRow): BrandAsset {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    fileUrl: row.file_url,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    usage: row.usage,
    isDefault: row.is_default,
    metadata: row.metadata ?? {},
    createdByUserId: row.created_by_user_id,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBrandAssets(type?: BrandAssetType): Promise<BrandAsset[]> {
  let query = supabaseAdmin
    .from("brand_assets")
    .select(SELECT_COLUMNS)
    .order("type", { ascending: true })
    .order("created_at", { ascending: false });

  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar brand assets: ${error.message}`);
  return ((data ?? []) as unknown as BrandAssetRow[]).map(rowToBrandAsset);
}

export async function getBrandAssetById(id: string): Promise<BrandAsset | null> {
  const { data, error } = await supabaseAdmin
    .from("brand_assets")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar brand asset: ${error.message}`);
  return data ? rowToBrandAsset(data as unknown as BrandAssetRow) : null;
}

export async function getDefaultBrandAsset(type: BrandAssetType): Promise<BrandAsset | null> {
  const { data, error } = await supabaseAdmin
    .from("brand_assets")
    .select(SELECT_COLUMNS)
    .eq("type", type)
    .eq("is_default", true)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar default de ${type}: ${error.message}`);
  return data ? rowToBrandAsset(data as unknown as BrandAssetRow) : null;
}

export async function getDefaultVideoOutro(): Promise<BrandAsset | null> {
  return getDefaultBrandAsset("VIDEO_OUTRO");
}

async function clearDefaultForType(type: BrandAssetType, exceptId?: string): Promise<void> {
  let query = supabaseAdmin
    .from("brand_assets")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("type", type)
    .eq("is_default", true);

  if (exceptId) query = query.neq("id", exceptId);

  const { error } = await query;
  if (error) {
    throw new Error(`Falha ao remover default anterior de ${type}: ${error.message}`);
  }
}

/**
 * Garante no maximo uma CHARACTER_REFERENCE com metadata.isPrimary=true.
 * Nao ha constraint no banco para isso (diferente de is_default) - a
 * garantia e so na aplicacao, como combinado para esta fase.
 */
async function clearPrimaryCharacterReference(exceptId?: string): Promise<void> {
  let query = supabaseAdmin
    .from("brand_assets")
    .select("id,metadata")
    .eq("type", "CHARACTER_REFERENCE");

  if (exceptId) query = query.neq("id", exceptId);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao localizar PRIMARY anterior: ${error.message}`);
  }

  const previousPrimaries = (data ?? []).filter(
    (row) => (row.metadata as { isPrimary?: boolean } | null)?.isPrimary === true,
  );

  for (const row of previousPrimaries) {
    const metadata = { ...(row.metadata as Record<string, unknown>), isPrimary: false };
    const { error: updateError } = await supabaseAdmin
      .from("brand_assets")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(`Falha ao retirar PRIMARY anterior: ${updateError.message}`);
    }
  }
}

function isPrimaryReference(type: BrandAssetType, metadata: Record<string, unknown> | undefined): boolean {
  return type === "CHARACTER_REFERENCE" && Boolean(metadata?.isPrimary);
}

export type CreateBrandAssetInput = {
  name: string;
  type: BrandAssetType;
  fileUrl: string;
  storagePath: string;
  mimeType: string;
  usage?: string | null;
  metadata?: Record<string, unknown>;
  isDefault?: boolean;
  createdByUserId?: string | null;
  createdByEmail?: string | null;
};

export async function createBrandAsset(input: CreateBrandAssetInput): Promise<BrandAsset> {
  if (input.isDefault) {
    // Retira o default anterior do mesmo tipo ANTES de inserir o novo -
    // nunca ha um instante com duas linhas is_default=true (o indice
    // unico parcial no banco e a ultima linha de defesa, nao a primeira).
    await clearDefaultForType(input.type);
  }

  if (isPrimaryReference(input.type, input.metadata)) {
    await clearPrimaryCharacterReference();
  }

  const payload = {
    name: input.name,
    type: input.type,
    file_url: input.fileUrl,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    usage: input.usage ?? null,
    metadata: input.metadata ?? {},
    is_default: Boolean(input.isDefault),
    created_by_user_id: input.createdByUserId ?? null,
    created_by_email: input.createdByEmail ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("brand_assets")
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(`Falha ao criar brand asset: ${error.message}`);

  if (input.type === "CHARACTER_REFERENCE") {
    await syncOfficialCharacterReferences();
  }

  return rowToBrandAsset(data as unknown as BrandAssetRow);
}

export type UpdateBrandAssetInput = {
  name?: string;
  usage?: string | null;
  metadata?: Record<string, unknown>;
  isDefault?: boolean;
};

export async function updateBrandAsset(
  id: string,
  input: UpdateBrandAssetInput,
): Promise<BrandAsset> {
  const existing = await getBrandAssetById(id);
  if (!existing) throw new Error("Brand asset nao encontrado.");

  if (input.isDefault) {
    await clearDefaultForType(existing.type, id);
  }

  const existingIsPrimary = isPrimaryReference(existing.type, existing.metadata);
  const nextMetadataIsPrimary = input.metadata !== undefined
    ? isPrimaryReference(existing.type, input.metadata)
    : existingIsPrimary;

  if (existingIsPrimary && input.metadata !== undefined && !nextMetadataIsPrimary) {
    throw new Error(
      "Esta e a referencia PRIMARY atual - nao e possivel retirar isPrimary por uma edicao comum. " +
        "Para trocar a PRIMARY, defina outra CHARACTER_REFERENCE com isPrimary=true.",
    );
  }

  if (input.metadata !== undefined && nextMetadataIsPrimary && !existingIsPrimary) {
    await clearPrimaryCharacterReference(id);
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) payload.name = input.name;
  if (input.usage !== undefined) payload.usage = input.usage;
  if (input.metadata !== undefined) payload.metadata = input.metadata;
  if (input.isDefault !== undefined) payload.is_default = input.isDefault;

  const { data, error } = await supabaseAdmin
    .from("brand_assets")
    .update(payload)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(`Falha ao atualizar brand asset: ${error.message}`);

  if (existing.type === "CHARACTER_REFERENCE" && input.metadata !== undefined) {
    await syncOfficialCharacterReferences();
  }

  return rowToBrandAsset(data as unknown as BrandAssetRow);
}

/**
 * Remove o objeto do Storage primeiro e SO DEPOIS a linha do banco. Se a
 * remocao do Storage falhar, a excecao propaga e a linha do banco
 * permanece intacta (aponta pra um arquivo que ainda existe) - nunca fica
 * um arquivo orfao sem registro.
 */
export async function deleteBrandAsset(id: string): Promise<void> {
  const existing = await getBrandAssetById(id);
  if (!existing) throw new Error("Brand asset nao encontrado.");

  if (existing.storagePath) {
    await removeBrandAssetObject(existing.storagePath);
  }

  const { error } = await supabaseAdmin.from("brand_assets").delete().eq("id", id);
  if (error) {
    throw new Error(
      `Arquivo removido do Storage, mas falha ao remover o registro do banco: ${error.message}`,
    );
  }

  if (existing.type === "CHARACTER_REFERENCE") {
    await syncOfficialCharacterReferences();
  }
}
