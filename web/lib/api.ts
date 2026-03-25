import type {
  APIKeyEntry,
  BanEntry,
  ChannelSummary,
  ClientDetail,
  ClientDbEntry,
  ClientSummary,
  ComplaintEntry,
  CreateServerResponse,
  DashboardData,
  FileEntry,
  PermissionEntry,
  PermissionTarget,
  PermissionsMeta,
  PermissionScope,
  SessionState,
  TeamSpeakVersionsResponse,
  TokenEntry,
  ViewerData,
  VirtualServerAdminInfo,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_TS3_API_BASE_URL ?? "http://localhost:8080/api";

type RequestOptions = RequestInit & { raw?: boolean };

function jsonBody(payload: unknown) {
  return JSON.stringify(payload, (_key, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) return 0;
    return value;
  });
}

function buildPath(pathname: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(pathname, "http://ts3-dashboard.local");
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers ?? undefined);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `请求失败：${response.status}`);
  }

  if (response.status === 204) return null as T;
  if (options.raw) return undefined as T;
  return response.json() as Promise<T>;
}

function getPermissionsPath(scope: PermissionScope, targetId: number, channelId?: number) {
  return buildPath("/permissions", { scope, targetId, channelId });
}

function uploadFileWithProgress(cid: number, folderPath: string, file: File, overwrite = true, onProgress?: (progress: number) => void) {
  return new Promise<{ ok: boolean }>((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${buildPath("/files/upload", { cid, path: folderPath, overwrite: overwrite ? 1 : 0 })}`, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onerror = () => {
      reject(new Error("网络请求失败，请检查连接。"));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText || '{"ok":true}') as { ok: boolean });
        return;
      }

      try {
        const payload = JSON.parse(xhr.responseText) as { error?: string };
        reject(new Error(payload.error ?? `请求失败：${xhr.status}`));
      } catch {
        reject(new Error(`请求失败：${xhr.status}`));
      }
    };

    xhr.send(formData);
  });
}

export const api = {
  getSession: () => request<SessionState | null>("/session"),
  connect: (payload: { host: string; queryPort: number; username: string; password: string; nickname: string; protocol: string }) => request<SessionState>("/session/connect", { method: "POST", body: JSON.stringify(payload) }),
  disconnect: () => request<{ ok: boolean }>("/session", { method: "DELETE" }),
  selectServer: (serverId: number) => request<SessionState>("/session/select-server", { method: "POST", body: JSON.stringify({ serverId }) }),
  serverAction: (serverId: number, payload: { action: "start" | "stop" | "delete"; reason?: string }) => request<SessionState>(`/servers/${serverId}/actions`, { method: "POST", body: JSON.stringify(payload) }),
  getDashboard: () => request<DashboardData>("/dashboard"),
  getViewer: () => request<ViewerData>("/viewer"),
  getClients: async () => (await request<{ clients: ClientSummary[] }>("/clients")).clients,
  getClientDetail: (clientId: number) => request<ClientDetail>(`/clients/${clientId}`),
  updateClient: (clientId: number, payload: { description: string; serverGroupIds: number[] }) => request<{ ok: boolean }>(`/clients/${clientId}`, { method: "PUT", body: JSON.stringify(payload) }),
  kickClient: (clientId: number, payload: { reason: string; mode: "server" | "channel" }) => request<{ ok: boolean }>(`/clients/${clientId}/kick`, { method: "POST", body: JSON.stringify(payload) }),
  moveClient: (clientId: number, payload: { targetChannelId: number; channelPassword?: string }) => request<{ ok: boolean }>(`/clients/${clientId}/move`, { method: "POST", body: JSON.stringify(payload) }),
  banClient: (clientId: number, payload: { reason: string; time: number }) => request<{ ok: boolean }>(`/clients/${clientId}/ban`, { method: "POST", body: JSON.stringify(payload) }),
  pokeClient: (clientId: number, payload: { message: string }) => request<{ ok: boolean }>(`/clients/${clientId}/poke`, { method: "POST", body: JSON.stringify(payload) }),
  deleteClientDatabase: (clientDbId: number) => request<{ ok: boolean }>(`/client-database/${clientDbId}`, { method: "DELETE" }),
  getChannels: async () => (await request<{ channels: ChannelSummary[] }>("/channels")).channels,
  createChannel: (payload: { name: string; parentId: number; topic: string; password: string; maxClients: number; type: string; orderAfterId?: number }) => request<{ ok: boolean; channelId: number }>("/channels", { method: "POST", body: jsonBody(payload) }),
  updateChannel: (channelId: number, payload: { name: string; parentId: number; topic: string; password: string; maxClients: number; type: string; orderAfterId?: number }) => request<{ ok: boolean }>(`/channels/${channelId}`, { method: "PUT", body: jsonBody(payload) }),
  deleteChannel: (channelId: number, force = true) => request<{ ok: boolean }>(buildPath(`/channels/${channelId}`, { force: force ? 1 : 0 }), { method: "DELETE" }),
  getServerGroups: async () => (await request<{ groups: PermissionTarget[] }>("/server-groups")).groups,
  createServerGroup: (payload: { name: string; type: number }) => request<{ ok: boolean; groupId: number }>("/server-groups", { method: "POST", body: JSON.stringify(payload) }),
  updateServerGroup: (groupId: number, payload: { name: string }) => request<{ ok: boolean }>(`/server-groups/${groupId}`, { method: "PUT", body: JSON.stringify(payload) }),
  copyServerGroup: (groupId: number, payload: { targetGroupId: number; name: string; type: number }) => request<{ ok: boolean }>(`/server-groups/${groupId}/copy`, { method: "POST", body: JSON.stringify(payload) }),
  deleteServerGroup: (groupId: number) => request<{ ok: boolean }>(`/server-groups/${groupId}`, { method: "DELETE" }),
  getServerGroupClients: async (groupId: number) => (await request<{ clients: ClientDbEntry[] }>(`/server-groups/${groupId}/clients`)).clients,
  addServerGroupClient: (groupId: number, clientDbId: number) => request<{ ok: boolean }>(`/server-groups/${groupId}/clients`, { method: "POST", body: JSON.stringify({ clientDbId }) }),
  removeServerGroupClient: (groupId: number, clientDbId: number) => request<{ ok: boolean }>(`/server-groups/${groupId}/clients/${clientDbId}`, { method: "DELETE" }),
  getChannelGroups: async () => (await request<{ groups: PermissionTarget[] }>("/channel-groups")).groups,
  createChannelGroup: (payload: { name: string; type: number }) => request<{ ok: boolean; groupId: number }>("/channel-groups", { method: "POST", body: JSON.stringify(payload) }),
  updateChannelGroup: (groupId: number, payload: { name: string }) => request<{ ok: boolean }>(`/channel-groups/${groupId}`, { method: "PUT", body: JSON.stringify(payload) }),
  copyChannelGroup: (groupId: number, payload: { targetGroupId: number; name: string; type: number }) => request<{ ok: boolean }>(`/channel-groups/${groupId}/copy`, { method: "POST", body: JSON.stringify(payload) }),
  deleteChannelGroup: (groupId: number) => request<{ ok: boolean }>(`/channel-groups/${groupId}`, { method: "DELETE" }),
  getChannelGroupClients: async (groupId: number, channelId: number) => (await request<{ clients: ClientDbEntry[] }>(buildPath(`/channel-groups/${groupId}/clients`, { channelId }))).clients,
  addChannelGroupClient: (groupId: number, payload: { clientDbId: number; channelId: number }) => request<{ ok: boolean }>(`/channel-groups/${groupId}/clients`, { method: "POST", body: JSON.stringify(payload) }),
  removeChannelGroupClient: (groupId: number, payload: { clientDbId: number; channelId: number }) => request<{ ok: boolean }>(`/channel-groups/${groupId}/clients`, { method: "DELETE", body: JSON.stringify(payload) }),
  getLogs: async (limit = 120) => (await request<{ logs: DashboardData["logs"] }>(buildPath("/logs", { limit }))).logs,
  getBans: async () => (await request<{ bans: BanEntry[] }>("/bans")).bans,
  createBan: (payload: { ip?: string; name?: string; uid?: string; reason: string; time: number }) => request<{ ok: boolean }>("/bans", { method: "POST", body: JSON.stringify(payload) }),
  updateBan: (banId: number, payload: { ip?: string; name?: string; uid?: string; reason: string; time: number }) => request<{ ok: boolean }>(`/bans/${banId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteBan: (banId: number) => request<{ ok: boolean }>(`/bans/${banId}`, { method: "DELETE" }),
  getTokens: async () => (await request<{ tokens: TokenEntry[] }>("/tokens")).tokens,
  createToken: (payload: { tokenType: number; tokenId1: number; tokenId2: number; description: string }) => request<{ token: string }>("/tokens", { method: "POST", body: JSON.stringify(payload) }),
  deleteToken: (token: string) => request<{ ok: boolean }>(`/tokens/${encodeURIComponent(token)}`, { method: "DELETE" }),
  getApiKeys: async () => (await request<{ apiKeys: APIKeyEntry[] }>("/api-keys")).apiKeys,
  createApiKey: (payload: { scope: string; clientDbId?: number; lifetime?: number }) => request<{ apiKey: string }>("/api-keys", { method: "POST", body: JSON.stringify(payload) }),
  deleteApiKey: (id: number) => request<{ ok: boolean }>(`/api-keys/${id}`, { method: "DELETE" }),
  executeConsole: async (input: string) => (await request<{ records: Record<string, string>[] }>("/console", { method: "POST", body: JSON.stringify({ input }) })).records,
  getComplaints: async () => (await request<{ complaints: ComplaintEntry[] }>("/complaints")).complaints,
  deleteComplaint: (payload: { tcldbid: number; fcldbid: number }) => request<{ ok: boolean }>("/complaints", { method: "DELETE", body: JSON.stringify(payload) }),
  sendTextMessage: (payload: { targetMode: number; target: number; message: string }) => request<{ ok: boolean }>("/messages", { method: "POST", body: JSON.stringify(payload) }),
  getServerAdmin: () => request<VirtualServerAdminInfo>("/server-admin"),
  updateServerAdmin: (payload: VirtualServerAdminInfo) => request<{ ok: boolean }>("/server-admin", { method: "PUT", body: jsonBody(payload) }),
  createServer: (payload: { name: string; port: number; maxClients: number }) => request<CreateServerResponse>("/servers/create", { method: "POST", body: jsonBody(payload) }),
  createServerSnapshot: () => request<{ snapshot: string }>("/server-snapshot"),
  deployServerSnapshot: (payload: { snapshot: string }) => request<{ ok: boolean }>("/server-snapshot", { method: "POST", body: JSON.stringify(payload) }),
  getPermissionsMeta: () => request<PermissionsMeta>("/permissions/meta"),
  getPermissions: async (scope: PermissionScope, targetId: number, channelId?: number) => (await request<{ permissions: PermissionEntry[] }>(getPermissionsPath(scope, targetId, channelId))).permissions,
  savePermission: (payload: { scope: PermissionScope; targetId: number; channelId?: number; permid: number; permvalue?: number | null; permskip?: number | null; permnegated?: number | null }) => request<{ ok: boolean }>("/permissions", { method: "POST", body: JSON.stringify(payload) }),
  deletePermission: (scope: PermissionScope, targetId: number, permid: number, channelId?: number) => request<{ ok: boolean }>(`${getPermissionsPath(scope, targetId, channelId)}&permid=${permid}`, { method: "DELETE" }),
  getTeamSpeakVersions: () => request<TeamSpeakVersionsResponse>("/teamspeak-versions"),
  getFileChannels: async () => (await request<{ channels: ChannelSummary[] }>("/file-channels")).channels,
  getFiles: async (cid: number, folderPath = "/") => (await request<{ items: FileEntry[] }>(buildPath("/files", { cid, path: folderPath }))).items,
  uploadFile: (cid: number, folderPath: string, file: File, overwrite = true, onProgress?: (progress: number) => void) => uploadFileWithProgress(cid, folderPath, file, overwrite, onProgress),
  deleteFile: (cid: number, filePath: string) => request<{ ok: boolean }>("/files/delete", { method: "DELETE", body: JSON.stringify({ cid, path: filePath }) }),
  renameFile: (cid: number, oldPath: string, newPath: string) => request<{ ok: boolean }>("/files/rename", { method: "POST", body: JSON.stringify({ cid, oldPath, newPath }) }),
  createDirectory: (cid: number, dirPath: string) => request<{ ok: boolean }>("/files/directories", { method: "POST", body: JSON.stringify({ cid, path: dirPath }) }),
  getFileDownloadUrl: (cid: number, filePath: string) => `${API_BASE}${buildPath("/files/download", { cid, path: filePath })}`,
  getAvatarUrl: (clientDatabaseId: number) => `${API_BASE}/avatars/${clientDatabaseId}`,
  getEventsUrl: () => `${API_BASE}/events`,
};
