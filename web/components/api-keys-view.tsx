"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import type { APIKeyEntry, ClientDbEntry } from "@/lib/types";

export function ApiKeysView({ sessionKey, dbClients }: { sessionKey: string; dbClients: ClientDbEntry[] }) {
  const [apiKeys, setApiKeys] = useState<APIKeyEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [scope, setScope] = useState("manage");
  const [clientDbId, setClientDbId] = useState(0);
  const [lifetime, setLifetime] = useState(14);
  const [createdApiKey, setCreatedApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadApiKeys();
  }, [sessionKey]);

  async function loadApiKeys() {
    setLoading(true);
    try {
      setApiKeys(await api.getApiKeys());
      setError(null);
      setSelectedIds([]);
      setCreatedApiKey("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await api.createApiKey({ scope, clientDbId: clientDbId > 0 ? clientDbId : undefined, lifetime: lifetime > 0 ? lifetime : undefined });
      setCreatedApiKey(response.apiKey);
      await loadApiKeys();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(ids: number[]) {
    if (!ids.length) return;
    if (!window.confirm(`确认删除 ${ids.length} 个 API Key？`)) return;
    setSubmitting(true);
    try {
      for (const id of ids) {
        await api.deleteApiKey(id);
      }
      await loadApiKeys();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败。");
    } finally {
      setSubmitting(false);
    }
  }

  const clientNameById = useMemo(() => new Map(dbClients.map((client) => [client.cldbid, client.clientNickname])), [dbClients]);
  const allSelected = apiKeys.length > 0 && selectedIds.length === apiKeys.length;

  return <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
    <form className="space-y-4" onSubmit={handleCreate}>
      <h3 className="text-lg font-semibold text-white">创建 API Key</h3>
      <label className="block"><span className="mb-2 block text-sm text-slate-300">作用域</span><select className={inputClassName} value={scope} onChange={(event) => setScope(event.target.value)}><option value="manage">管理</option><option value="write">写入</option><option value="read">只读</option></select></label>
      <label className="block"><span className="mb-2 block text-sm text-slate-300">绑定客户端</span><select className={inputClassName} value={clientDbId} onChange={(event) => setClientDbId(Number(event.target.value))}><option value={0}>当前查询用户</option>{dbClients.map((client) => <option key={client.cldbid} value={client.cldbid}>{client.clientNickname} ({client.cldbid})</option>)}</select></label>
      <label className="block"><span className="mb-2 block text-sm text-slate-300">有效期</span><input className={inputClassName} type="number" min={1} value={lifetime} onChange={(event) => setLifetime(Number(event.target.value))} /></label>
      <div className="text-xs text-slate-500">生命周期沿用旧版配置，单位为天。</div>
      <button className={primaryButtonClassName} type="submit" disabled={submitting}>{submitting ? "处理中..." : "创建 API Key"}</button>
      {createdApiKey ? <div className="break-all rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{createdApiKey}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
    </form>

    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">API Key 列表</h3>
          <p className="mt-1 text-sm text-slate-500">支持旧版 apikeylist / apikeydel 管理流程。</p>
        </div>
        <button className={smallDangerButtonClassName} type="button" onClick={() => void handleDelete(selectedIds)} disabled={!selectedIds.length || submitting}>批量删除</button>
      </div>
      <div className="overflow-auto rounded-3xl border border-white/8">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-950/85 text-slate-300">
            <tr>
              <th className="px-4 py-3"><input checked={allSelected} onChange={(event) => setSelectedIds(event.target.checked ? apiKeys.map((item) => item.id) : [])} type="checkbox" /></th>
              <th className="px-4 py-3">客户端</th>
              <th className="px-4 py-3">作用域</th>
              <th className="px-4 py-3">创建时间</th>
              <th className="px-4 py-3">过期时间</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => <tr key={key.id} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3"><input checked={selectedIds.includes(key.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, key.id] : current.filter((id) => id !== key.id))} type="checkbox" /></td><td className="px-4 py-3"><div>{clientNameById.get(key.cldbid) ?? "serveradmin"}</div><div className="text-xs text-slate-500">数据库 ID {key.cldbid || 0}</div></td><td className="px-4 py-3 text-slate-400">{key.scope || "--"}</td><td className="px-4 py-3 text-slate-400">{formatEpoch(key.createdAt)}</td><td className="px-4 py-3 text-slate-400">{formatEpoch(key.expiresAt)}</td><td className="px-4 py-3"><button className={smallDangerButtonClassName} type="button" onClick={() => void handleDelete([key.id])} disabled={submitting}>删除</button></td></tr>)}
          </tbody>
        </table>
        {!loading && !apiKeys.length ? <div className="p-6 text-center text-sm text-slate-500">当前没有 API Key。</div> : null}
        {loading ? <div className="p-6 text-center text-sm text-slate-500">正在加载 API Key...</div> : null}
      </div>
    </div>
  </div>;
}

function formatEpoch(value: number) {
  if (!value) return "--";
  return new Date(value * 1000).toLocaleString("zh-CN");
}

const inputClassName = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-400/20";
const primaryButtonClassName = "inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60";
const smallDangerButtonClassName = "inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100";
