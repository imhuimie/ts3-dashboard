"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Activity, BellRing, ChartNoAxesCombined, Clock3, Download, LogOut, Network, Power, RadioTower, RefreshCcw, Server, Shield, Square, Trash2, Users, Wifi } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ManagementSections, type ManagementIntent, type ManagementIntentPayload } from "@/components/management-sections";
import { api } from "@/lib/api";
import type { ClientSummary, DashboardData, LogEntry, MessageEntry, SessionState, TeamSpeakVersionsResponse, Ts3Event, ViewerData, ViewerNode } from "@/lib/types";

type LoadState = { loading: boolean; error: string | null };

const initialForm = { host: "127.0.0.1", queryPort: 10011, username: "serveradmin", password: "", nickname: "TS3 管理员", protocol: "raw" };
const liveRefreshEvents = ["clientconnect", "clientdisconnect", "clientmoved", "serveredit", "channeledit", "channelcreate", "channelmoved", "channeldelete", "tokenused", "textmessage"] as const;

export function DashboardShell() {
  const [form, setForm] = useState(initialForm);
  const [session, setSession] = useState<SessionState | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [viewer, setViewer] = useState<ViewerData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [state, setState] = useState<LoadState>({ loading: true, error: null });
  const [submitting, setSubmitting] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"offline" | "connecting" | "live" | "error">("offline");
  const [lastEvent, setLastEvent] = useState<string>("暂未收到实时事件。");
  const [eventFeed, setEventFeed] = useState<Ts3Event[]>([]);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [teamSpeakUpdate, setTeamSpeakUpdate] = useState<{ currentVersion: string; latestVersion: string; downloadUrl: string } | null>(null);
  const [serverActionBusy, setServerActionBusy] = useState<"start" | "stop" | "delete" | null>(null);
  const [managementIntent, setManagementIntent] = useState<ManagementIntent | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const messageContextRef = useRef({ serverId: 0, queryClientId: 0, queryChannelId: 0, nickname: "我" });

  useEffect(() => {
    void bootstrap();
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    messageContextRef.current = {
      serverId: session?.selectedServerId ?? 0,
      queryClientId: dashboard?.queryUser.clientId ?? session?.queryUser?.clientId ?? 0,
      queryChannelId: dashboard?.queryUser.channelId ?? session?.queryUser?.channelId ?? 0,
      nickname: dashboard?.queryUser.nickname ?? session?.queryUser?.nickname ?? "我",
    };
  }, [dashboard?.queryUser.channelId, dashboard?.queryUser.clientId, dashboard?.queryUser.nickname, session?.queryUser?.channelId, session?.queryUser?.clientId, session?.queryUser?.nickname, session?.selectedServerId]);

  useEffect(() => {
    if (!session) {
      setLiveStatus("offline");
      setLastEvent("暂未收到实时事件。");
      setEventFeed([]);
      return;
    }

    setLiveStatus("connecting");
    const eventSource = new EventSource(api.getEventsUrl(), { withCredentials: true });
    const queueRefresh = () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        void refreshData().catch((error) => {
          setState((current) => ({ ...current, error: error instanceof Error ? error.message : "实时刷新失败。" }));
        });
      }, 300);
    };

    const onReady = () => {
      setLiveStatus("live");
      setLastEvent("实时事件流已连接。");
    };
    const onPing = () => {
      setLiveStatus("live");
    };
    const onUpdate = (event: Event) => {
      setLiveStatus("live");
      const payload = parseLiveEvent(event);
      setLastEvent(formatLiveEvent(payload));
      setEventFeed((current) => [payload, ...current].slice(0, 20));
      if (payload.type === "textmessage") {
        setMessages((current) => {
          const entry = buildIncomingMessage(payload, messageContextRef.current);
          if (!entry) return current;
          return [entry, ...current].slice(0, 100);
        });
      }
      queueRefresh();
    };

    eventSource.addEventListener("ready", onReady);
    eventSource.addEventListener("ping", onPing);
    for (const eventName of liveRefreshEvents) {
      eventSource.addEventListener(eventName, onUpdate);
    }
    eventSource.onerror = () => {
      setLiveStatus("error");
    };

    return () => {
      eventSource.removeEventListener("ready", onReady);
      eventSource.removeEventListener("ping", onPing);
      for (const eventName of liveRefreshEvents) {
        eventSource.removeEventListener(eventName, onUpdate);
      }
      eventSource.close();
    };
  }, [session?.address, session?.selectedServerId]);

  useEffect(() => {
    if (!dashboard?.serverInfo.version) {
      setTeamSpeakUpdate(null);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const manifest = await api.getTeamSpeakVersions();
        const latestVersion = getLatestTeamSpeakVersion(manifest, dashboard.serverInfo.platform);
        if (!active || !latestVersion || compareVersions(dashboard.serverInfo.version, latestVersion) >= 0) {
          if (active) setTeamSpeakUpdate(null);
          return;
        }

        setTeamSpeakUpdate({
          currentVersion: dashboard.serverInfo.version,
          latestVersion,
          downloadUrl: `https://files.teamspeak-services.com/releases/server/${latestVersion}/index.html`,
        });
      } catch {
        if (active) setTeamSpeakUpdate(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [dashboard?.serverInfo.platform, dashboard?.serverInfo.version]);

  async function bootstrap() {
    setState({ loading: true, error: null });
    try {
      const currentSession = await api.getSession();
      if (!currentSession) {
        setSession(null);
        setDashboard(null);
        setViewer(null);
        setClients([]);
        setLogs([]);
        setMessages([]);
        setTeamSpeakUpdate(null);
        setState({ loading: false, error: null });
        return;
      }

      await syncSessionState(currentSession);
      setState({ loading: false, error: null });
    } catch {
      setSession(null);
      setDashboard(null);
      setViewer(null);
      setClients([]);
      setLogs([]);
      setMessages([]);
      setTeamSpeakUpdate(null);
      setState({ loading: false, error: null });
    }
  }

  async function refreshData() {
    const [dashboardPayload, viewerPayload, clientsPayload, logsPayload] = await Promise.all([api.getDashboard(), api.getViewer(), api.getClients(), api.getLogs(120)]);
    setDashboard(dashboardPayload);
    setViewer(viewerPayload);
    setClients(clientsPayload);
    setLogs(logsPayload);
  }

  async function syncSessionState(nextSession: SessionState) {
    setSession(nextSession);
    setEventFeed([]);
    const nextSelectedServer = nextSession.servers.find((server) => server.id === nextSession.selectedServerId);
    const serverStatus = nextSelectedServer?.status?.toLowerCase();
    if (nextSession.selectedServerId > 0 && serverStatus !== "offline" && serverStatus !== "stopped") {
      await refreshData();
      return;
    }
    setDashboard(null);
    setViewer(null);
    setClients([]);
    setLogs([]);
  }

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setState({ loading: false, error: null });
    try {
      const nextSession = await api.connect(form);
      await syncSessionState(nextSession);
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "连接失败。" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleServerChange(serverId: number) {
    try {
      setState((current) => ({ ...current, loading: true }));
      const nextSession = await api.selectServer(serverId);
      await syncSessionState(nextSession);
      setState({ loading: false, error: null });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "切换服务器失败。" });
    }
  }

  async function handleRefresh() {
    try {
      setState((current) => ({ ...current, loading: true }));
      const currentSession = await api.getSession();
      if (!currentSession) {
        setSession(null);
        setDashboard(null);
        setViewer(null);
        setClients([]);
        setLogs([]);
        setEventFeed([]);
        setMessages([]);
        setTeamSpeakUpdate(null);
        setServerActionBusy(null);
        setState({ loading: false, error: null });
        return;
      }

      await syncSessionState(currentSession);
      setState({ loading: false, error: null });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "刷新失败。" });
    }
  }

  async function handleDisconnect() {
    try {
      await api.disconnect();
    } finally {
      setSession(null);
      setDashboard(null);
      setViewer(null);
      setClients([]);
      setLogs([]);
      setEventFeed([]);
      setMessages([]);
      setTeamSpeakUpdate(null);
      setServerActionBusy(null);
      setState({ loading: false, error: null });
    }
  }

  async function handleServerAction(action: "start" | "stop" | "delete") {
    if (!session || session.selectedServerId <= 0) return;
    if (action === "delete" && !window.confirm("确认删除当前虚拟服务器？此操作不可撤销。")) return;

    setServerActionBusy(action);
    setState((current) => ({ ...current, error: null }));
    try {
      const nextSession = await api.serverAction(session.selectedServerId, { action, reason: action === "stop" ? "由 TS3 Dashboard 停止" : undefined });
      await syncSessionState(nextSession);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "服务器操作失败。" }));
    } finally {
      setServerActionBusy(null);
    }
  }

  function openManagementIntent(intent: ManagementIntentPayload) {
    setManagementIntent({ ...intent, key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } as ManagementIntent);
  }

  const onlineClients = useMemo(() => clients.filter((client) => !client.isQuery), [clients]);
  const currentServer = useMemo(() => session?.servers.find((server) => server.id === session.selectedServerId) ?? null, [session]);
  const currentServerMessages = useMemo(() => messages.filter((message) => message.serverId === session?.selectedServerId), [messages, session?.selectedServerId]);
  const unreadMessageCount = useMemo(() => currentServerMessages.filter((message) => message.unread).length, [currentServerMessages]);

  if (state.loading && !session && !dashboard) return <LoadingScreen label="正在检查会话..." />;

  if (!session) {
    return (
      <main className="grid-lines flex min-h-screen items-center justify-center px-6 py-12">
        <section className="panel w-full max-w-5xl rounded-[32px] border px-8 py-10 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-sky-100/80"><Shield className="h-4 w-4 text-cyan-300" />Go + Next.js 16 + Tailwind CSS</div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white lg:text-6xl">TeamSpeak 3 中文控制台</h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 lg:text-lg">一个面向 TeamSpeak 3 的中文控制台，集成实时事件、文件传输、头像加载，并由 Go 后端直接接入查询服务。</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <HeroBadge icon={Network} title="原生查询协议" description="不再依赖旧式中间层，由 Go 后端直接接入查询服务。" />
                <HeroBadge icon={ChartNoAxesCombined} title="运维总览" description="图表、日志、查看器、头像和实时刷新集中在一个界面。" />
                <HeroBadge icon={Server} title="管理工具" description="封禁、密钥、权限、文件和实时服务器事件全部集成。" />
              </div>
            </div>
            <form className="panel rounded-[28px] border border-white/10 p-6" onSubmit={handleConnect}>
              <div className="mb-6 flex items-center justify-between"><div><h2 className="text-2xl font-semibold text-white">连接查询服务</h2><p className="mt-1 text-sm text-slate-400">当前后端支持 10011 端口的原生查询协议。</p></div><Wifi className="h-8 w-8 text-cyan-300" /></div>
              <div className="grid gap-4">
                <Field label="主机"><input className={inputClassName} value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="查询端口"><input className={inputClassName} type="number" value={form.queryPort} onChange={(event) => setForm({ ...form, queryPort: Number(event.target.value) })} /></Field>
                  <Field label="协议"><select className={inputClassName} value={form.protocol} onChange={(event) => setForm({ ...form, protocol: event.target.value })}><option value="raw">原生协议</option></select></Field>
                </div>
                <Field label="用户名"><input className={inputClassName} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field>
                <Field label="密码"><input className={inputClassName} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field>
                <Field label="面板昵称"><input className={inputClassName} value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} /></Field>
              </div>
              {state.error ? <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{state.error}</p> : null}
              <button className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-900/40 disabled:text-slate-300" disabled={submitting} type="submit">{submitting ? "连接中..." : "连接"}</button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="grid-lines min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="panel rounded-[30px] border px-6 py-6 md:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-sky-100/80"><Activity className="h-4 w-4 text-cyan-300" />TS3 控制台 / {session.address}</div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{dashboard?.serverInfo.name ?? "虚拟服务器控制台"}</h1>
                <p className="mt-2 text-sm text-slate-400 md:text-base">查询用户：{dashboard?.queryUser.nickname ?? session.queryUser?.nickname ?? "未知"}。当前重构版面板已集成实时事件、文件、头像、封禁、密钥和权限管理。</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select className={`${inputClassName} min-w-64`} value={session.selectedServerId} onChange={(event) => handleServerChange(Number(event.target.value))}>{session.servers.map((server) => <option key={server.id} value={server.id}>{server.name} :{server.port}</option>)}</select>
              <button className={secondaryButtonClassName} onClick={handleRefresh} type="button"><RefreshCcw className="h-4 w-4" />刷新</button>
              <button className={secondaryButtonClassName} onClick={() => void handleServerAction(currentServer?.status?.toLowerCase() === "online" ? "stop" : "start")} type="button" disabled={!currentServer || serverActionBusy !== null}>{currentServer?.status?.toLowerCase() === "online" ? <Square className="h-4 w-4" /> : <Power className="h-4 w-4" />}{serverActionBusy === "stop" ? "停止中..." : serverActionBusy === "start" ? "启动中..." : currentServer?.status?.toLowerCase() === "online" ? "停止服务器" : "启动服务器"}</button>
              <button className={dangerButtonClassName} onClick={() => void handleServerAction("delete")} type="button" disabled={!currentServer || serverActionBusy !== null}><Trash2 className="h-4 w-4" />{serverActionBusy === "delete" ? "删除中..." : "删除服务器"}</button>
              <button className={dangerButtonClassName} onClick={handleDisconnect} type="button"><LogOut className="h-4 w-4" />断开连接</button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <LiveBadge status={liveStatus} />
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1"><Server className="h-4 w-4 text-cyan-300" />当前服务器状态：{currentServer?.status || "未知"}</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1"><RadioTower className="h-4 w-4 text-cyan-300" />{lastEvent}</span>
            {unreadMessageCount > 0 ? <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-rose-100"><BellRing className="h-4 w-4" />未读消息 {unreadMessageCount}</span> : null}
            {teamSpeakUpdate ? <a className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-100 transition hover:bg-amber-500/20" href={teamSpeakUpdate.downloadUrl} rel="noreferrer" target="_blank"><Download className="h-4 w-4" />TS3 新版本 {teamSpeakUpdate.latestVersion}</a> : null}
          </div>
          {state.error ? <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{state.error}</p> : null}
        </section>

        {dashboard ? <OverviewSection dashboard={dashboard} onlineClients={onlineClients} viewer={viewer} logs={logs} eventFeed={eventFeed} onManagementIntent={openManagementIntent} /> : <section className="panel rounded-[28px] border px-6 py-6 text-sm text-slate-400">当前未选中可操作的在线虚拟服务器，请先启动或切换服务器。</section>}
        <ManagementSections sessionKey={`${session.address}-${session.selectedServerId}`} selectedServerId={session.selectedServerId} messages={currentServerMessages} unreadMessageCount={unreadMessageCount} onMarkMessagesRead={() => setMessages((current) => current.map((message) => message.serverId === session.selectedServerId ? { ...message, unread: false } : message))} onMessageSent={({ targetMode, target, message }) => setMessages((current) => [buildOutgoingMessage({ targetMode, target, message }, messageContextRef.current), ...current].slice(0, 100))} intent={managementIntent} />
      </div>
    </main>
  );
}

function OverviewSection({ dashboard, onlineClients, viewer, logs, eventFeed, onManagementIntent }: { dashboard: DashboardData; onlineClients: ClientSummary[]; viewer: ViewerData | null; logs: LogEntry[]; eventFeed: Ts3Event[]; onManagementIntent: (intent: ManagementIntentPayload) => void; }) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="在线用户" value={String(dashboard.serverInfo.clientsOnline)} meta={`非查询客户端 ${onlineClients.length}`} />
        <MetricCard icon={Server} label="频道数" value={String(dashboard.serverInfo.channelsOnline)} meta={`虚拟服务器 ID ${dashboard.serverInfo.id}`} />
        <MetricCard icon={Shield} label="版本 / 平台" value={dashboard.serverInfo.version || "未知版本"} meta={dashboard.serverInfo.platform || "TS3 平台"} />
        <MetricCard icon={Wifi} label="运行时长" value={formatDuration(dashboard.serverInfo.uptimeSeconds)} meta={`查询连接数 ${dashboard.serverInfo.queryConnections}`} />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel title="连接趋势" subtitle="根据近期日志推断的连接变化趋势。"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dashboard.connectionsByDay}><defs><linearGradient id="traffic" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.65} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} /></linearGradient></defs><CartesianGrid stroke="rgba(141,160,189,0.12)" vertical={false} /><XAxis dataKey="label" stroke="#8da0bd" /><YAxis stroke="#8da0bd" allowDecimals={false} /><Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="value" stroke="#22d3ee" fill="url(#traffic)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></div></Panel>
        <Panel title="日志级别分布" subtitle="快速查看各日志级别的分布情况。"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.logLevels}><CartesianGrid stroke="rgba(141,160,189,0.12)" vertical={false} /><XAxis dataKey="label" stroke="#8da0bd" /><YAxis stroke="#8da0bd" allowDecimals={false} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#74c0fc" /></BarChart></ResponsiveContainer></div></Panel>
      </section>
      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="在线客户端" subtitle="若可用，将通过 TS3 文件传输通道加载头像。"><ClientGrid clients={onlineClients} /></Panel>
        <Panel title="服务器查看器" subtitle="将频道树与在线客户端合并展示，并提供常用快捷入口。"><div className="max-h-[28rem] overflow-auto pr-2">{viewer ? <Tree nodes={viewer.tree} onAction={onManagementIntent} /> : <EmptyState label="暂无频道树数据。" />}</div></Panel>
      </section>
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="实时事件流" subtitle="通过服务端事件流推送的近期服务器事件。"><EventFeed events={eventFeed} /></Panel>
        <Panel title="近期日志" subtitle="展示时间、级别、频道和消息。" action={<button className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10" type="button" onClick={() => onManagementIntent({ type: "open-logs" })}>完整日志</button>}><div className="max-h-[28rem] overflow-auto rounded-3xl border border-white/8"><table className="min-w-full border-collapse text-left text-sm"><thead className="sticky top-0 bg-slate-950/85 text-slate-300 backdrop-blur"><tr><th className="px-4 py-3 font-medium">时间</th><th className="px-4 py-3 font-medium">级别</th><th className="px-4 py-3 font-medium">频道</th><th className="px-4 py-3 font-medium">消息</th></tr></thead><tbody>{logs.map((log, index) => <tr key={`${log.timestamp}-${index}`} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3 text-slate-400">{formatTimestamp(log.timestamp)}</td><td className="px-4 py-3"><LevelChip level={log.level} /></td><td className="px-4 py-3 text-slate-400">{log.channel}</td><td className="px-4 py-3 text-slate-300">{log.message}</td></tr>)}</tbody></table>{!logs.length ? <EmptyState label="暂无日志。" /> : null}</div></Panel>
      </section>
    </>
  );
}

function EventFeed({ events }: { events: Ts3Event[] }) {
  if (!events.length) return <EmptyState label="暂未收到实时事件。" />;
  return <div className="max-h-[28rem] space-y-3 overflow-auto pr-1">{events.map((event, index) => <div key={`${event.timestamp}-${event.type}-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><div className="flex items-center justify-between gap-3"><div className="inline-flex items-center gap-2 text-sm font-medium text-white"><RadioTower className="h-4 w-4 text-cyan-300" />{event.type}</div><div className="inline-flex items-center gap-2 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />{formatTimestamp(event.timestamp)}</div></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(event.payload).slice(0, 6).map(([key, value]) => <div key={key} className="rounded-xl border border-white/8 bg-slate-950/60 px-3 py-2"><div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{key}</div><div className="mt-1 break-all text-xs text-slate-200">{value || "--"}</div></div>)}</div></div>)}</div>;
}

function ClientGrid({ clients }: { clients: ClientSummary[] }) {
  if (!clients.length) return <EmptyState label="当前没有在线客户端。" />;
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{clients.slice(0, 12).map((client) => <div key={client.id} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4"><div className="flex items-center gap-3"><ClientAvatar client={client} /><div className="min-w-0"><div className="truncate text-sm font-medium text-white">{client.nickname}</div><div className="truncate text-xs text-slate-400">{client.platform || "未知平台"}</div></div></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400"><span className="rounded-full border border-white/10 px-2 py-1">数据库 ID {client.databaseId}</span>{client.country ? <span className="rounded-full border border-white/10 px-2 py-1">{client.country}</span> : null}{client.channelCommander ? <span className="rounded-full border border-cyan-400/20 px-2 py-1 text-cyan-200">指挥</span> : null}{client.away ? <span className="rounded-full border border-amber-400/20 px-2 py-1 text-amber-200">离开</span> : null}</div></div>)}</div>;
}

function ClientAvatar({ client }: { client: ClientSummary }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [client.databaseId]);

  if (failed) return <AvatarFallback label={client.nickname} />;
  return <img className="h-11 w-11 rounded-2xl border border-white/10 bg-slate-900 object-cover" src={api.getAvatarUrl(client.databaseId)} alt={client.nickname} onError={() => setFailed(true)} />;
}

function AvatarFallback({ label }: { label: string }) {
  return <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-cyan-400/15 text-sm font-semibold text-cyan-200">{label.slice(0, 2).toUpperCase()}</div>;
}

function HeroBadge({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) { return <div className="rounded-[24px] border border-white/10 bg-white/5 p-4"><Icon className="mb-3 h-5 w-5 text-cyan-300" /><h3 className="text-sm font-medium text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{description}</p></div>; }
function MetricCard({ icon: Icon, label, value, meta }: { icon: typeof Activity; label: string; value: string; meta: string }) { return <div className="panel rounded-[26px] border px-5 py-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold text-white">{value}</p><p className="mt-2 text-sm text-slate-500">{meta}</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><Icon className="h-5 w-5 text-cyan-300" /></div></div></div>; }
function Panel({ title, subtitle, children, action }: { title: string; subtitle: string; children: ReactNode; action?: ReactNode }) { return <section className="panel rounded-[28px] border px-5 py-5 md:px-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-400">{subtitle}</p></div>{action}</div>{children}</section>; }
function Tree({ nodes, depth = 0, onAction }: { nodes: ViewerNode[]; depth?: number; onAction: (intent: ManagementIntentPayload) => void }) { return <ul className="space-y-2">{nodes.map((node) => { const parsedNode = parseViewerNode(node.id); return <li key={node.id} style={{ paddingLeft: depth ? `${depth * 14}px` : undefined }}><div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${node.kind === "channel" ? "bg-cyan-300" : node.kind === "query" ? "bg-amber-300" : "bg-emerald-300"}`} /><span className="truncate text-sm text-slate-100">{node.label}</span></div><div className="flex items-center gap-2">{node.meta ? <span className="text-xs text-slate-500">{node.meta}</span> : null}{parsedNode && node.kind === "channel" ? <><button className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 transition hover:bg-white/10" type="button" onClick={() => onAction({ type: "open-messages", targetMode: 2, target: parsedNode.id })}>频道消息</button><button className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 transition hover:bg-white/10" type="button" onClick={() => onAction({ type: "open-files", channelId: parsedNode.id })}>文件</button></> : null}{parsedNode && node.kind === "client" ? <button className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 transition hover:bg-white/10" type="button" onClick={() => onAction({ type: "open-messages", targetMode: 1, target: parsedNode.id })}>私聊</button> : null}</div></div></div>{node.children?.length ? <Tree nodes={node.children} depth={depth + 1} onAction={onAction} /> : null}</li>; })}</ul>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-sm text-slate-300">{label}</span>{children}</label>; }
function LevelChip({ level }: { level: string }) { const palette: Record<string, string> = { debug: "border-sky-400/30 bg-sky-400/10 text-sky-200", info: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200", warning: "border-amber-400/30 bg-amber-400/10 text-amber-200", error: "border-rose-400/30 bg-rose-500/10 text-rose-200" }; const labels: Record<string, string> = { debug: "调试", info: "信息", warning: "警告", error: "错误" }; const key = level.toLowerCase(); return <span className={`rounded-full border px-2.5 py-1 text-xs ${palette[key] ?? "border-white/10 bg-white/5 text-slate-200"}`}>{labels[key] ?? level}</span>; }
function EmptyState({ label }: { label: string }) { return <div className="p-6 text-center text-sm text-slate-500">{label}</div>; }
function LoadingScreen({ label }: { label: string }) { return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200"><div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5">{label}</div></main>; }
function LiveBadge({ status }: { status: "offline" | "connecting" | "live" | "error" }) { const palette: Record<typeof status, string> = { offline: "border-white/10 bg-white/[0.03] text-slate-300", connecting: "border-amber-400/20 bg-amber-500/10 text-amber-200", live: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200", error: "border-rose-400/20 bg-rose-500/10 text-rose-200" }; const label: Record<typeof status, string> = { offline: "实时离线", connecting: "实时连接中", live: "实时已连接", error: "实时错误" }; return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${palette[status]}`}><span className="h-2 w-2 rounded-full bg-current" />{label[status]}</span>; }
function formatTimestamp(value: string) { if (!value) return "--"; const date = new Date(value); if (Number.isNaN(date.getTime())) return value; return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date); }
function formatDuration(totalSeconds: number) { if (!totalSeconds) return "0 分钟"; const days = Math.floor(totalSeconds / 86400); const hours = Math.floor((totalSeconds % 86400) / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); if (days > 0) return `${days} 天 ${hours} 小时`; if (hours > 0) return `${hours} 小时 ${minutes} 分钟`; return `${minutes} 分钟`; }
function parseViewerNode(id: string) { const [kind, rawId] = id.split("-"); const numericId = Number(rawId); if ((kind !== "channel" && kind !== "client") || Number.isNaN(numericId) || numericId <= 0) return null; return { kind, id: numericId }; }
function parseLiveEvent(event: Event): Ts3Event { try { return JSON.parse((event as MessageEvent<string>).data) as Ts3Event; } catch { return { type: event.type, timestamp: new Date().toISOString(), payload: {} }; } }
function formatLiveEvent(event: Ts3Event) { const actor = event.payload.client_nickname || event.payload.invokername || event.payload.name || event.payload.notifyName || "TS3 事件"; return `${event.type} / ${actor}`; }
function buildIncomingMessage(event: Ts3Event, context: { serverId: number; queryClientId: number; queryChannelId: number }) {
  const senderId = toNumber(event.payload.invokerid);
  if (senderId > 0 && senderId === context.queryClientId) return null;

  const targetMode = toNumber(event.payload.targetmode);
  if (targetMode < 1 || targetMode > 3) return null;

  const target = targetMode === 1 ? senderId : targetMode === 2 ? context.queryChannelId : context.serverId;
  return {
    id: `${event.timestamp}-${senderId}-${Math.random().toString(36).slice(2, 8)}`,
    serverId: context.serverId,
    direction: "incoming" as const,
    targetMode,
    target,
    channelId: context.queryChannelId,
    senderId: senderId || null,
    senderName: event.payload.invokername || `客户端 #${senderId || "?"}`,
    message: event.payload.msg || "",
    timestamp: event.timestamp,
    unread: true,
  };
}

function buildOutgoingMessage(payload: { targetMode: number; target: number; message: string }, context: { serverId: number; queryClientId: number; queryChannelId: number; nickname: string }): MessageEntry {
  return {
    id: `${Date.now()}-${payload.target}-${Math.random().toString(36).slice(2, 8)}`,
    serverId: context.serverId,
    direction: "outgoing",
    targetMode: payload.targetMode,
    target: payload.target,
    channelId: context.queryChannelId,
    senderId: context.queryClientId || null,
    senderName: context.nickname,
    message: payload.message,
    timestamp: new Date().toISOString(),
    unread: false,
  };
}

function getLatestTeamSpeakVersion(manifest: TeamSpeakVersionsResponse, platform: string) {
  const platformKey = platform?.toLowerCase() || "linux";
  const platformVersions = manifest[platformKey] ?? manifest.linux;
  if (!platformVersions) return "";
  return platformVersions.x86_64?.version ?? platformVersions[Object.keys(platformVersions)[0] ?? ""]?.version ?? "";
}

function compareVersions(left: string, right: string) {
  const versionRegex = /(\d+\.)*\d+/;
  const leftParts = (left.match(versionRegex)?.[0] ?? "").split(".").filter(Boolean).map(Number);
  const rightParts = (right.match(versionRegex)?.[0] ?? "").split(".").filter(Boolean).map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
  }
  return 0;
}

function toNumber(value: string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const inputClassName = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-400/20";
const secondaryButtonClassName = "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 transition hover:bg-white/8";
const dangerButtonClassName = "inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 transition hover:bg-rose-500/20";
const tooltipStyle = { backgroundColor: "rgba(9, 20, 37, 0.95)", border: "1px solid rgba(141,160,189,0.18)", borderRadius: 18, color: "#edf4ff" };
