import type {
  BudgetResponse,
  ConfigResponse,
  CorpusResponse,
  Directive,
  Envelope,
  Lang,
  NodeDetail,
  NodeFields,
  RecomposeResponse,
  SearchResponse,
  TreeResponse,
} from "./types";

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; blastRadius: string | null }> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const blastRadius = res.headers.get("X-Blast-Radius");
  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(`Invalid response from server (${res.status})`);
  }
  if (!body.ok) {
    throw new ApiError(body.error);
  }
  return { data: body.data, blastRadius };
}

export async function getConfig(): Promise<ConfigResponse> {
  const { data } = await request<ConfigResponse>("/config");
  return data;
}

export async function getTree(): Promise<TreeResponse> {
  const { data } = await request<TreeResponse>("/tree");
  return data;
}

export async function getNode(id: string): Promise<NodeDetail> {
  const { data } = await request<NodeDetail>(`/node/${encodeURIComponent(id)}`);
  return data;
}

export interface PutNodeBody {
  fields?: Partial<NodeFields>;
  localDirectives?: Directive[];
  referenceMd?: string;
}

export async function putNode(
  id: string,
  body: PutNodeBody,
): Promise<{ data: NodeDetail; blastRadius: string | null }> {
  return request<NodeDetail>(`/node/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function getBudget(): Promise<BudgetResponse> {
  const { data } = await request<BudgetResponse>("/budget");
  return data;
}

export async function recompose(): Promise<RecomposeResponse> {
  const { data } = await request<RecomposeResponse>("/recompose", { method: "POST" });
  return data;
}

// --- P3 (D10): per-node corpus + branch-scoped retrieval ---

export async function getCorpus(id: string): Promise<CorpusResponse> {
  const { data } = await request<CorpusResponse>(`/node/${encodeURIComponent(id)}/corpus`);
  return data;
}

export interface CorpusUploadBody {
  file: string;
  content: string;
  title?: string;
  source?: string;
  license?: string;
  lang?: Lang;
}

export async function uploadCorpusEntry(id: string, body: CorpusUploadBody): Promise<CorpusResponse> {
  const { data } = await request<CorpusResponse>(`/node/${encodeURIComponent(id)}/corpus`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data;
}

export async function deleteCorpusEntry(id: string, file: string): Promise<CorpusResponse> {
  const { data } = await request<CorpusResponse>(
    `/node/${encodeURIComponent(id)}/corpus/${encodeURIComponent(file)}`,
    { method: "DELETE" },
  );
  return data;
}

export interface CorpusFileResponse {
  file: string;
  content: string;
  ext: string;
}

export async function getCorpusFile(id: string, file: string): Promise<CorpusFileResponse> {
  const { data } = await request<CorpusFileResponse>(
    `/node/${encodeURIComponent(id)}/corpus/${encodeURIComponent(file)}`,
  );
  return data;
}

export async function searchNode(id: string, text: string, k?: number): Promise<SearchResponse> {
  const { data } = await request<SearchResponse>(`/node/${encodeURIComponent(id)}/search`, {
    method: "POST",
    body: JSON.stringify({ text, k }),
  });
  return data;
}
