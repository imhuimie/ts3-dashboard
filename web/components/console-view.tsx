"use client";

import { useState, type FormEvent } from "react";

import { api } from "@/lib/api";

type HistoryEntry = {
  id: string;
  command: string;
  output: string;
  isError: boolean;
};

export function ConsoleView() {
  const [input, setInput] = useState("");
  const [prettyPrint, setPrettyPrint] = useState(true);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = input.trim();
    if (!command) return;

    setRunning(true);
    try {
      const records = await api.executeConsole(command);
      pushHistory({ command, output: JSON.stringify(records, null, prettyPrint ? 2 : 0), isError: false });
      setInput("");
    } catch (cause) {
      pushHistory({ command, output: cause instanceof Error ? cause.message : "命令执行失败。", isError: true });
    } finally {
      setRunning(false);
    }
  }

  function pushHistory(entry: Omit<HistoryEntry, "id">) {
    setHistory((current) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...entry }, ...current].slice(0, 20));
  }

  return <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h3 className="text-lg font-semibold text-white">Server Query Console</h3>
      <p className="text-sm text-slate-500">直接执行旧版控制台命令，支持参数和 flags，例如 <code>clientlist -uid</code>。</p>
      <label className="block"><span className="mb-2 block text-sm text-slate-300">命令</span><textarea className={`${inputClassName} min-h-36 font-mono text-sm`} value={input} onChange={(event) => setInput(event.target.value)} placeholder="例如：serverinfo 或 clientlist -uid" /></label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input checked={prettyPrint} onChange={(event) => setPrettyPrint(event.target.checked)} type="checkbox" />格式化输出</label>
      <div className="flex gap-2">
        <button className={primaryButtonClassName} type="submit" disabled={running || !input.trim()}>{running ? "执行中..." : "执行命令"}</button>
        <button className={secondaryButtonClassName} type="button" onClick={() => setHistory([])} disabled={!history.length}>清空历史</button>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs leading-6 text-slate-400">已禁用 <code>quit</code>，<code>use sid=</code> 会同步回面板会话。</div>
    </form>

    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">执行历史</h3>
      {!history.length ? <div className="rounded-3xl border border-dashed border-white/10 p-6 text-sm text-slate-500">还没有执行记录。</div> : null}
      <div className="space-y-3">
        {history.map((entry) => <div key={entry.id} className="rounded-3xl border border-white/8 bg-white/[0.03] p-4"><div className="flex items-center justify-between gap-3"><div className="font-mono text-sm text-cyan-200">{entry.command}</div><div className={`text-xs ${entry.isError ? "text-rose-300" : "text-emerald-300"}`}>{entry.isError ? "失败" : "成功"}</div></div><pre className="mt-3 overflow-auto rounded-2xl border border-white/8 bg-slate-950/70 p-4 text-xs leading-6 text-slate-200">{entry.output}</pre></div>)}
      </div>
    </div>
  </div>;
}

const inputClassName = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-400/20";
const primaryButtonClassName = "inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClassName = "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 transition hover:bg-white/8";
