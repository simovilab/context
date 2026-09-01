import type {
  BudgetResponse,
  ConfigResponse,
  Directive,
  Envelope,
  NodeDetail,
  NodeFields,
  RecomposeResponse,
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
