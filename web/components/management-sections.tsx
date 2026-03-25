"use client";

import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";

import { ApiKeysView } from "@/components/api-keys-view";
import { ConsoleView } from "@/components/console-view";
import { FileTransferPanel } from "@/components/file-transfer-panel";
import { api } from "@/lib/api";
import type { BanEntry, ChannelSummary, ClientDbEntry, ClientDetail, ClientSummary, ComplaintEntry, CreateServerResponse, FileEntry, LogEntry, MessageEntry, PermissionEntry, PermissionTarget, PermissionsMeta, PermissionScope, TokenEntry, UploadQueueItem, VirtualServerAdminInfo } from "@/lib/types";

const tabs = [
  { id: "server", label: "服务器工具" },
  { id: "channels", label: "频道管理" },
  { id: "clients", label: "客户端操作" },
  { id: "groups", label: "组管理" },
  { id: "messages", label: "消息发送" },
  { id: "logs", label: "服务器日志" },
  { id: "complaints", label: "投诉管理" },
  { id: "bans", label: "封禁管理" },
  { id: "tokens", label: "权限密钥" },
  { id: "api-keys", label: "API Keys" },
  { id: "console", label: "查询控制台" },
  { id: "permissions", label: "权限管理" },
  { id: "files", label: "文件传输" },
] as const;

type BanFormState = { ip: string; name: string; uid: string; reason: string; time: number };
type ChannelFormState = { name: string; parentId: number; topic: string; password: string; maxClients: number; type: "temporary" | "semi-permanent" | "permanent"; orderAfterId: number };
type SpacerFormState = { alignment: "" | "l" | "c" | "r"; text: string; special: string };
type ClientActionState = { client: ClientSummary; mode: "kick" | "move" | "ban" | "edit" | "poke" };

type ServerGroupEditor = { id: number; name: string; type: number; members: number[] } | null;
type ChannelGroupEditor = { id: number; name: string; type: number; channelId: number; members: number[] } | null;
type GroupCopyState = { sourceId: number; sourceName: string; name: string; type: number; overwrite: boolean; targetGroupId: number } | null;
export type ManagementIntentPayload =
  | { type: "open-messages"; targetMode: 1 | 2 | 3; target: number }
  | { type: "open-files"; channelId: number }
  | { type: "open-logs" };
export type ManagementIntent = ManagementIntentPayload & { key: string };

const initialChannelForm: ChannelFormState = { name: "", parentId: 0, topic: "", password: "", maxClients: 0, type: "temporary", orderAfterId: 0 };
const initialSpacerForm: SpacerFormState = { alignment: "c", text: "", special: "" };
const initialServerAdminForm: VirtualServerAdminInfo = { name: "", namePhonetic: "", password: "", maxClients: 32, reservedSlots: 0, welcomeMessage: "", hostMessage: "", hostMessageMode: 0, defaultServerGroup: 0, defaultChannelGroup: 0, defaultChannelAdminGroup: 0 };
const initialServerCreateForm = { name: "", port: 9988, maxClients: 32 };
const specialSpacerOptions = ["---", "...", "-.-", "___", "-.."];

export function ManagementSections({ sessionKey, selectedServerId, messages, unreadMessageCount, onMarkMessagesRead, onMessageSent, intent }: { sessionKey: string; selectedServerId: number; messages: MessageEntry[]; unreadMessageCount: number; onMarkMessagesRead: () => void; onMessageSent: (payload: { targetMode: number; target: number; message: string }) => void; intent: ManagementIntent | null; }) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("channels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<PermissionsMeta | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [tokens, setTokens] = useState<TokenEntry[]>([]);
  const [complaints, setComplaints] = useState<ComplaintEntry[]>([]);
  const [messageForm, setMessageForm] = useState({ targetMode: 3, target: selectedServerId, targets: [] as number[], message: "" });
  const [messageStatus, setMessageStatus] = useState<string | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [snapshotFileName, setSnapshotFileName] = useState("");
  const [snapshotContent, setSnapshotContent] = useState("");
  const [serverAdminForm, setServerAdminForm] = useState<VirtualServerAdminInfo>(initialServerAdminForm);
  const [serverCreateForm, setServerCreateForm] = useState(initialServerCreateForm);
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [createdServer, setCreatedServer] = useState<CreateServerResponse | null>(null);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [serverGroups, setServerGroups] = useState<PermissionTarget[]>([]);
  const [channelGroups, setChannelGroups] = useState<PermissionTarget[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState(0);
  const [currentPath, setCurrentPath] = useState("/");
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logLimit, setLogLimit] = useState(300);
  const [scope, setScope] = useState<PermissionScope>("server-group");
  const [targetId, setTargetId] = useState(0);
  const [channelClientChannelId, setChannelClientChannelId] = useState(0);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [permissionFilter, setPermissionFilter] = useState("");
  const [grantedOnly, setGrantedOnly] = useState(true);
  const [editing, setEditing] = useState<PermissionEntry | null>(null);
  const [editingBanId, setEditingBanId] = useState<number | null>(null);
  const [banForm, setBanForm] = useState<BanFormState>({ ip: "", name: "", uid: "", reason: "", time: 86400 });
  const [tokenForm, setTokenForm] = useState({ tokenType: 0, tokenId1: 0, tokenId2: 0, description: "" });
  const [createdToken, setCreatedToken] = useState("");
  const [editingChannelId, setEditingChannelId] = useState<number | null>(null);
  const [channelForm, setChannelForm] = useState<ChannelFormState>(initialChannelForm);
  const [spacerForm, setSpacerForm] = useState<SpacerFormState>(initialSpacerForm);

  useEffect(() => {
    void bootstrap();
  }, [sessionKey]);

  useEffect(() => {
    if (!meta) return;
    const options = getTargetOptions(scope, meta);
    setTargetId(options[0]?.id ?? 0);
    setChannelClientChannelId((current) => current && meta.channels.some((channel) => channel.id === current) ? current : meta.channels[0]?.id ?? 0);
    setTokenForm((current) => ({
      ...current,
      tokenType: scope === "channel-group" ? 1 : 0,
      tokenId1: scope === "channel-group" ? meta.channelGroups.filter((group) => group.type === 1)[0]?.id ?? 0 : meta.serverGroups.filter((group) => group.type === 1)[0]?.id ?? 0,
      tokenId2: scope === "channel-group" ? meta.channels[0]?.id ?? 0 : 0,
    }));
  }, [meta, scope]);

  useEffect(() => {
    if (targetId <= 0) return;
    if (scope === "channel-client" && channelClientChannelId <= 0) return;
    void loadPermissions(scope, targetId, scope === "channel-client" ? channelClientChannelId : undefined);
  }, [channelClientChannelId, scope, targetId]);

  useEffect(() => {
    if (activeTab === "messages" && unreadMessageCount > 0) onMarkMessagesRead();
  }, [activeTab, onMarkMessagesRead, unreadMessageCount]);

  useEffect(() => {
    if (activeTab !== "logs") return;
    void refreshLogs(logLimit);
  }, [activeTab, logLimit, sessionKey]);

  useEffect(() => {
    if (!channels.length) return;
    setSelectedChannelId((current) => current && channels.some((channel) => channel.id === current) ? current : channels[0].id);
  }, [channels]);

  useEffect(() => {
    if (selectedChannelId > 0) void loadFiles(selectedChannelId, currentPath);
  }, [selectedChannelId, currentPath]);

  useEffect(() => {
    if (!intent) return;

    if (intent.type === "open-logs") {
      setActiveTab("logs");
      return;
    }

    if (intent.type === "open-files") {
      setActiveTab("files");
      setSelectedChannelId(intent.channelId);
      setCurrentPath("/");
      return;
    }

    setActiveTab("messages");
    setMessageForm((current) => ({
      ...current,
      targetMode: intent.targetMode,
      target: intent.target,
      targets: intent.targetMode === 1 ? [intent.target] : [],
    }));
  }, [intent]);

  async function bootstrap() {
    setLoading(true);
    setError(null);
    try {
      const sessionPayload = await api.getSession();
      if (!sessionPayload) {
        setError("会话已失效，请重新连接。");
        return;
      }

      const metaPayload = await api.getPermissionsMeta();
      const clientsPayload = await api.getClients();
      const bansPayload = await api.getBans();
      const tokensPayload = await api.getTokens();
      const complaintsPayload = await api.getComplaints();
      const channelPayload = await api.getChannels();
      const serverGroupPayload = await api.getServerGroups();
      const channelGroupPayload = await api.getChannelGroups();
      const serverAdminPayload = await api.getServerAdmin();

      setMeta(metaPayload);
      setClients(clientsPayload);
      setBans(bansPayload);
      setTokens(tokensPayload);
      setComplaints(complaintsPayload);
      setChannels(channelPayload);
      setServerGroups(serverGroupPayload);
      setChannelGroups(channelGroupPayload);
      setServerAdminForm({ ...serverAdminPayload, password: "" });
      setServerCreateForm((current) => ({ ...current, port: Math.max(...sessionPayload.servers.map((server) => server.port), 9987) + 1 }));
      setCreatedServer(null);
      setServerStatus(null);
      setMessageStatus(null);
      setMessageForm({ targetMode: 3, target: selectedServerId, targets: [], message: "" });
      setCurrentPath("/");
      setFiles([]);
      setLogs([]);
      setUploadQueue([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败。");
    } finally {
      setLoading(false);
    }
  }

  async function refreshMeta() { const payload = await api.getPermissionsMeta(); setMeta(payload); return payload; }
  async function refreshChannels() { const payload = await api.getChannels(); setChannels(payload); return payload; }
  async function refreshClients() { const payload = await api.getClients(); setClients(payload); return payload; }
  async function refreshServerGroups() { const payload = await api.getServerGroups(); setServerGroups(payload); return payload; }
  async function refreshChannelGroups() { const payload = await api.getChannelGroups(); setChannelGroups(payload); return payload; }
  async function refreshComplaints() { const payload = await api.getComplaints(); setComplaints(payload); return payload; }
  async function refreshLogs(limit = logLimit) {
    try {
      setLogsLoading(true);
      setLogs(await api.getLogs(limit));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败。");
    } finally {
      setLogsLoading(false);
    }
  }

  async function loadPermissions(nextScope: PermissionScope, nextTargetId: number, nextChannelId?: number) {
    try { setPermissions(await api.getPermissions(nextScope, nextTargetId, nextChannelId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "加载失败。"); }
  }

  async function loadFiles(channelId: number, folderPath: string) {
    try { setFiles(await api.getFiles(channelId, folderPath)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "加载失败。"); }
  }

  function resetChannelEditor() {
    setEditingChannelId(null);
    setChannelForm(initialChannelForm);
    setSpacerForm(initialSpacerForm);
  }

  function startChannelEdit(channel: ChannelSummary) {
    setEditingChannelId(channel.id);
    setChannelForm({
      name: channel.name,
      parentId: channel.parentId,
      topic: channel.topic || "",
      password: "",
      maxClients: channel.maxClients,
      type: channel.isPermanent ? "permanent" : channel.isSemiPermanent ? "semi-permanent" : "temporary",
      orderAfterId: channel.order,
    });
  }

  async function handleChannelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingChannelId === null) await api.createChannel(channelForm);
      else await api.updateChannel(editingChannelId, channelForm);
      resetChannelEditor();
      await Promise.all([refreshChannels(), refreshMeta()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败。");
    }
  }

  async function handleChannelDelete(channelId: number) {
    try {
      await api.deleteChannel(channelId, true);
      if (editingChannelId === channelId) resetChannelEditor();
      await Promise.all([refreshChannels(), refreshMeta()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败。");
    }
  }

  function applySpacerName() {
    const suffix = spacerForm.special || spacerForm.text || "---";
    const randomId = Math.floor(Math.random() * 100);
    setChannelForm((current) => ({ ...current, name: `[${spacerForm.alignment}spacer${randomId}]${suffix}` }));
  }

  function startBanEdit(ban: BanEntry) {
    setActiveTab("bans");
    setEditingBanId(ban.banid);
    setBanForm({ ip: ban.ip || "", name: ban.name || "", uid: ban.uid || "", reason: ban.reason || "", time: ban.duration || 0 });
  }

  function resetBanEditor() { setEditingBanId(null); setBanForm({ ip: "", name: "", uid: "", reason: "", time: 86400 }); }

  async function handleBanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingBanId === null) await api.createBan(banForm);
      else await api.updateBan(editingBanId, banForm);
      resetBanEditor();
      setBans(await api.getBans());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败。");
    }
  }

  async function handleTokenSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const response = await api.createToken(tokenForm);
      setCreatedToken(response.token);
      setTokens(await api.getTokens());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败。");
    }
  }

  async function handlePermissionSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    try {
      await api.savePermission({ scope, targetId, channelId: scope === "channel-client" ? channelClientChannelId : undefined, permid: editing.permid, permvalue: editing.permvalue, permskip: scope === "channel-client" ? undefined : editing.permskip, permnegated: scope === "channel-client" ? undefined : editing.permnegated });
      setEditing(null);
      await loadPermissions(scope, targetId, scope === "channel-client" ? channelClientChannelId : undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败。");
    }
  }

  function updateUploadItem(id: string, patch: Partial<UploadQueueItem>) { setUploadQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }

  async function runUpload(item: UploadQueueItem) {
    updateUploadItem(item.id, { status: "uploading", progress: 0, error: null });
    try {
      await api.uploadFile(selectedChannelId, currentPath, item.file, true, (progress) => updateUploadItem(item.id, { progress, status: "uploading" }));
      updateUploadItem(item.id, { status: "success", progress: 100, error: null });
      await loadFiles(selectedChannelId, currentPath);
    } catch (cause) {
      updateUploadItem(item.id, { status: "error", error: cause instanceof Error ? cause.message : "上传失败。" });
      setError(cause instanceof Error ? cause.message : "保存失败。");
    }
  }

  async function enqueueUploads(fileList: FileList | null) {
    if (!fileList?.length) return;
    const nextItems = Array.from(fileList).map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`, fileName: file.name, size: file.size, status: "queued", progress: 0, error: null, file } satisfies UploadQueueItem));
    setUploadQueue((current) => [...nextItems, ...current].slice(0, 20));
    for (const item of nextItems) await runUpload(item);
  }

  async function handleSnapshotCreate() {
    setSnapshotStatus(null);
    try {
      const response = await api.createServerSnapshot();
      const name = `${new Date().toISOString().replace(/[:]/g, "-")}.backup`;
      const url = URL.createObjectURL(new Blob([response.snapshot], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
      setSnapshotStatus(`已创建快照：${name}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "处理失败。");
    }
  }

  async function handleSnapshotFileChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    try {
      setSnapshotFileName(file.name);
      setSnapshotContent(await file.text());
      setSnapshotStatus(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败。");
    }
  }

  async function handleSnapshotDeploy() {
    if (!snapshotContent) return;
    setSnapshotStatus(null);
    try {
      await api.deployServerSnapshot({ snapshot: snapshotContent });
      setSnapshotStatus("快照已部署。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "处理失败。");
    }
  }
  async function handleServerAdminSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerStatus(null);
    try {
      await api.updateServerAdmin(serverAdminForm);
      const refreshed = await api.getServerAdmin();
      setServerAdminForm({ ...refreshed, password: "" });
      setServerStatus("当前虚拟服务器设置已保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "处理失败。");
    }
  }

  async function handleServerCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerStatus(null);
    try {
      const response = await api.createServer(serverCreateForm);
      const session = await api.getSession();
      if (!session) {
        setError("会话已失效，请重新连接。");
        return;
      }

      setCreatedServer(response);
      setServerCreateForm((current) => ({ ...current, name: "", port: Math.max(...session.servers.map((server) => server.port), current.port) + 1 }));
      setServerStatus(`已创建虚拟服务器 #${response.serverId}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "处理失败。");
    }
  }

  async function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessageStatus(null);
    try {
      const targets = messageForm.targetMode === 1 ? messageForm.targets : [messageForm.target];
      for (const target of targets) {
        await api.sendTextMessage({ targetMode: messageForm.targetMode, target, message: messageForm.message });
      }
      for (const target of targets) onMessageSent({ targetMode: messageForm.targetMode, target, message: messageForm.message });
      setMessageStatus(targets.length > 1 ? `消息已发送给 ${targets.length} 个客户端。` : "消息已发送。");
      setMessageForm((current) => ({ ...current, message: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败。");
    }
  }

  const permissionRows = useMemo(() => {
    if (!meta) return [];
    const grantedMap = new Map(permissions.map((permission) => [permission.permid, permission]));
    return meta.catalog.map((catalogItem) => ({ ...catalogItem, ...(grantedMap.get(catalogItem.permid) ?? {}) })).filter((permission) => {
      if (grantedOnly && permission.permvalue === null) return false;
      const keyword = permissionFilter.trim().toLowerCase();
      if (!keyword) return true;
      return permission.permname.toLowerCase().includes(keyword) || permission.permdesc.toLowerCase().includes(keyword);
    });
  }, [grantedOnly, meta, permissionFilter, permissions]);

  const uploading = uploadQueue.some((item) => item.status === "uploading");
  if (loading) return <section className="panel rounded-[28px] border px-6 py-6 text-sm text-slate-400">正在加载管理模块...</section>;

  return (
    <section className="panel rounded-[28px] border px-5 py-5 md:px-6">
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm transition ${activeTab === tab.id ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-white/5 text-slate-200"}`}>{tab.label}{tab.id === "messages" && unreadMessageCount > 0 ? <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${activeTab === tab.id ? "bg-slate-950 text-cyan-200" : "bg-rose-500/20 text-rose-100"}`}>{unreadMessageCount}</span> : null}</button>)}
      </div>
      {error ? <p className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      {activeTab === "server" ? <ServerToolsView serverAdminForm={serverAdminForm} setServerAdminForm={setServerAdminForm} serverCreateForm={serverCreateForm} setServerCreateForm={setServerCreateForm} serverGroups={serverGroups} channelGroups={channelGroups} createdServer={createdServer} serverStatus={serverStatus} snapshotFileName={snapshotFileName} snapshotStatus={snapshotStatus} onCreateServer={handleServerCreateSubmit} onSaveServer={handleServerAdminSubmit} onCreateSnapshot={() => void handleSnapshotCreate()} onDeploySnapshot={() => void handleSnapshotDeploy()} onSnapshotFileChange={(files) => void handleSnapshotFileChange(files)} /> : null}
      {activeTab === "channels" ? <ChannelsView channels={channels} form={channelForm} spacerForm={spacerForm} editingChannelId={editingChannelId} setForm={setChannelForm} setSpacerForm={setSpacerForm} onApplySpacer={applySpacerName} onCancelEdit={resetChannelEditor} onDelete={handleChannelDelete} onEdit={startChannelEdit} onSubmit={handleChannelSubmit} /> : null}
      {activeTab === "clients" ? <ClientsView clients={clients} dbClients={meta?.clients ?? []} channels={channels} serverGroups={serverGroups} defaultServerGroupId={serverAdminForm.defaultServerGroup} onRefresh={() => void Promise.all([refreshClients(), refreshMeta()])} onLoadDetail={api.getClientDetail} onSaveEdit={async (clientId, payload) => { await api.updateClient(clientId, payload); await Promise.all([refreshClients(), refreshMeta()]); }} onKick={async (clientId, payload) => { await api.kickClient(clientId, payload); await refreshClients(); }} onMove={async (clientId, payload) => { await api.moveClient(clientId, payload); await refreshClients(); }} onBan={async (clientId, payload) => { await api.banClient(clientId, payload); setBans(await api.getBans()); await refreshClients(); }} onPoke={async (clientId, payload) => { await api.pokeClient(clientId, payload); }} onDeleteDatabaseClients={async (clientDbIds) => { for (const clientDbId of clientDbIds) await api.deleteClientDatabase(clientDbId); await Promise.all([refreshClients(), refreshMeta()]); }} /> : null}
      {activeTab === "groups" ? <GroupsView serverGroups={serverGroups} channelGroups={channelGroups} channels={channels} clients={meta?.clients ?? []} onRefreshServerGroups={() => void Promise.all([refreshServerGroups(), refreshMeta()])} onRefreshChannelGroups={() => void Promise.all([refreshChannelGroups(), refreshMeta()])} /> : null}
      {activeTab === "messages" ? <MessagesView selectedServerId={selectedServerId} channels={channels} clients={clients} form={messageForm} status={messageStatus} messages={messages} setForm={setMessageForm} onSubmit={handleMessageSubmit} /> : null}
      {activeTab === "logs" ? <LogsView logs={logs} limit={logLimit} setLimit={setLogLimit} loading={logsLoading} onRefresh={() => refreshLogs()} /> : null}
      {activeTab === "complaints" ? <ComplaintsView complaints={complaints} onDelete={async (payload) => { await api.deleteComplaint(payload); await refreshComplaints(); }} /> : null}
      {activeTab === "bans" ? <BansView bans={bans} banForm={banForm} editingBanId={editingBanId} setBanForm={setBanForm} onCancelEdit={resetBanEditor} onDelete={async (banId) => { await api.deleteBan(banId); if (editingBanId === banId) resetBanEditor(); setBans(await api.getBans()); }} onEdit={startBanEdit} onSubmit={handleBanSubmit} /> : null}
      {activeTab === "tokens" && meta ? <TokensView meta={meta} tokenForm={tokenForm} setTokenForm={setTokenForm} createdToken={createdToken} tokens={tokens} onDelete={async (token) => { await api.deleteToken(token); setTokens(await api.getTokens()); }} onSubmit={handleTokenSubmit} /> : null}
      {activeTab === "api-keys" && meta ? <ApiKeysView sessionKey={sessionKey} dbClients={meta.clients} /> : null}
      {activeTab === "console" ? <ConsoleView /> : null}
      {activeTab === "permissions" && meta ? <PermissionsView meta={meta} scope={scope} setScope={setScope} targetId={targetId} setTargetId={setTargetId} channelClientChannelId={channelClientChannelId} setChannelClientChannelId={setChannelClientChannelId} rows={permissionRows} filter={permissionFilter} setFilter={setPermissionFilter} grantedOnly={grantedOnly} setGrantedOnly={setGrantedOnly} editing={editing} setEditing={setEditing} onDelete={async (permid) => { await api.deletePermission(scope, targetId, permid, scope === "channel-client" ? channelClientChannelId : undefined); await loadPermissions(scope, targetId, scope === "channel-client" ? channelClientChannelId : undefined); }} onSubmit={handlePermissionSave} /> : null}
      {activeTab === "files" ? <FilesView channels={channels} files={files} currentPath={currentPath} selectedChannelId={selectedChannelId} uploading={uploading} uploadQueue={uploadQueue} onRefresh={() => void loadFiles(selectedChannelId, currentPath)} onSelectChannel={(channelId) => { setSelectedChannelId(channelId); setCurrentPath("/"); }} onNavigate={(folderPath) => setCurrentPath(folderPath)} onUpload={enqueueUploads} onRetry={async (item) => { await runUpload(item); }} onRemove={(id) => setUploadQueue((current) => current.filter((item) => item.id !== id))} /> : null}
    </section>
  );
}
function ServerToolsView({ serverAdminForm, setServerAdminForm, serverCreateForm, setServerCreateForm, serverGroups, channelGroups, createdServer, serverStatus, snapshotFileName, snapshotStatus, onCreateServer, onSaveServer, onCreateSnapshot, onDeploySnapshot, onSnapshotFileChange }: { serverAdminForm: VirtualServerAdminInfo; setServerAdminForm: Dispatch<SetStateAction<VirtualServerAdminInfo>>; serverCreateForm: { name: string; port: number; maxClients: number }; setServerCreateForm: Dispatch<SetStateAction<{ name: string; port: number; maxClients: number }>>; serverGroups: PermissionTarget[]; channelGroups: PermissionTarget[]; createdServer: CreateServerResponse | null; serverStatus: string | null; snapshotFileName: string; snapshotStatus: string | null; onCreateServer: (event: FormEvent<HTMLFormElement>) => Promise<void>; onSaveServer: (event: FormEvent<HTMLFormElement>) => Promise<void>; onCreateSnapshot: () => void; onDeploySnapshot: () => void; onSnapshotFileChange: (files: FileList | null) => void; }) {
  const regularServerGroups = serverGroups.filter((group) => group.type === 1);
  const regularChannelGroups = channelGroups.filter((group) => group.type === 1);

  function setTextField<K extends keyof VirtualServerAdminInfo>(key: K, value: string) {
    setServerAdminForm((current) => ({ ...current, [key]: value }));
  }

  function setNumberField<K extends keyof VirtualServerAdminInfo>(key: K, value: number) {
    setServerAdminForm((current) => ({ ...current, [key]: Number.isNaN(value) ? 0 : value }));
  }

  function setBooleanNumberField<K extends keyof VirtualServerAdminInfo>(key: K, checked: boolean) {
    setServerAdminForm((current) => ({ ...current, [key]: checked ? 1 : 0 }));
  }

  return <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
    <form className="space-y-4 rounded-3xl border border-white/8 bg-white/[0.03] p-4" onSubmit={onSaveServer}>
      <div>
        <div className="text-lg font-semibold text-white">当前虚拟服务器</div>
        <p className="mt-1 text-sm text-slate-400">补齐旧版高级字段，统一在这里维护主机展示、传输限制、安全策略、默认组和日志开关。</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input label="服务器名称"><input className={inputClassName} value={serverAdminForm.name} onChange={(event) => setTextField("name", event.target.value)} /></Input>
        <Input label="语音名称"><input className={inputClassName} value={serverAdminForm.namePhonetic} onChange={(event) => setTextField("namePhonetic", event.target.value)} /></Input>
        <Input label="密码"><input className={inputClassName} type="password" value={serverAdminForm.password} onChange={(event) => setTextField("password", event.target.value)} placeholder="留空则保持当前密码不变" /></Input>
        <Input label="主机消息模式"><select className={inputClassName} value={serverAdminForm.hostMessageMode} onChange={(event) => setNumberField("hostMessageMode", Number(event.target.value))}><option value={0}>禁用</option><option value={1}>日志</option><option value={2}>弹窗</option><option value={3}>弹窗并断开</option></select></Input>
        <Input label="最大客户端数"><input className={inputClassName} type="number" min={1} value={serverAdminForm.maxClients} onChange={(event) => setNumberField("maxClients", Number(event.target.value))} /></Input>
        <Input label="保留槽位"><input className={inputClassName} type="number" min={0} value={serverAdminForm.reservedSlots} onChange={(event) => setNumberField("reservedSlots", Number(event.target.value))} /></Input>
        <Input label="默认服务器组"><select className={inputClassName} value={serverAdminForm.defaultServerGroup} onChange={(event) => setNumberField("defaultServerGroup", Number(event.target.value))}>{regularServerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Input>
        <Input label="默认频道组"><select className={inputClassName} value={serverAdminForm.defaultChannelGroup} onChange={(event) => setNumberField("defaultChannelGroup", Number(event.target.value))}>{regularChannelGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Input>
        <Input label="默认频道管理员组"><select className={inputClassName} value={serverAdminForm.defaultChannelAdminGroup} onChange={(event) => setNumberField("defaultChannelAdminGroup", Number(event.target.value))}>{regularChannelGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Input>
      </div>

      <Input label="欢迎消息"><textarea className={`${inputClassName} min-h-28`} value={serverAdminForm.welcomeMessage} onChange={(event) => setTextField("welcomeMessage", event.target.value)} /></Input>
      <Input label="主机消息"><textarea className={`${inputClassName} min-h-24`} value={serverAdminForm.hostMessage} onChange={(event) => setTextField("hostMessage", event.target.value)} /></Input>

      <section className="space-y-3 rounded-3xl border border-white/8 bg-slate-950/40 p-4">
        <div>
          <h3 className="text-base font-semibold text-white">主机展示</h3>
          <p className="mt-1 text-sm text-slate-500">配置横幅、按钮和对外展示信息。</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="横幅图片地址"><input className={inputClassName} value={serverAdminForm.hostBannerGfxUrl ?? ""} onChange={(event) => setTextField("hostBannerGfxUrl", event.target.value)} /></Input>
          <Input label="横幅跳转地址"><input className={inputClassName} value={serverAdminForm.hostBannerUrl ?? ""} onChange={(event) => setTextField("hostBannerUrl", event.target.value)} /></Input>
          <Input label="横幅轮播间隔"><input className={inputClassName} type="number" min={0} value={serverAdminForm.hostBannerGfxInterval ?? 0} onChange={(event) => setNumberField("hostBannerGfxInterval", Number(event.target.value))} /></Input>
          <Input label="横幅缩放模式"><select className={inputClassName} value={serverAdminForm.hostBannerMode ?? 0} onChange={(event) => setNumberField("hostBannerMode", Number(event.target.value))}><option value={0}>不调整</option><option value={1}>拉伸</option><option value={2}>等比包含</option><option value={3}>等比裁剪</option></select></Input>
          <Input label="主机按钮提示"><input className={inputClassName} value={serverAdminForm.hostButtonTooltip ?? ""} onChange={(event) => setTextField("hostButtonTooltip", event.target.value)} /></Input>
          <Input label="主机按钮跳转地址"><input className={inputClassName} value={serverAdminForm.hostButtonUrl ?? ""} onChange={(event) => setTextField("hostButtonUrl", event.target.value)} /></Input>
        </div>
        <Input label="主机按钮图标地址"><input className={inputClassName} value={serverAdminForm.hostButtonGfxUrl ?? ""} onChange={(event) => setTextField("hostButtonGfxUrl", event.target.value)} /></Input>
      </section>

      <section className="space-y-3 rounded-3xl border border-white/8 bg-slate-950/40 p-4">
        <div>
          <h3 className="text-base font-semibold text-white">传输限制</h3>
          <p className="mt-1 text-sm text-slate-500">上传和下载带宽限制按 Byte/s，配额按 MiB。</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="最大上传带宽"><input className={inputClassName} type="number" min={0} value={serverAdminForm.maxUploadTotalBandwidth ?? 0} onChange={(event) => setNumberField("maxUploadTotalBandwidth", Number(event.target.value))} /></Input>
          <Input label="上传配额"><input className={inputClassName} type="number" min={0} value={serverAdminForm.uploadQuota ?? 0} onChange={(event) => setNumberField("uploadQuota", Number(event.target.value))} /></Input>
          <Input label="最大下载带宽"><input className={inputClassName} type="number" min={0} value={serverAdminForm.maxDownloadTotalBandwidth ?? 0} onChange={(event) => setNumberField("maxDownloadTotalBandwidth", Number(event.target.value))} /></Input>
          <Input label="下载配额"><input className={inputClassName} type="number" min={0} value={serverAdminForm.downloadQuota ?? 0} onChange={(event) => setNumberField("downloadQuota", Number(event.target.value))} /></Input>
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-white/8 bg-slate-950/40 p-4">
        <div>
          <h3 className="text-base font-semibold text-white">防刷屏与安全</h3>
          <p className="mt-1 text-sm text-slate-500">控制客户端刷屏阈值、所需安全等级和语音加密模式。</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="每 tick 减少积分"><input className={inputClassName} type="number" min={0} value={serverAdminForm.antifloodPointsTickReduce ?? 0} onChange={(event) => setNumberField("antifloodPointsTickReduce", Number(event.target.value))} /></Input>
          <Input label="命令封禁阈值"><input className={inputClassName} type="number" min={0} value={serverAdminForm.antifloodPointsNeededCommandBlock ?? 0} onChange={(event) => setNumberField("antifloodPointsNeededCommandBlock", Number(event.target.value))} /></Input>
          <Input label="IP 封禁阈值"><input className={inputClassName} type="number" min={0} value={serverAdminForm.antifloodPointsNeededIpBlock ?? 0} onChange={(event) => setNumberField("antifloodPointsNeededIpBlock", Number(event.target.value))} /></Input>
          <Input label="所需安全等级"><input className={inputClassName} type="number" min={0} value={serverAdminForm.neededIdentitySecurityLevel ?? 0} onChange={(event) => setNumberField("neededIdentitySecurityLevel", Number(event.target.value))} /></Input>
          <Input label="语音加密模式"><select className={inputClassName} value={serverAdminForm.codecEncryptionMode ?? 0} onChange={(event) => setNumberField("codecEncryptionMode", Number(event.target.value))}><option value={0}>每频道可配置</option><option value={1}>强制禁用</option><option value={2}>强制启用</option></select></Input>
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-white/8 bg-slate-950/40 p-4">
        <div>
          <h3 className="text-base font-semibold text-white">其他高级设置</h3>
          <p className="mt-1 text-sm text-slate-500">投诉自动封禁、优先发言衰减、临时频道删除延迟和服务器列表上报。</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="投诉自动封禁次数"><input className={inputClassName} type="number" min={0} value={serverAdminForm.complainAutobanCount ?? 0} onChange={(event) => setNumberField("complainAutobanCount", Number(event.target.value))} /></Input>
          <Input label="投诉自动封禁时长（秒）"><input className={inputClassName} type="number" min={0} value={serverAdminForm.complainAutobanTime ?? 0} onChange={(event) => setNumberField("complainAutobanTime", Number(event.target.value))} /></Input>
          <Input label="投诉保留时长（秒）"><input className={inputClassName} type="number" min={0} value={serverAdminForm.complainRemoveTime ?? 0} onChange={(event) => setNumberField("complainRemoveTime", Number(event.target.value))} /></Input>
          <Input label="强制静音前频道最小人数"><input className={inputClassName} type="number" min={0} value={serverAdminForm.minClientsInChannelBeforeForcedSilence ?? 0} onChange={(event) => setNumberField("minClientsInChannelBeforeForcedSilence", Number(event.target.value))} /></Input>
          <Input label="优先发言衰减系数"><input className={inputClassName} type="number" min={0} value={serverAdminForm.prioritySpeakerDimmModificator ?? 0} onChange={(event) => setNumberField("prioritySpeakerDimmModificator", Number(event.target.value))} /></Input>
          <Input label="临时频道删除延迟（秒）"><input className={inputClassName} type="number" min={0} value={serverAdminForm.channelTempDeleteDelayDefault ?? 0} onChange={(event) => setNumberField("channelTempDeleteDelayDefault", Number(event.target.value))} /></Input>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input checked={(serverAdminForm.weblistEnabled ?? 0) === 1} onChange={(event) => setBooleanNumberField("weblistEnabled", event.target.checked)} type="checkbox" />启用服务器列表上报</label>
      </section>

      <section className="space-y-3 rounded-3xl border border-white/8 bg-slate-950/40 p-4">
        <div>
          <h3 className="text-base font-semibold text-white">日志开关</h3>
          <p className="mt-1 text-sm text-slate-500">按模块控制虚拟服务器日志写入。</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input checked={(serverAdminForm.logClient ?? 0) === 1} onChange={(event) => setBooleanNumberField("logClient", event.target.checked)} type="checkbox" />客户端日志</label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input checked={(serverAdminForm.logChannel ?? 0) === 1} onChange={(event) => setBooleanNumberField("logChannel", event.target.checked)} type="checkbox" />频道日志</label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input checked={(serverAdminForm.logServer ?? 0) === 1} onChange={(event) => setBooleanNumberField("logServer", event.target.checked)} type="checkbox" />服务器日志</label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input checked={(serverAdminForm.logQuery ?? 0) === 1} onChange={(event) => setBooleanNumberField("logQuery", event.target.checked)} type="checkbox" />查询服务日志</label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input checked={(serverAdminForm.logPermissions ?? 0) === 1} onChange={(event) => setBooleanNumberField("logPermissions", event.target.checked)} type="checkbox" />权限日志</label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input checked={(serverAdminForm.logFileTransfer ?? 0) === 1} onChange={(event) => setBooleanNumberField("logFileTransfer", event.target.checked)} type="checkbox" />文件传输日志</label>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">密码字段只写不回显。高级字段未设置时按 0 或空字符串提交。</p>
        <button className={primaryButtonClassName} type="submit" disabled={!serverAdminForm.name.trim() || serverAdminForm.maxClients <= 0}>保存当前服务器</button>
      </div>
      {serverStatus ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{serverStatus}</div> : null}
    </form>

    <div className="space-y-4">
      <form className="space-y-4 rounded-3xl border border-white/8 bg-white/[0.03] p-4" onSubmit={onCreateServer}>
        <div>
          <div className="text-lg font-semibold text-white">创建虚拟服务器</div>
          <p className="mt-1 text-sm text-slate-400">创建新虚拟服务器，并返回生成的管理员权限密钥。</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="名称"><input className={inputClassName} value={serverCreateForm.name} onChange={(event) => setServerCreateForm((current) => ({ ...current, name: event.target.value }))} /></Input>
          <Input label="端口"><input className={inputClassName} type="number" min={1} value={serverCreateForm.port} onChange={(event) => setServerCreateForm((current) => ({ ...current, port: Number(event.target.value) }))} /></Input>
          <Input label="最大客户端数"><input className={inputClassName} type="number" min={1} value={serverCreateForm.maxClients} onChange={(event) => setServerCreateForm((current) => ({ ...current, maxClients: Number(event.target.value) }))} /></Input>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">建议端口基于当前会话中的服务器列表自动递增。</p>
          <button className={primaryButtonClassName} type="submit" disabled={!serverCreateForm.name.trim() || serverCreateForm.port <= 0 || serverCreateForm.maxClients <= 0}>创建服务器</button>
        </div>
        {createdServer ? <div className="space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"><div>虚拟服务器 #{createdServer.serverId} 已创建。</div><div className="break-all text-emerald-50">权限密钥：{createdServer.token}</div></div> : null}
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-lg font-semibold text-white">备份快照</div>
          <p className="text-sm text-slate-400">导出当前虚拟服务器完整快照，并下载为 `.backup` 文件。</p>
          <button className={primaryButtonClassName} type="button" onClick={onCreateSnapshot}>创建快照</button>
        </div>
        <div className="space-y-4 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-lg font-semibold text-white">恢复快照</div>
          <p className="text-sm text-slate-400">选择 `.backup` 文件并部署到当前虚拟服务器。</p>
          <label className={`${smallSecondaryButtonClassName} cursor-pointer`}><span>选择备份文件</span><input className="hidden" type="file" accept=".backup" onChange={(event) => { onSnapshotFileChange(event.target.files); event.currentTarget.value = ""; }} /></label>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">{snapshotFileName || "尚未选择文件。"}</div>
          <button className={smallDangerButtonClassName} type="button" onClick={onDeploySnapshot} disabled={!snapshotFileName}>部署快照</button>
          {snapshotStatus ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{snapshotStatus}</div> : null}
        </div>
      </div>
    </div>
  </div>;
}
function ChannelsView({ channels, form, spacerForm, editingChannelId, setForm, setSpacerForm, onApplySpacer, onDelete, onEdit, onCancelEdit, onSubmit }: { channels: ChannelSummary[]; form: ChannelFormState; spacerForm: SpacerFormState; editingChannelId: number | null; setForm: Dispatch<SetStateAction<ChannelFormState>>; setSpacerForm: Dispatch<SetStateAction<SpacerFormState>>; onApplySpacer: () => void; onDelete: (channelId: number) => Promise<void>; onEdit: (channel: ChannelSummary) => void; onCancelEdit: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; }) {
  const parentOptions = [{ id: 0, name: "根目录" }, ...channels.filter((channel) => channel.id !== editingChannelId).map((channel) => ({ id: channel.id, name: channel.name }))];
  const orderOptions = [{ id: 0, name: "置顶" }, ...channels.filter((channel) => channel.parentId === form.parentId && channel.id !== editingChannelId).map((channel) => ({ id: channel.id, name: channel.name }))];
  return <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]"><form className="space-y-3" onSubmit={onSubmit}><h3 className="text-lg font-semibold text-white">{editingChannelId === null ? "创建频道" : `编辑频道 #${editingChannelId}`}</h3><Input label="名称"><input className={inputClassName} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Input><div className="grid gap-3 md:grid-cols-3"><Input label="间隔符对齐"><select className={inputClassName} value={spacerForm.alignment} onChange={(event) => setSpacerForm((current) => ({ ...current, alignment: event.target.value as SpacerFormState["alignment"] }))}><option value="">无</option><option value="l">左</option><option value="c">中</option><option value="r">右</option></select></Input><Input label="间隔符文本"><input className={inputClassName} value={spacerForm.text} onChange={(event) => setSpacerForm((current) => ({ ...current, text: event.target.value }))} /></Input><Input label="特殊间隔符"><select className={inputClassName} value={spacerForm.special} onChange={(event) => setSpacerForm((current) => ({ ...current, special: event.target.value }))}><option value="">自定义</option>{specialSpacerOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></Input></div><button className={smallSecondaryButtonClassName} type="button" onClick={onApplySpacer}>使用间隔符名称</button><Input label="父频道"><select className={inputClassName} value={form.parentId} onChange={(event) => setForm((current) => ({ ...current, parentId: Number(event.target.value), orderAfterId: 0 }))}>{parentOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></Input><Input label="排序在其后"><select className={inputClassName} value={form.orderAfterId} onChange={(event) => setForm((current) => ({ ...current, orderAfterId: Number(event.target.value) }))}>{orderOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></Input><Input label="类型"><select className={inputClassName} value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as ChannelFormState["type"] }))}><option value="temporary">临时</option><option value="semi-permanent">半永久</option><option value="permanent">永久</option></select></Input><Input label="主题"><input className={inputClassName} value={form.topic} onChange={(event) => setForm((current) => ({ ...current, topic: event.target.value }))} /></Input><Input label="密码"><input className={inputClassName} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /></Input><Input label="最大客户端数（0 为不限制）"><input className={inputClassName} type="number" value={form.maxClients} onChange={(event) => setForm((current) => ({ ...current, maxClients: Number(event.target.value) }))} /></Input><div className="flex gap-2"><button className={primaryButtonClassName} type="submit" disabled={!form.name.trim()}>{editingChannelId === null ? "创建频道" : "保存频道"}</button>{editingChannelId !== null ? <button className={smallSecondaryButtonClassName} type="button" onClick={onCancelEdit}>取消</button> : null}</div></form><div className="overflow-auto rounded-3xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="bg-slate-950/85 text-slate-300"><tr><th className="px-4 py-3">频道</th><th className="px-4 py-3">父频道</th><th className="px-4 py-3">人数</th><th className="px-4 py-3"></th></tr></thead><tbody>{channels.map((channel) => <tr key={channel.id} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3"><div>{channel.name}</div><div className="text-xs text-slate-500">{channel.isPermanent ? "永久" : channel.isSemiPermanent ? "半永久" : "临时"}</div></td><td className="px-4 py-3 text-slate-400">{channels.find((item) => item.id === channel.parentId)?.name ?? "根目录"}</td><td className="px-4 py-3 text-slate-400">{channel.totalClients}/{channel.maxClients > 0 ? channel.maxClients : "无限制"}</td><td className="px-4 py-3"><div className="flex gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => onEdit(channel)}>编辑</button><button className={smallDangerButtonClassName} type="button" onClick={() => void onDelete(channel.id)}>删除</button></div></td></tr>)}</tbody></table>{!channels.length ? <EmptyState label="当前没有频道。" /> : null}</div></div>;
}

function ClientsView({ clients, dbClients, channels, serverGroups, defaultServerGroupId, onRefresh, onLoadDetail, onSaveEdit, onKick, onMove, onBan, onPoke, onDeleteDatabaseClients }: { clients: ClientSummary[]; dbClients: ClientDbEntry[]; channels: ChannelSummary[]; serverGroups: PermissionTarget[]; defaultServerGroupId: number; onRefresh: () => Promise<void> | void; onLoadDetail: (clientId: number) => Promise<ClientDetail>; onSaveEdit: (clientId: number, payload: { description: string; serverGroupIds: number[] }) => Promise<void>; onKick: (clientId: number, payload: { reason: string; mode: "server" | "channel" }) => Promise<void>; onMove: (clientId: number, payload: { targetChannelId: number; channelPassword?: string }) => Promise<void>; onBan: (clientId: number, payload: { reason: string; time: number }) => Promise<void>; onPoke: (clientId: number, payload: { message: string }) => Promise<void>; onDeleteDatabaseClients: (clientDbIds: number[]) => Promise<void>; }) {
  const assignableServerGroups = serverGroups.filter((group) => group.type === 1 || group.type === 2).sort((left, right) => (left.type ?? 0) - (right.type ?? 0));
  const [action, setAction] = useState<ClientActionState | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);
  const [selectedDbClientIds, setSelectedDbClientIds] = useState<number[]>([]);
  const [batchMode, setBatchMode] = useState<Exclude<ClientActionState["mode"], "edit"> | null>(null);
  const [kickReason, setKickReason] = useState("");
  const [kickMode, setKickMode] = useState<"server" | "channel">("server");
  const [moveChannelId, setMoveChannelId] = useState(0);
  const [movePassword, setMovePassword] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banTime, setBanTime] = useState(3600);
  const [pokeMessage, setPokeMessage] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const visibleClients = clients.filter((client) => !client.isQuery);
  const selectedClients = visibleClients.filter((client) => selectedClientIds.includes(client.id));
  const allSelected = visibleClients.length > 0 && selectedClientIds.length === visibleClients.length;
  const allDbSelected = dbClients.length > 0 && selectedDbClientIds.length === dbClients.length;

  function resetActionFields(mode?: Exclude<ClientActionState["mode"], "edit">) {
    if (mode === "move") {
      setMoveChannelId(channels[0]?.id ?? 0);
      setMovePassword("");
      return;
    }
    if (mode === "kick") {
      setKickReason("");
      setKickMode("server");
      return;
    }
    if (mode === "ban") {
      setBanReason("");
      setBanTime(3600);
      return;
    }
    if (mode === "poke") {
      setPokeMessage("");
    }
  }

  async function openAction(client: ClientSummary, mode: ClientActionState["mode"]) {
    setError(null);
    setAction({ client, mode });
    if (mode !== "edit") {
      resetActionFields(mode);
      return;
    }

    setBusy(true);
    try {
      const payload = await onLoadDetail(client.id);
      setDetail(payload);
      setEditDescription(payload.description || "");
      setSelectedGroupIds(payload.serverGroupIds);
    } catch (cause) {
      setAction(null);
      setDetail(null);
      setError(cause instanceof Error ? cause.message : "加载客户端详情失败。");
    } finally {
      setBusy(false);
    }
  }

  function toggleClient(clientId: number, checked: boolean) {
    setSelectedClientIds((current) => checked ? Array.from(new Set([...current, clientId])) : current.filter((id) => id !== clientId));
  }

  function toggleAllClients(checked: boolean) {
    setSelectedClientIds(checked ? visibleClients.map((client) => client.id) : []);
  }

  async function submitAction() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      if (action.mode === "kick") await onKick(action.client.id, { reason: kickReason, mode: kickMode });
      else if (action.mode === "move") await onMove(action.client.id, { targetChannelId: moveChannelId, channelPassword: movePassword || undefined });
      else if (action.mode === "ban") await onBan(action.client.id, { reason: banReason, time: banTime });
      else if (action.mode === "poke") await onPoke(action.client.id, { message: pokeMessage });
      else await onSaveEdit(action.client.id, { description: editDescription, serverGroupIds: selectedGroupIds });
      setAction(null);
      setDetail(null);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "客户端操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function submitBatchAction() {
    if (!batchMode || !selectedClients.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const client of selectedClients) {
        if (batchMode === "kick") await onKick(client.id, { reason: kickReason, mode: kickMode });
        else if (batchMode === "move") await onMove(client.id, { targetChannelId: moveChannelId, channelPassword: movePassword || undefined });
        else if (batchMode === "ban") await onBan(client.id, { reason: banReason, time: banTime });
        else if (batchMode === "poke") await onPoke(client.id, { message: pokeMessage });
      }
      setBatchMode(null);
      setSelectedClientIds([]);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "批量客户端操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDatabaseClients(clientDbIds: number[]) {
    if (!clientDbIds.length) return;
    if (!window.confirm(`确认删除 ${clientDbIds.length} 个客户端数据库记录？此操作不可恢复。`)) return;

    setBusy(true);
    setError(null);
    try {
      await onDeleteDatabaseClients(clientDbIds);
      setSelectedDbClientIds([]);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除客户端数据库记录失败。");
    } finally {
      setBusy(false);
    }
  }

  return <>
    {error ? <p className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
        <div>
          <div className="text-sm font-medium text-white">批量客户端操作</div>
          <p className="mt-1 text-sm text-slate-400">已选 {selectedClientIds.length} / {visibleClients.length} 个在线客户端，可批量移动、踢出、封禁或发送戳消息。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={smallSecondaryButtonClassName} type="button" onClick={() => { resetActionFields("move"); setBatchMode("move"); }} disabled={!selectedClientIds.length}>批量移动</button>
          <button className={smallSecondaryButtonClassName} type="button" onClick={() => { resetActionFields("poke"); setBatchMode("poke"); }} disabled={!selectedClientIds.length}>批量戳消息</button>
          <button className={smallSecondaryButtonClassName} type="button" onClick={() => { resetActionFields("kick"); setBatchMode("kick"); }} disabled={!selectedClientIds.length}>批量踢出</button>
          <button className={smallDangerButtonClassName} type="button" onClick={() => { resetActionFields("ban"); setBatchMode("ban"); }} disabled={!selectedClientIds.length}>批量封禁</button>
          <button className={smallSecondaryButtonClassName} type="button" onClick={() => setSelectedClientIds([])} disabled={!selectedClientIds.length}>清空选择</button>
        </div>
      </div>

      <div className="overflow-auto rounded-3xl border border-white/8">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-950/85 text-slate-300">
            <tr>
              <th className="px-4 py-3"><input checked={allSelected} onChange={(event) => toggleAllClients(event.target.checked)} type="checkbox" /></th>
              <th className="px-4 py-3">客户端</th>
              <th className="px-4 py-3">所在频道</th>
              <th className="px-4 py-3">平台</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibleClients.map((client) => <tr key={client.id} className="border-t border-white/6 text-slate-200">
              <td className="px-4 py-3"><input checked={selectedClientIds.includes(client.id)} onChange={(event) => toggleClient(client.id, event.target.checked)} type="checkbox" /></td>
              <td className="px-4 py-3"><div>{client.nickname}</div><div className="text-xs text-slate-500">数据库 ID {client.databaseId}</div></td>
              <td className="px-4 py-3 text-slate-400">{channels.find((channel) => channel.id === client.channelId)?.name ?? client.channelId}</td>
              <td className="px-4 py-3 text-slate-400">{client.platform || "--"}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => void openAction(client, "edit")}>编辑</button><button className={smallSecondaryButtonClassName} type="button" onClick={() => void openAction(client, "move")}>移动</button><button className={smallSecondaryButtonClassName} type="button" onClick={() => void openAction(client, "poke")}>戳消息</button><button className={smallSecondaryButtonClassName} type="button" onClick={() => void openAction(client, "kick")}>踢出</button><button className={smallDangerButtonClassName} type="button" onClick={() => void openAction(client, "ban")}>封禁</button></div></td>
            </tr>)}
          </tbody>
        </table>
        {!visibleClients.length ? <EmptyState label="没有在线普通客户端。" /> : null}
      </div>

      <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">客户端数据库</div>
            <p className="mt-1 text-sm text-slate-400">补齐旧版 `clientdbdelete` 能力，可直接清理离线客户端数据库记录。</p>
          </div>
          <button className={smallDangerButtonClassName} type="button" onClick={() => void handleDeleteDatabaseClients(selectedDbClientIds)} disabled={!selectedDbClientIds.length || busy}>批量删除</button>
        </div>
        <div className="mt-4 overflow-auto rounded-3xl border border-white/8">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950/85 text-slate-300">
              <tr>
                <th className="px-4 py-3"><input checked={allDbSelected} onChange={(event) => setSelectedDbClientIds(event.target.checked ? dbClients.map((client) => client.cldbid) : [])} type="checkbox" /></th>
                <th className="px-4 py-3">客户端</th>
                <th className="px-4 py-3">最近连接</th>
                <th className="px-4 py-3">总连接次数</th>
                <th className="px-4 py-3">最后 IP</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {dbClients.map((client) => <tr key={client.cldbid} className="border-t border-white/6 text-slate-200">
                <td className="px-4 py-3"><input checked={selectedDbClientIds.includes(client.cldbid)} onChange={(event) => setSelectedDbClientIds((current) => event.target.checked ? Array.from(new Set([...current, client.cldbid])) : current.filter((id) => id !== client.cldbid))} type="checkbox" /></td>
                <td className="px-4 py-3"><div>{client.clientNickname}</div><div className="text-xs text-slate-500">数据库 ID {client.cldbid}</div></td>
                <td className="px-4 py-3 text-slate-400">{client.clientLastconnected ? new Date(client.clientLastconnected * 1000).toLocaleString("zh-CN") : "--"}</td>
                <td className="px-4 py-3 text-slate-400">{client.clientTotalconnections}</td>
                <td className="px-4 py-3 text-slate-400">{client.clientLastip || "--"}</td>
                <td className="px-4 py-3"><button className={smallDangerButtonClassName} type="button" onClick={() => void handleDeleteDatabaseClients([client.cldbid])} disabled={busy}>删除</button></td>
              </tr>)}
            </tbody>
          </table>
          {!dbClients.length ? <EmptyState label="当前没有客户端数据库记录。" /> : null}
        </div>
      </div>
    </div>

    <ModalFrame open={!!action} title={action ? `${action.mode === "edit" ? "编辑" : action.mode === "move" ? "移动" : action.mode === "kick" ? "踢出" : action.mode === "ban" ? "封禁" : "戳消息"} / ${action.client.nickname}` : "客户端操作"} onClose={() => !busy && setAction(null)}>
      {action?.mode === "edit" ? <div className="space-y-4"><Input label="描述"><textarea className={`${inputClassName} min-h-28`} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></Input><Input label="服务器组"><select className={`${inputClassName} min-h-40`} multiple value={selectedGroupIds.map(String)} onChange={(event) => setSelectedGroupIds(Array.from(event.target.selectedOptions).map((item) => Number(item.value)))}>{assignableServerGroups.map((group) => <option key={group.id} value={group.id} disabled={group.id === defaultServerGroupId || group.type === 2}>{group.name}</option>)}</select></Input><div className="text-xs text-slate-500">默认访客组和 ServerQuery 组保持只读，避免提交旧版也不允许的成员变更。</div><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setAction(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void submitAction()} disabled={busy || !detail}>保存</button></div></div> : null}
      {action?.mode === "kick" ? <div className="space-y-4"><Input label="原因"><input className={inputClassName} value={kickReason} onChange={(event) => setKickReason(event.target.value)} /></Input><Input label="范围"><select className={inputClassName} value={kickMode} onChange={(event) => setKickMode(event.target.value as "server" | "channel")}><option value="server">服务器</option><option value="channel">当前频道</option></select></Input><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setAction(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void submitAction()} disabled={busy}>踢出</button></div></div> : null}
      {action?.mode === "move" ? <div className="space-y-4"><Input label="目标频道"><select className={inputClassName} value={moveChannelId} onChange={(event) => setMoveChannelId(Number(event.target.value))}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></Input><Input label="频道密码"><input className={inputClassName} value={movePassword} onChange={(event) => setMovePassword(event.target.value)} /></Input><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setAction(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void submitAction()} disabled={busy || moveChannelId <= 0}>移动</button></div></div> : null}
      {action?.mode === "ban" ? <div className="space-y-4"><Input label="原因"><input className={inputClassName} value={banReason} onChange={(event) => setBanReason(event.target.value)} /></Input><Input label="时长（秒）"><input className={inputClassName} type="number" value={banTime} onChange={(event) => setBanTime(Number(event.target.value))} /></Input><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setAction(null)} disabled={busy}>取消</button><button className={smallDangerButtonClassName} type="button" onClick={() => void submitAction()} disabled={busy}>封禁</button></div></div> : null}
      {action?.mode === "poke" ? <div className="space-y-4"><Input label="戳消息"><input className={inputClassName} value={pokeMessage} onChange={(event) => setPokeMessage(event.target.value)} /></Input><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setAction(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void submitAction()} disabled={busy || !pokeMessage.trim()}>发送</button></div></div> : null}
    </ModalFrame>

    <ModalFrame open={!!batchMode} title={batchMode ? `批量${batchMode === "move" ? "移动" : batchMode === "poke" ? "戳消息" : batchMode === "kick" ? "踢出" : "封禁"} / ${selectedClients.length} 人` : "批量操作"} onClose={() => !busy && setBatchMode(null)}>
      {batchMode === "kick" ? <div className="space-y-4"><Input label="原因"><input className={inputClassName} value={kickReason} onChange={(event) => setKickReason(event.target.value)} /></Input><Input label="范围"><select className={inputClassName} value={kickMode} onChange={(event) => setKickMode(event.target.value as "server" | "channel")}><option value="server">服务器</option><option value="channel">当前频道</option></select></Input><div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">目标：{selectedClients.map((client) => client.nickname).join("、") || "无"}</div><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setBatchMode(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void submitBatchAction()} disabled={busy || !selectedClients.length}>批量踢出</button></div></div> : null}
      {batchMode === "move" ? <div className="space-y-4"><Input label="目标频道"><select className={inputClassName} value={moveChannelId} onChange={(event) => setMoveChannelId(Number(event.target.value))}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></Input><Input label="频道密码"><input className={inputClassName} value={movePassword} onChange={(event) => setMovePassword(event.target.value)} /></Input><div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">目标：{selectedClients.map((client) => client.nickname).join("、") || "无"}</div><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setBatchMode(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void submitBatchAction()} disabled={busy || moveChannelId <= 0 || !selectedClients.length}>批量移动</button></div></div> : null}
      {batchMode === "ban" ? <div className="space-y-4"><Input label="原因"><input className={inputClassName} value={banReason} onChange={(event) => setBanReason(event.target.value)} /></Input><Input label="时长（秒）"><input className={inputClassName} type="number" value={banTime} onChange={(event) => setBanTime(Number(event.target.value))} /></Input><div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">目标：{selectedClients.map((client) => client.nickname).join("、") || "无"}</div><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setBatchMode(null)} disabled={busy}>取消</button><button className={smallDangerButtonClassName} type="button" onClick={() => void submitBatchAction()} disabled={busy || !selectedClients.length}>批量封禁</button></div></div> : null}
      {batchMode === "poke" ? <div className="space-y-4"><Input label="戳消息"><input className={inputClassName} value={pokeMessage} onChange={(event) => setPokeMessage(event.target.value)} /></Input><div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">目标：{selectedClients.map((client) => client.nickname).join("、") || "无"}</div><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setBatchMode(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void submitBatchAction()} disabled={busy || !pokeMessage.trim() || !selectedClients.length}>批量发送</button></div></div> : null}
    </ModalFrame>
  </>;
}
function GroupsView({ serverGroups, channelGroups, channels, clients, onRefreshServerGroups, onRefreshChannelGroups }: { serverGroups: PermissionTarget[]; channelGroups: PermissionTarget[]; channels: ChannelSummary[]; clients: ClientDbEntry[]; onRefreshServerGroups: () => Promise<void> | void; onRefreshChannelGroups: () => Promise<void> | void; }) {
  const regularServerGroups = serverGroups.filter((group) => group.type === 1);
  const regularChannelGroups = channelGroups.filter((group) => group.type === 1);
  const [serverGroupName, setServerGroupName] = useState("");
  const [serverGroupType, setServerGroupType] = useState(1);
  const [channelGroupName, setChannelGroupName] = useState("");
  const [channelGroupType, setChannelGroupType] = useState(1);
  const [serverEditor, setServerEditor] = useState<ServerGroupEditor>(null);
  const [channelEditor, setChannelEditor] = useState<ChannelGroupEditor>(null);
  const [serverCopy, setServerCopy] = useState<GroupCopyState>(null);
  const [channelCopy, setChannelCopy] = useState<GroupCopyState>(null);
  const [batchServerGroupId, setBatchServerGroupId] = useState(0);
  const [batchServerGroupMode, setBatchServerGroupMode] = useState<"add" | "remove">("add");
  const [batchServerClientIds, setBatchServerClientIds] = useState<number[]>([]);
  const [batchChannelGroupId, setBatchChannelGroupId] = useState(0);
  const [batchChannelId, setBatchChannelId] = useState(0);
  const [batchChannelGroupMode, setBatchChannelGroupMode] = useState<"add" | "remove">("add");
  const [batchChannelClientIds, setBatchChannelClientIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBatchServerGroupId((current) => current && regularServerGroups.some((group) => group.id === current) ? current : (regularServerGroups[0]?.id ?? 0));
  }, [regularServerGroups]);

  useEffect(() => {
    setBatchChannelGroupId((current) => current && regularChannelGroups.some((group) => group.id === current) ? current : (regularChannelGroups[0]?.id ?? 0));
  }, [regularChannelGroups]);

  useEffect(() => {
    setBatchChannelId((current) => current || (channels[0]?.id ?? 0));
  }, [channels]);

  async function createServerGroup() {
    setBusy(true);
    setError(null);
    try {
      await api.createServerGroup({ name: serverGroupName, type: serverGroupType });
      setServerGroupName("");
      await onRefreshServerGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建服务器组失败。");
    } finally {
      setBusy(false);
    }
  }

  async function createChannelGroup() {
    setBusy(true);
    setError(null);
    try {
      await api.createChannelGroup({ name: channelGroupName, type: channelGroupType });
      setChannelGroupName("");
      await onRefreshChannelGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建频道组失败。");
    } finally {
      setBusy(false);
    }
  }

  async function deleteServerGroup(group: PermissionTarget) {
    if (!window.confirm(`确认删除服务器组“${group.name}”？`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteServerGroup(group.id);
      await onRefreshServerGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除服务器组失败。");
    } finally {
      setBusy(false);
    }
  }

  async function deleteChannelGroup(group: PermissionTarget) {
    if (!window.confirm(`确认删除频道组“${group.name}”？`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteChannelGroup(group.id);
      await onRefreshChannelGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除频道组失败。");
    } finally {
      setBusy(false);
    }
  }

  async function openServerEditor(group: PermissionTarget) {
    setBusy(true);
    setError(null);
    try {
      const members = group.type === 1 ? await api.getServerGroupClients(group.id) : [];
      setServerEditor({ id: group.id, name: group.name, type: group.type ?? 1, members: members.map((item) => item.cldbid) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载服务器组成员失败。");
    } finally {
      setBusy(false);
    }
  }

  async function openChannelEditor(group: PermissionTarget) {
    setBusy(true);
    setError(null);
    try {
      setChannelEditor({ id: group.id, name: group.name, type: group.type ?? 1, channelId: 0, members: [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载频道组成员失败。");
    } finally {
      setBusy(false);
    }
  }

  function openServerCopy(group: PermissionTarget) {
    const target = serverGroups.find((item) => item.id !== group.id);
    setServerCopy({ sourceId: group.id, sourceName: group.name, name: `${group.name} 副本`, type: group.type ?? 1, overwrite: false, targetGroupId: target?.id ?? 0 });
  }

  function openChannelCopy(group: PermissionTarget) {
    const target = channelGroups.find((item) => item.id !== group.id);
    setChannelCopy({ sourceId: group.id, sourceName: group.name, name: `${group.name} 副本`, type: group.type ?? 1, overwrite: false, targetGroupId: target?.id ?? 0 });
  }

  async function submitServerCopy() {
    if (!serverCopy) return;
    const overwriteTarget = serverGroups.find((group) => group.id === serverCopy.targetGroupId);
    const payload = {
      targetGroupId: serverCopy.overwrite ? serverCopy.targetGroupId : 0,
      name: serverCopy.overwrite ? (overwriteTarget?.name ?? serverCopy.sourceName) : serverCopy.name.trim(),
      type: serverCopy.type,
    };
    if (!payload.name) {
      setError("复制服务器组时必须填写目标名称。");
      return;
    }
    if (serverCopy.overwrite && payload.targetGroupId <= 0) {
      setError("请选择要覆盖的服务器组。");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.copyServerGroup(serverCopy.sourceId, payload);
      setServerCopy(null);
      await onRefreshServerGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "复制服务器组失败。");
    } finally {
      setBusy(false);
    }
  }

  async function submitChannelCopy() {
    if (!channelCopy) return;
    const overwriteTarget = channelGroups.find((group) => group.id === channelCopy.targetGroupId);
    const payload = {
      targetGroupId: channelCopy.overwrite ? channelCopy.targetGroupId : 0,
      name: channelCopy.overwrite ? (overwriteTarget?.name ?? channelCopy.sourceName) : channelCopy.name.trim(),
      type: channelCopy.type,
    };
    if (!payload.name) {
      setError("复制频道组时必须填写目标名称。");
      return;
    }
    if (channelCopy.overwrite && payload.targetGroupId <= 0) {
      setError("请选择要覆盖的频道组。");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.copyChannelGroup(channelCopy.sourceId, payload);
      setChannelCopy(null);
      await onRefreshChannelGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "复制频道组失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveServerEditor() {
    if (!serverEditor) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateServerGroup(serverEditor.id, { name: serverEditor.name });
      if (serverEditor.type === 1) {
        const currentMembers = await api.getServerGroupClients(serverEditor.id);
        const currentIds = new Set(currentMembers.map((item) => item.cldbid));
        const targetIds = new Set(serverEditor.members);
        for (const clientId of targetIds) if (!currentIds.has(clientId)) await api.addServerGroupClient(serverEditor.id, clientId);
        for (const clientId of currentIds) if (!targetIds.has(clientId)) await api.removeServerGroupClient(serverEditor.id, clientId);
      }
      setServerEditor(null);
      await onRefreshServerGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存服务器组失败。");
    } finally {
      setBusy(false);
    }
  }

  async function reloadChannelEditorMembers(nextChannelId: number) {
    if (!channelEditor || nextChannelId <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const members = await api.getChannelGroupClients(channelEditor.id, nextChannelId);
      setChannelEditor((current) => current ? { ...current, channelId: nextChannelId, members: members.map((item) => item.cldbid) } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载频道组成员失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveChannelEditor() {
    if (!channelEditor) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateChannelGroup(channelEditor.id, { name: channelEditor.name });
      if (channelEditor.channelId > 0) {
        const currentMembers = await api.getChannelGroupClients(channelEditor.id, channelEditor.channelId);
        const currentIds = new Set(currentMembers.map((item) => item.cldbid));
        const targetIds = new Set(channelEditor.members);
        for (const clientId of targetIds) if (!currentIds.has(clientId)) await api.addChannelGroupClient(channelEditor.id, { clientDbId: clientId, channelId: channelEditor.channelId });
        for (const clientId of currentIds) if (!targetIds.has(clientId)) await api.removeChannelGroupClient(channelEditor.id, { clientDbId: clientId, channelId: channelEditor.channelId });
      }
      setChannelEditor(null);
      await onRefreshChannelGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存频道组失败。");
    } finally {
      setBusy(false);
    }
  }

  async function submitBatchServerGroup() {
    if (batchServerGroupId <= 0 || !batchServerClientIds.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const clientId of batchServerClientIds) {
        if (batchServerGroupMode === "add") await api.addServerGroupClient(batchServerGroupId, clientId);
        else await api.removeServerGroupClient(batchServerGroupId, clientId);
      }
      setBatchServerClientIds([]);
      await onRefreshServerGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "批量服务器组操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function submitBatchChannelGroup() {
    if (batchChannelGroupId <= 0 || batchChannelId <= 0 || !batchChannelClientIds.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const clientId of batchChannelClientIds) {
        if (batchChannelGroupMode === "add") await api.addChannelGroupClient(batchChannelGroupId, { clientDbId: clientId, channelId: batchChannelId });
        else await api.removeChannelGroupClient(batchChannelGroupId, { clientDbId: clientId, channelId: batchChannelId });
      }
      setBatchChannelClientIds([]);
      await onRefreshChannelGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "批量频道组操作失败。");
    } finally {
      setBusy(false);
    }
  }

  const serverCopyTargets = serverCopy ? serverGroups.filter((group) => group.id !== serverCopy.sourceId) : [];
  const channelCopyTargets = channelCopy ? channelGroups.filter((group) => group.id !== channelCopy.sourceId) : [];

  return <>
    {error ? <p className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-sm font-medium text-white">批量服务器组成员操作</div>
          <p className="mt-1 text-sm text-slate-400">一次为多个客户端批量加入或移出同一个服务器组。</p>
          <div className="mt-4 grid gap-3 xl:grid-cols-[220px_180px_1fr_auto]">
            <Input label="服务器组"><select className={inputClassName} value={batchServerGroupId} onChange={(event) => setBatchServerGroupId(Number(event.target.value))}>{regularServerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Input>
            <Input label="操作"><select className={inputClassName} value={batchServerGroupMode} onChange={(event) => setBatchServerGroupMode(event.target.value as "add" | "remove")}><option value="add">批量加入</option><option value="remove">批量移出</option></select></Input>
            <Input label="客户端"><select className={`${inputClassName} min-h-40`} multiple value={batchServerClientIds.map(String)} onChange={(event) => setBatchServerClientIds(Array.from(event.target.selectedOptions).map((item) => Number(item.value)))}>{clients.map((client) => <option key={client.cldbid} value={client.cldbid}>{client.clientNickname} ({client.cldbid})</option>)}</select></Input>
            <div className="flex items-end"><button className={primaryButtonClassName} type="button" onClick={() => void submitBatchServerGroup()} disabled={busy || batchServerGroupId <= 0 || !batchServerClientIds.length}>{batchServerGroupMode === "add" ? "执行加入" : "执行移出"}</button></div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-sm font-medium text-white">批量频道组成员操作</div>
          <p className="mt-1 text-sm text-slate-400">针对指定频道，为多个客户端批量加入或移出同一个频道组。</p>
          <div className="mt-4 grid gap-3 xl:grid-cols-[220px_220px_180px_1fr_auto]">
            <Input label="频道组"><select className={inputClassName} value={batchChannelGroupId} onChange={(event) => setBatchChannelGroupId(Number(event.target.value))}>{regularChannelGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Input>
            <Input label="频道"><select className={inputClassName} value={batchChannelId} onChange={(event) => setBatchChannelId(Number(event.target.value))}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></Input>
            <Input label="操作"><select className={inputClassName} value={batchChannelGroupMode} onChange={(event) => setBatchChannelGroupMode(event.target.value as "add" | "remove")}><option value="add">批量加入</option><option value="remove">批量移出</option></select></Input>
            <Input label="客户端"><select className={`${inputClassName} min-h-40`} multiple value={batchChannelClientIds.map(String)} onChange={(event) => setBatchChannelClientIds(Array.from(event.target.selectedOptions).map((item) => Number(item.value)))}>{clients.map((client) => <option key={client.cldbid} value={client.cldbid}>{client.clientNickname} ({client.cldbid})</option>)}</select></Input>
            <div className="flex items-end"><button className={primaryButtonClassName} type="button" onClick={() => void submitBatchChannelGroup()} disabled={busy || batchChannelGroupId <= 0 || batchChannelId <= 0 || !batchChannelClientIds.length}>{batchChannelGroupMode === "add" ? "执行加入" : "执行移出"}</button></div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-sm font-medium text-white">服务器组</div>
          <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
            <input className={inputClassName} value={serverGroupName} onChange={(event) => setServerGroupName(event.target.value)} placeholder="新服务器组名称" />
            <select className={inputClassName} value={serverGroupType} onChange={(event) => setServerGroupType(Number(event.target.value))}><option value={1}>普通</option><option value={2}>查询</option></select>
            <button className={primaryButtonClassName} type="button" onClick={() => void createServerGroup()} disabled={busy || !serverGroupName.trim()}>创建</button>
          </div>
          <div className="overflow-auto rounded-3xl border border-white/8">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-950/85 text-slate-300"><tr><th className="px-4 py-3">名称</th><th className="px-4 py-3">类型</th><th className="px-4 py-3"></th></tr></thead>
              <tbody>{serverGroups.map((group) => <tr key={group.id} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3">{group.name}</td><td className="px-4 py-3 text-slate-400">{group.type}</td><td className="px-4 py-3"><div className="flex gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => void openServerEditor(group)} disabled={busy}>编辑</button><button className={smallSecondaryButtonClassName} type="button" onClick={() => openServerCopy(group)} disabled={busy}>复制</button><button className={smallDangerButtonClassName} type="button" onClick={() => void deleteServerGroup(group)} disabled={busy}>删除</button></div></td></tr>)}</tbody>
            </table>
            {!serverGroups.length ? <EmptyState label="当前没有服务器组。" /> : null}
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-sm font-medium text-white">频道组</div>
          <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
            <input className={inputClassName} value={channelGroupName} onChange={(event) => setChannelGroupName(event.target.value)} placeholder="新频道组名称" />
            <select className={inputClassName} value={channelGroupType} onChange={(event) => setChannelGroupType(Number(event.target.value))}><option value={1}>普通</option><option value={2}>查询</option></select>
            <button className={primaryButtonClassName} type="button" onClick={() => void createChannelGroup()} disabled={busy || !channelGroupName.trim()}>创建</button>
          </div>
          <div className="overflow-auto rounded-3xl border border-white/8">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-950/85 text-slate-300"><tr><th className="px-4 py-3">名称</th><th className="px-4 py-3">类型</th><th className="px-4 py-3"></th></tr></thead>
              <tbody>{channelGroups.map((group) => <tr key={group.id} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3">{group.name}</td><td className="px-4 py-3 text-slate-400">{group.type}</td><td className="px-4 py-3"><div className="flex gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => void openChannelEditor(group)} disabled={busy}>编辑</button><button className={smallSecondaryButtonClassName} type="button" onClick={() => openChannelCopy(group)} disabled={busy}>复制</button><button className={smallDangerButtonClassName} type="button" onClick={() => void deleteChannelGroup(group)} disabled={busy}>删除</button></div></td></tr>)}</tbody>
            </table>
            {!channelGroups.length ? <EmptyState label="当前没有频道组。" /> : null}
          </div>
        </div>
      </div>

      <ModalFrame open={!!serverEditor} title="编辑服务器组" onClose={() => !busy && setServerEditor(null)}>{serverEditor ? <div className="space-y-4"><Input label="名称"><input className={inputClassName} value={serverEditor.name} onChange={(event) => setServerEditor((current) => current ? { ...current, name: event.target.value } : current)} /></Input><Input label="成员"><select className={`${inputClassName} min-h-48`} multiple disabled={serverEditor.type !== 1} value={serverEditor.members.map(String)} onChange={(event) => setServerEditor((current) => current ? { ...current, members: Array.from(event.target.selectedOptions).map((item) => Number(item.value)) } : current)}>{clients.map((client) => <option key={client.cldbid} value={client.cldbid}>{client.clientNickname} ({client.cldbid})</option>)}</select></Input>{serverEditor.type !== 1 ? <div className="text-xs text-slate-500">模板组和 ServerQuery 组仅支持重命名，不调整成员。</div> : null}<div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setServerEditor(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void saveServerEditor()} disabled={busy}>保存</button></div></div> : null}</ModalFrame>
      <ModalFrame open={!!channelEditor} title="编辑频道组" onClose={() => !busy && setChannelEditor(null)}>{channelEditor ? <div className="space-y-4"><Input label="名称"><input className={inputClassName} value={channelEditor.name} onChange={(event) => setChannelEditor((current) => current ? { ...current, name: event.target.value } : current)} /></Input><Input label="频道"><select className={inputClassName} value={channelEditor.channelId} onChange={(event) => void reloadChannelEditorMembers(Number(event.target.value))}><option value={0}>仅重命名，不调整成员</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></Input><Input label="成员"><select className={`${inputClassName} min-h-48`} multiple disabled={channelEditor.channelId <= 0} value={channelEditor.members.map(String)} onChange={(event) => setChannelEditor((current) => current ? { ...current, members: Array.from(event.target.selectedOptions).map((item) => Number(item.value)) } : current)}>{clients.map((client) => <option key={client.cldbid} value={client.cldbid}>{client.clientNickname} ({client.cldbid})</option>)}</select></Input><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setChannelEditor(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void saveChannelEditor()} disabled={busy}>保存</button></div></div> : null}</ModalFrame>
      <ModalFrame open={!!serverCopy} title="复制服务器组" onClose={() => !busy && setServerCopy(null)}>{serverCopy ? <div className="space-y-4"><Input label="复制方式"><select className={inputClassName} value={serverCopy.overwrite ? "overwrite" : "create"} onChange={(event) => setServerCopy((current) => current ? { ...current, overwrite: event.target.value === "overwrite" } : current)}><option value="create">创建新组</option><option value="overwrite">覆盖现有组</option></select></Input>{serverCopy.overwrite ? <Input label="目标服务器组"><select className={inputClassName} value={serverCopy.targetGroupId} onChange={(event) => setServerCopy((current) => current ? { ...current, targetGroupId: Number(event.target.value) } : current)}>{serverCopyTargets.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Input> : <Input label="新组名称"><input className={inputClassName} value={serverCopy.name} onChange={(event) => setServerCopy((current) => current ? { ...current, name: event.target.value } : current)} /></Input>}<Input label="组类型"><select className={inputClassName} value={serverCopy.type} onChange={(event) => setServerCopy((current) => current ? { ...current, type: Number(event.target.value) } : current)}><option value={1}>普通</option><option value={2}>查询</option></select></Input><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setServerCopy(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void submitServerCopy()} disabled={busy || (!serverCopy.overwrite && !serverCopy.name.trim()) || (serverCopy.overwrite && !serverCopyTargets.length)}>复制</button></div></div> : null}</ModalFrame>
      <ModalFrame open={!!channelCopy} title="复制频道组" onClose={() => !busy && setChannelCopy(null)}>{channelCopy ? <div className="space-y-4"><Input label="复制方式"><select className={inputClassName} value={channelCopy.overwrite ? "overwrite" : "create"} onChange={(event) => setChannelCopy((current) => current ? { ...current, overwrite: event.target.value === "overwrite" } : current)}><option value="create">创建新组</option><option value="overwrite">覆盖现有组</option></select></Input>{channelCopy.overwrite ? <Input label="目标频道组"><select className={inputClassName} value={channelCopy.targetGroupId} onChange={(event) => setChannelCopy((current) => current ? { ...current, targetGroupId: Number(event.target.value) } : current)}>{channelCopyTargets.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Input> : <Input label="新组名称"><input className={inputClassName} value={channelCopy.name} onChange={(event) => setChannelCopy((current) => current ? { ...current, name: event.target.value } : current)} /></Input>}<Input label="组类型"><select className={inputClassName} value={channelCopy.type} onChange={(event) => setChannelCopy((current) => current ? { ...current, type: Number(event.target.value) } : current)}><option value={1}>普通</option><option value={2}>查询</option></select></Input><div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setChannelCopy(null)} disabled={busy}>取消</button><button className={primaryButtonClassName} type="button" onClick={() => void submitChannelCopy()} disabled={busy || (!channelCopy.overwrite && !channelCopy.name.trim()) || (channelCopy.overwrite && !channelCopyTargets.length)}>复制</button></div></div> : null}</ModalFrame>
    </div>
  </>;
}
function ComplaintsView({ complaints, onDelete }: { complaints: ComplaintEntry[]; onDelete: (payload: { tcldbid: number; fcldbid: number }) => Promise<void>; }) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const selectedComplaints = complaints.filter((item) => selectedKeys.includes(`${item.tcldbid}-${item.fcldbid}`));

  async function removeSelected() {
    for (const complaint of selectedComplaints) {
      await onDelete({ tcldbid: complaint.tcldbid, fcldbid: complaint.fcldbid });
    }
    setSelectedKeys([]);
  }

  return <div className="space-y-4"><div className="flex justify-end"><button className={smallDangerButtonClassName} type="button" onClick={() => void removeSelected()} disabled={!selectedComplaints.length}>批量移除</button></div><div className="overflow-auto rounded-3xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="bg-slate-950/85 text-slate-300"><tr><th className="px-4 py-3"></th><th className="px-4 py-3">被投诉人</th><th className="px-4 py-3">投诉人</th><th className="px-4 py-3">原因</th><th className="px-4 py-3"></th></tr></thead><tbody>{complaints.map((complaint) => { const key = `${complaint.tcldbid}-${complaint.fcldbid}`; return <tr key={key} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3"><input checked={selectedKeys.includes(key)} onChange={(event) => setSelectedKeys((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} type="checkbox" /></td><td className="px-4 py-3"><div>{complaint.tname}</div><div className="text-xs text-slate-500">数据库 ID {complaint.tcldbid}</div></td><td className="px-4 py-3"><div>{complaint.fname}</div><div className="text-xs text-slate-500">数据库 ID {complaint.fcldbid}</div></td><td className="px-4 py-3 text-slate-400">{complaint.message || "--"}</td><td className="px-4 py-3"><button className={smallDangerButtonClassName} type="button" onClick={() => void onDelete({ tcldbid: complaint.tcldbid, fcldbid: complaint.fcldbid })}>移除</button></td></tr>; })}</tbody></table>{!complaints.length ? <EmptyState label="当前没有投诉记录。" /> : null}</div></div>;
}
function MessagesView({ selectedServerId, channels, clients, form, status, messages, setForm, onSubmit }: { selectedServerId: number; channels: ChannelSummary[]; clients: ClientSummary[]; form: { targetMode: number; target: number; targets: number[]; message: string }; status: string | null; messages: MessageEntry[]; setForm: Dispatch<SetStateAction<{ targetMode: number; target: number; targets: number[]; message: string }>>; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; }) {
  const clientOptions = clients.filter((client) => !client.isQuery);
  const targetOptions = form.targetMode === 3 ? [{ id: selectedServerId, name: `Server #${selectedServerId}` }] : form.targetMode === 2 ? channels.map((channel) => ({ id: channel.id, name: channel.name })) : clientOptions.map((client) => ({ id: client.id, name: `${client.nickname} (#${client.id})` }));
  const conversations = useMemo(() => {
    const map = new Map<string, { key: string; targetMode: number; target: number; label: string; subtitle: string; unreadCount: number; lastTimestamp: string }>();
    const upsertConversation = (targetMode: number, target: number) => {
      if (target <= 0) return;
      const key = `${targetMode}:${target}`;
      if (map.has(key)) return;
      map.set(key, {
        key,
        targetMode,
        target,
        label: getMessageTargetLabel(targetMode, target, channels, clients, selectedServerId),
        subtitle: getConversationSubtitle(targetMode),
        unreadCount: 0,
        lastTimestamp: "",
      });
    };

    upsertConversation(3, selectedServerId);
    if (form.targetMode === 1) {
      if (form.targets.length === 1) upsertConversation(1, form.targets[0]);
    } else {
      upsertConversation(form.targetMode, form.target);
    }

    for (const entry of messages) {
      upsertConversation(entry.targetMode, entry.target);
      const key = `${entry.targetMode}:${entry.target}`;
      const current = map.get(key);
      if (!current) continue;
      current.unreadCount += entry.unread ? 1 : 0;
      if (!current.lastTimestamp || new Date(entry.timestamp).getTime() > new Date(current.lastTimestamp).getTime()) {
        current.lastTimestamp = entry.timestamp;
      }
    }

    return Array.from(map.values()).sort((left, right) => {
      if (!left.lastTimestamp && !right.lastTimestamp) return left.targetMode - right.targetMode;
      if (!left.lastTimestamp) return 1;
      if (!right.lastTimestamp) return -1;
      return new Date(right.lastTimestamp).getTime() - new Date(left.lastTimestamp).getTime();
    });
  }, [channels, clients, form.target, form.targetMode, form.targets, messages, selectedServerId]);
  const activeConversationKey = form.targetMode === 1 ? (form.targets.length === 1 ? `1:${form.targets[0]}` : "") : `${form.targetMode}:${form.target}`;
  const activeConversation = conversations.find((conversation) => conversation.key === activeConversationKey) ?? null;
  const visibleMessages = useMemo(() => {
    if (!activeConversation) return messages;
    return messages.filter((entry) => entry.targetMode === activeConversation.targetMode && entry.target === activeConversation.target);
  }, [activeConversation, messages]);

  return <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]"><form className="space-y-4" onSubmit={onSubmit}><div className="grid gap-3 md:grid-cols-2"><Input label="目标类型"><select className={inputClassName} value={form.targetMode} onChange={(event) => setForm((current) => ({ ...current, targetMode: Number(event.target.value), target: Number(event.target.value) === 3 ? selectedServerId : Number(event.target.value) === 2 ? channels[0]?.id ?? 0 : clientOptions[0]?.id ?? 0, targets: [] }))}><option value={3}>服务器</option><option value={2}>频道</option><option value={1}>私聊客户端</option></select></Input>{form.targetMode !== 1 ? <Input label="目标"><select className={inputClassName} value={form.target} onChange={(event) => setForm((current) => ({ ...current, target: Number(event.target.value) }))}>{targetOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Input> : <Input label="客户端列表"><select className={`${inputClassName} min-h-40`} multiple value={form.targets.map(String)} onChange={(event) => setForm((current) => ({ ...current, target: Number(event.target.selectedOptions[0]?.value ?? current.target), targets: Array.from(event.target.selectedOptions).map((item) => Number(item.value)) }))}>{targetOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Input>}</div><Input label="消息内容"><textarea className={`${inputClassName} min-h-36`} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="输入要发送的文本消息" /></Input><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">支持向服务器、频道，以及多个客户端批量发送私聊消息。右侧会话列表可快速切换目标，打开本页会自动清除当前服务器未读数。</p><button className={primaryButtonClassName} type="submit" disabled={(form.targetMode === 1 ? !form.targets.length : form.target <= 0) || !form.message.trim()}>发送消息</button></div>{status ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{status}</div> : null}</form><div className="grid gap-4"><div className="overflow-auto rounded-3xl border border-white/8"><div className="border-b border-white/8 px-4 py-3 text-sm text-slate-400">会话列表</div>{conversations.length ? <div className="max-h-64 space-y-2 p-3">{conversations.map((conversation) => <button key={conversation.key} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${conversation.key === activeConversationKey ? "border-cyan-400/30 bg-cyan-500/10" : "border-white/8 bg-white/[0.03] hover:bg-white/[0.05]"}`} type="button" onClick={() => setForm((current) => ({ ...current, targetMode: conversation.targetMode, target: conversation.target, targets: conversation.targetMode === 1 ? [conversation.target] : [] }))}><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium text-white">{conversation.label}</div><div className="mt-1 text-xs text-slate-500">{conversation.subtitle}</div></div><div className="text-right">{conversation.unreadCount > 0 ? <div className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500/15 px-2 py-0.5 text-xs text-rose-100">{conversation.unreadCount}</div> : null}<div className="mt-1 text-[11px] text-slate-500">{conversation.lastTimestamp ? formatMessageTime(conversation.lastTimestamp) : "无记录"}</div></div></div></button>)}</div> : <EmptyState label="当前服务器还没有消息记录。" />}</div><div className="overflow-auto rounded-3xl border border-white/8"><div className="border-b border-white/8 px-4 py-3 text-sm text-slate-400">{activeConversation ? `当前会话 / ${activeConversation.label}` : form.targetMode === 1 && form.targets.length > 1 ? `批量私聊 / ${form.targets.length} 个客户端` : "最近消息"}</div>{visibleMessages.length ? <div className="max-h-[34rem] space-y-3 p-4">{visibleMessages.map((entry) => <div key={entry.id} className={`rounded-2xl border px-4 py-3 ${entry.unread ? "border-rose-400/20 bg-rose-500/10" : "border-white/8 bg-white/[0.03]"}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm text-white"><span className={`rounded-full px-2 py-1 text-xs ${entry.direction === "incoming" ? "bg-cyan-400/15 text-cyan-100" : "bg-emerald-400/15 text-emerald-100"}`}>{entry.direction === "incoming" ? "收到" : "发出"}</span><span>{entry.senderName}</span><span className="text-xs text-slate-500">{describeMessageTarget(entry, channels, clients, selectedServerId)}</span></div><span className="text-xs text-slate-500">{formatMessageTime(entry.timestamp)}</span></div><div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{entry.message}</div></div>)}</div> : <EmptyState label={activeConversation ? "当前会话还没有消息记录。" : "当前服务器还没有消息记录。"} />}{form.targetMode === 1 && form.targets.length > 1 ? <div className="border-t border-white/8 px-4 py-3 text-sm text-slate-500">当前处于批量私聊模式，消息历史会按单个客户端分别归档显示。</div> : null}</div></div></div>;
}
function LogsView({ logs, limit, setLimit, loading, onRefresh }: { logs: LogEntry[]; limit: number; setLimit: Dispatch<SetStateAction<number>>; loading: boolean; onRefresh: () => Promise<void>; }) {
  const [search, setSearch] = useState("");
  const [timezone, setTimezone] = useState<"local" | "utc">("local");
  const [levels, setLevels] = useState({ debug: true, info: true, warning: true, error: true });
  const filteredLogs = useMemo(() => logs.filter((log) => {
    const level = log.level.toLowerCase();
    if ((level === "debug" && !levels.debug) || (level === "info" && !levels.info) || (level === "warning" && !levels.warning) || (level === "error" && !levels.error)) return false;
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return log.channel.toLowerCase().includes(keyword) || log.message.toLowerCase().includes(keyword) || log.level.toLowerCase().includes(keyword);
  }), [levels, logs, search]);

  return <div className="space-y-4"><div className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,auto))_1fr_auto]"><label className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200"><input checked={levels.debug} onChange={(event) => setLevels((current) => ({ ...current, debug: event.target.checked }))} type="checkbox" />调试</label><label className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200"><input checked={levels.info} onChange={(event) => setLevels((current) => ({ ...current, info: event.target.checked }))} type="checkbox" />信息</label><label className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200"><input checked={levels.warning} onChange={(event) => setLevels((current) => ({ ...current, warning: event.target.checked }))} type="checkbox" />警告</label><label className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200"><input checked={levels.error} onChange={(event) => setLevels((current) => ({ ...current, error: event.target.checked }))} type="checkbox" />错误</label><Input label="搜索"><input className={inputClassName} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按级别、频道或消息筛选" /></Input><div className="grid gap-3 sm:grid-cols-2"><Input label="时间"><select className={inputClassName} value={timezone} onChange={(event) => setTimezone(event.target.value as "local" | "utc")}><option value="local">本地时间</option><option value="utc">UTC</option></select></Input><Input label="加载条数"><select className={inputClassName} value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}><option value="120">120</option><option value="300">300</option><option value="600">600</option><option value="1000">1000</option></select></Input></div></div><div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300"><span>已加载 {logs.length} 条，筛选后 {filteredLogs.length} 条。</span><button className={smallSecondaryButtonClassName} type="button" onClick={() => void onRefresh()} disabled={loading}>{loading ? "加载中..." : "重新加载"}</button></div><div className="overflow-auto rounded-3xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-slate-950/85 text-slate-300"><tr><th className="px-4 py-3">时间</th><th className="px-4 py-3">级别</th><th className="px-4 py-3">频道</th><th className="px-4 py-3">消息</th></tr></thead><tbody>{filteredLogs.map((log, index) => <tr key={`${log.timestamp}-${index}`} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3 text-slate-400">{formatLogTime(log.timestamp, timezone)}</td><td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs ${getLogLevelClassName(log.level)}`}>{getLogLevelLabel(log.level)}</span></td><td className="px-4 py-3 text-slate-400">{log.channel || "--"}</td><td className="px-4 py-3 text-slate-300">{log.message}</td></tr>)}</tbody></table>{!filteredLogs.length ? <EmptyState label={loading ? "正在加载日志..." : "没有匹配的日志记录。"} /> : null}</div></div>;
}
function BansView({ bans, banForm, editingBanId, setBanForm, onCancelEdit, onDelete, onEdit, onSubmit }: { bans: BanEntry[]; banForm: BanFormState; editingBanId: number | null; setBanForm: Dispatch<SetStateAction<BanFormState>>; onCancelEdit: () => void; onDelete: (banId: number) => Promise<void>; onEdit: (ban: BanEntry) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; }) {
  return <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]"><form className="space-y-3" onSubmit={onSubmit}><h3 className="text-lg font-semibold text-white">{editingBanId === null ? "创建封禁" : `编辑封禁 #${editingBanId}`}</h3><Input label="IP"><input className={inputClassName} value={banForm.ip} onChange={(event) => setBanForm((current) => ({ ...current, ip: event.target.value }))} /></Input><Input label="名称"><input className={inputClassName} value={banForm.name} onChange={(event) => setBanForm((current) => ({ ...current, name: event.target.value }))} /></Input><Input label="UID"><input className={inputClassName} value={banForm.uid} onChange={(event) => setBanForm((current) => ({ ...current, uid: event.target.value }))} /></Input><Input label="原因"><input className={inputClassName} value={banForm.reason} onChange={(event) => setBanForm((current) => ({ ...current, reason: event.target.value }))} /></Input><Input label="时长（秒）"><input className={inputClassName} type="number" value={banForm.time} onChange={(event) => setBanForm((current) => ({ ...current, time: Number(event.target.value) }))} /></Input><div className="flex gap-2"><button className={primaryButtonClassName} type="submit" disabled={!banForm.reason.trim()}>保存封禁</button>{editingBanId !== null ? <button className={smallSecondaryButtonClassName} type="button" onClick={onCancelEdit}>取消</button> : null}</div></form><div className="overflow-auto rounded-3xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="bg-slate-950/85 text-slate-300"><tr><th className="px-4 py-3">目标</th><th className="px-4 py-3">原因</th><th className="px-4 py-3">时长</th><th className="px-4 py-3"></th></tr></thead><tbody>{bans.map((ban) => <tr key={ban.banid} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3"><div>{ban.name || ban.uid || ban.ip || `封禁 #${ban.banid}`}</div><div className="text-xs text-slate-500">{ban.ip || "--"}</div></td><td className="px-4 py-3 text-slate-400">{ban.reason || "--"}</td><td className="px-4 py-3 text-slate-400">{ban.duration || 0}s</td><td className="px-4 py-3"><div className="flex gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => onEdit(ban)}>编辑</button><button className={smallDangerButtonClassName} type="button" onClick={() => void onDelete(ban.banid)}>删除</button></div></td></tr>)}</tbody></table>{!bans.length ? <EmptyState label="当前没有封禁记录。" /> : null}</div></div>;
}

function TokensView({ meta, tokenForm, setTokenForm, createdToken, tokens, onDelete, onSubmit }: { meta: PermissionsMeta; tokenForm: { tokenType: number; tokenId1: number; tokenId2: number; description: string }; setTokenForm: Dispatch<SetStateAction<{ tokenType: number; tokenId1: number; tokenId2: number; description: string }>>; createdToken: string; tokens: TokenEntry[]; onDelete: (token: string) => Promise<void>; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; }) {
  const regularServerGroups = meta.serverGroups.filter((group) => group.type === 1);
  const regularChannelGroups = meta.channelGroups.filter((group) => group.type === 1);
  const groupOptions = tokenForm.tokenType === 1 ? regularChannelGroups : regularServerGroups;
  return <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]"><form className="space-y-3" onSubmit={onSubmit}><h3 className="text-lg font-semibold text-white">创建权限密钥</h3><Input label="类型"><select className={inputClassName} value={tokenForm.tokenType} onChange={(event) => setTokenForm((current) => ({ ...current, tokenType: Number(event.target.value), tokenId1: Number(event.target.value) === 1 ? regularChannelGroups[0]?.id ?? 0 : regularServerGroups[0]?.id ?? 0, tokenId2: Number(event.target.value) === 1 ? meta.channels[0]?.id ?? 0 : 0 }))}><option value={0}>服务器组</option><option value={1}>频道组</option></select></Input><Input label="组"><select className={inputClassName} value={tokenForm.tokenId1} onChange={(event) => setTokenForm((current) => ({ ...current, tokenId1: Number(event.target.value) }))}>{groupOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Input>{tokenForm.tokenType === 1 ? <Input label="频道"><select className={inputClassName} value={tokenForm.tokenId2} onChange={(event) => setTokenForm((current) => ({ ...current, tokenId2: Number(event.target.value) }))}>{meta.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Input> : null}<Input label="描述"><input className={inputClassName} value={tokenForm.description} onChange={(event) => setTokenForm((current) => ({ ...current, description: event.target.value }))} /></Input><button className={primaryButtonClassName} type="submit" disabled={tokenForm.tokenId1 <= 0}>创建密钥</button>{createdToken ? <div className="break-all rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{createdToken}</div> : null}</form><div className="overflow-auto rounded-3xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="bg-slate-950/85 text-slate-300"><tr><th className="px-4 py-3">密钥</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">描述</th><th className="px-4 py-3"></th></tr></thead><tbody>{tokens.map((token) => <tr key={token.token} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3"><div className="max-w-72 truncate">{token.token}</div></td><td className="px-4 py-3 text-slate-400">{token.tokenType === 1 ? "频道组" : "服务器组"}</td><td className="px-4 py-3 text-slate-400">{token.tokenDescription || "--"}</td><td className="px-4 py-3"><button className={smallDangerButtonClassName} type="button" onClick={() => void onDelete(token.token)}>删除</button></td></tr>)}</tbody></table>{!tokens.length ? <EmptyState label="当前没有权限密钥。" /> : null}</div></div>;
}

function PermissionsView({ meta, scope, setScope, targetId, setTargetId, channelClientChannelId, setChannelClientChannelId, rows, filter, setFilter, grantedOnly, setGrantedOnly, editing, setEditing, onDelete, onSubmit }: { meta: PermissionsMeta; scope: PermissionScope; setScope: Dispatch<SetStateAction<PermissionScope>>; targetId: number; setTargetId: Dispatch<SetStateAction<number>>; channelClientChannelId: number; setChannelClientChannelId: Dispatch<SetStateAction<number>>; rows: PermissionEntry[]; filter: string; setFilter: Dispatch<SetStateAction<string>>; grantedOnly: boolean; setGrantedOnly: Dispatch<SetStateAction<boolean>>; editing: PermissionEntry | null; setEditing: Dispatch<SetStateAction<PermissionEntry | null>>; onDelete: (permid: number) => Promise<void>; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; }) {
  const targets = getTargetOptions(scope, meta);
  return <><div className="space-y-4"><div className={`grid gap-3 ${scope === "channel-client" ? "md:grid-cols-[180px_1fr_1fr_220px]" : "md:grid-cols-[180px_1fr_220px]"}`}><Input label="范围"><select className={inputClassName} value={scope} onChange={(event) => setScope(event.target.value as PermissionScope)}><option value="server-group">服务器组</option><option value="channel-group">频道组</option><option value="channel">频道</option><option value="client">客户端</option><option value="channel-client">频道客户端</option></select></Input>{scope === "channel-client" ? <Input label="频道"><select className={inputClassName} value={channelClientChannelId} onChange={(event) => setChannelClientChannelId(Number(event.target.value))}>{meta.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Input> : null}<Input label={scope === "channel-client" ? "客户端数据库" : "目标"}><select className={inputClassName} value={targetId} onChange={(event) => setTargetId(Number(event.target.value))}>{targets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Input><Input label="筛选"><input className={inputClassName} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="权限名 / 描述" /></Input></div>{scope === "channel-client" ? <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">频道客户端权限仅支持设置权限值，作用于特定频道下的指定客户端数据库账号。</div> : null}<label className="inline-flex items-center gap-2 text-sm text-slate-300"><input checked={grantedOnly} onChange={(event) => setGrantedOnly(event.target.checked)} type="checkbox" />仅显示已授予</label><div className="overflow-auto rounded-3xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="bg-slate-950/85 text-slate-300"><tr><th className="px-4 py-3">权限</th><th className="px-4 py-3">值</th><th className="px-4 py-3">跳过</th><th className="px-4 py-3">取反</th><th className="px-4 py-3"></th></tr></thead><tbody>{rows.map((row) => <tr key={row.permid} className="border-t border-white/6 text-slate-200"><td className="px-4 py-3"><div>{row.permname}</div><div className="text-xs text-slate-500">{row.permdesc || "--"}</div></td><td className="px-4 py-3 text-slate-400">{row.permvalue ?? "--"}</td><td className="px-4 py-3 text-slate-400">{scope === "channel-client" ? "--" : row.permskip ?? "--"}</td><td className="px-4 py-3 text-slate-400">{scope === "channel-client" ? "--" : row.permnegated ?? "--"}</td><td className="px-4 py-3"><div className="flex gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setEditing({ permid: row.permid, permname: row.permname, permdesc: row.permdesc, permvalue: row.permvalue ?? 0, permskip: row.permskip ?? 0, permnegated: row.permnegated ?? 0 })}>编辑</button>{row.permvalue !== null ? <button className={smallDangerButtonClassName} type="button" onClick={() => void onDelete(row.permid)}>删除</button> : null}</div></td></tr>)}</tbody></table>{!rows.length ? <EmptyState label="当前没有权限记录。" /> : null}</div></div><ModalFrame open={!!editing} title={editing ? editing.permname : "编辑权限"} onClose={() => setEditing(null)}>{editing ? <form className="space-y-4" onSubmit={onSubmit}><Input label="值"><input className={inputClassName} type="number" value={editing.permvalue ?? 0} onChange={(event) => setEditing((current) => current ? { ...current, permvalue: Number(event.target.value) } : current)} /></Input>{scope !== "channel-client" ? <Input label="跳过"><input className={inputClassName} type="number" value={editing.permskip ?? 0} onChange={(event) => setEditing((current) => current ? { ...current, permskip: Number(event.target.value) } : current)} /></Input> : null}{scope !== "channel-client" ? <Input label="取反"><select className={inputClassName} value={editing.permnegated ?? 0} onChange={(event) => setEditing((current) => current ? { ...current, permnegated: Number(event.target.value) } : current)}><option value={0}>否</option><option value={1}>是</option></select></Input> : null}<div className="flex justify-end gap-2"><button className={smallSecondaryButtonClassName} type="button" onClick={() => setEditing(null)}>取消</button><button className={primaryButtonClassName} type="submit">保存</button></div></form> : null}</ModalFrame></>;
}

function FilesView(props: { channels: ChannelSummary[]; files: FileEntry[]; currentPath: string; selectedChannelId: number; uploading: boolean; uploadQueue: UploadQueueItem[]; onRefresh: () => void; onSelectChannel: (channelId: number) => void; onNavigate: (folderPath: string) => void; onUpload: (files: FileList | null) => Promise<void>; onRetry: (item: UploadQueueItem) => Promise<void>; onRemove: (id: string) => void; }) {
  return <FileTransferPanel {...props} />;
}

function ModalFrame({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4"><div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-slate-950 p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-4"><h3 className="text-lg font-semibold text-white">{title}</h3><button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10" type="button" onClick={onClose}>关闭</button></div>{children}</div></div>;
}

function getTargetOptions(scope: PermissionScope, meta: PermissionsMeta) {
  if (scope === "server-group") return meta.serverGroups;
  if (scope === "channel-group") return meta.channelGroups;
  if (scope === "channel") return meta.channels;
  if (scope === "channel-client") return meta.clients.map((client) => ({ id: client.cldbid, name: `${client.clientNickname} (${client.cldbid})` }));
  return meta.clients.map((client) => ({ id: client.cldbid, name: `${client.clientNickname} (${client.cldbid})` }));
}

function describeMessageTarget(entry: MessageEntry, channels: ChannelSummary[], clients: ClientSummary[], selectedServerId: number) {
  if (entry.targetMode === 3) return `服务器 #${selectedServerId}`;
  if (entry.targetMode === 2) return channels.find((channel) => channel.id === entry.target)?.name ?? `频道 #${entry.target}`;
  const client = clients.find((item) => item.id === entry.target);
  return client ? `私聊 ${client.nickname}` : `私聊客户端 #${entry.target}`;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function getConversationSubtitle(targetMode: number) {
  if (targetMode === 3) return "服务器会话";
  if (targetMode === 2) return "频道会话";
  return "私聊会话";
}

function getMessageTargetLabel(targetMode: number, target: number, channels: ChannelSummary[], clients: ClientSummary[], selectedServerId: number) {
  if (targetMode === 3) return `服务器 #${selectedServerId}`;
  if (targetMode === 2) return channels.find((channel) => channel.id === target)?.name ?? `频道 #${target}`;
  const client = clients.find((item) => item.id === target);
  return client ? client.nickname : `客户端 #${target}`;
}

function formatLogTime(value: string, timezone: "local" | "utc") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: timezone === "utc" ? "UTC" : undefined }).format(date);
}

function getLogLevelLabel(level: string) {
  const labels: Record<string, string> = { debug: "调试", info: "信息", warning: "警告", error: "错误" };
  return labels[level.toLowerCase()] ?? level;
}

function getLogLevelClassName(level: string) {
  const palette: Record<string, string> = { debug: "border-sky-400/30 bg-sky-400/10 text-sky-200", info: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200", warning: "border-amber-400/30 bg-amber-400/10 text-amber-200", error: "border-rose-400/30 bg-rose-500/10 text-rose-200" };
  return palette[level.toLowerCase()] ?? "border-white/10 bg-white/5 text-slate-200";
}

function Input({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-sm text-slate-300">{label}</span>{children}</label>; }
function EmptyState({ label }: { label: string }) { return <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">{label}</div>; }

const inputClassName = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-400/20";
const primaryButtonClassName = "inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60";
const smallSecondaryButtonClassName = "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100";
const smallDangerButtonClassName = "inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100";





































