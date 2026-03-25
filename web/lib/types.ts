export type ServerSummary = {
  id: number;
  port: number;
  name: string;
  status: string;
  clientsOnline: number;
  maxClients: number;
  uid: string;
};

export type QueryUser = {
  clientId: number;
  channelId: number;
  databaseId: number;
  nickname: string;
  loginName: string;
  uniqueId: string;
  virtualServerId: number;
  virtualPort: number;
  serverStatus: string;
  serverUniqueId: string;
};

export type SessionState = {
  address: string;
  selectedServerId: number;
  servers: ServerSummary[];
  queryUser?: QueryUser;
};

export type ServerInfo = {
  id: number;
  name: string;
  status: string;
  port: number;
  clientsOnline: number;
  maxClients: number;
  channelsOnline: number;
  uptimeSeconds: number;
  queryConnections: number;
  version: string;
  platform: string;
  hostMessage: string;
};

export type VirtualServerAdminInfo = {
  name: string;
  namePhonetic: string;
  password: string;
  maxClients: number;
  reservedSlots: number;
  welcomeMessage: string;
  hostMessage: string;
  hostMessageMode: number;
  hostBannerGfxUrl?: string;
  hostBannerUrl?: string;
  hostBannerGfxInterval?: number;
  hostBannerMode?: number;
  hostButtonTooltip?: string;
  hostButtonUrl?: string;
  hostButtonGfxUrl?: string;
  maxUploadTotalBandwidth?: number;
  uploadQuota?: number;
  maxDownloadTotalBandwidth?: number;
  downloadQuota?: number;
  antifloodPointsTickReduce?: number;
  antifloodPointsNeededCommandBlock?: number;
  antifloodPointsNeededIpBlock?: number;
  neededIdentitySecurityLevel?: number;
  codecEncryptionMode?: number;
  defaultServerGroup: number;
  defaultChannelGroup: number;
  defaultChannelAdminGroup: number;
  complainAutobanCount?: number;
  complainAutobanTime?: number;
  complainRemoveTime?: number;
  minClientsInChannelBeforeForcedSilence?: number;
  prioritySpeakerDimmModificator?: number;
  channelTempDeleteDelayDefault?: number;
  weblistEnabled?: number;
  logClient?: number;
  logQuery?: number;
  logChannel?: number;
  logPermissions?: number;
  logServer?: number;
  logFileTransfer?: number;
};

export type CreateServerResponse = {
  serverId: number;
  token: string;
};
export type ClientSummary = {
  id: number;
  databaseId: number;
  channelId: number;
  nickname: string;
  uniqueId: string;
  platform: string;
  version: string;
  country: string;
  idleTime: number;
  inputMuted: boolean;
  outputMuted: boolean;
  away: boolean;
  channelCommander: boolean;
  isQuery: boolean;
};

export type ClientDetail = {
  id: number;
  databaseId: number;
  nickname: string;
  description: string;
  serverGroupIds: number[];
};

export type ClientDbEntry = {
  cldbid: number;
  clientNickname: string;
  clientUniqueIdentifier: string;
  clientCreated: number;
  clientLastconnected: number;
  clientTotalconnections: number;
  clientDescription: string;
  clientLastip: string;
};

export type ChannelSummary = {
  id: number;
  parentId: number;
  order: number;
  name: string;
  topic: string;
  totalClients: number;
  maxClients: number;
  neededTalkPower: number;
  isPermanent: boolean;
  isSemiPermanent: boolean;
  isDefault: boolean;
  hasPassword: boolean;
};

export type ViewerNode = {
  id: string;
  label: string;
  kind: "channel" | "client" | "query";
  meta?: string;
  children?: ViewerNode[];
};

export type ViewerData = {
  serverInfo: ServerInfo;
  queryUser: QueryUser;
  tree: ViewerNode[];
};

export type LogEntry = {
  timestamp: string;
  level: string;
  channel: string;
  serverId: number;
  message: string;
};

export type ChartPoint = {
  label: string;
  value: number;
};

export type DashboardData = {
  serverInfo: ServerInfo;
  queryUser: QueryUser;
  clientsOnline: ClientSummary[];
  logs: LogEntry[];
  connectionsByDay: ChartPoint[];
  logLevels: ChartPoint[];
  channelsByOccupancy: ChartPoint[];
};

export type BanEntry = {
  banid: number;
  ip: string;
  name: string;
  uid: string;
  reason: string;
  created: number;
  duration: number;
  invokerName: string;
};

export type TokenEntry = {
  token: string;
  tokenType: number;
  tokenId1: number;
  tokenId2: number;
  tokenDescription: string;
  tokenCreated: number;
};

export type APIKeyEntry = {
  id: number;
  cldbid: number;
  scope: string;
  createdAt: number;
  expiresAt: number;
};

export type ComplaintEntry = {
  tcldbid: number;
  tname: string;
  fcldbid: number;
  fname: string;
  message: string;
  timestamp: number;
};

export type PermissionEntry = {
  permid: number;
  permname: string;
  permdesc: string;
  permvalue: number | null;
  permskip: number | null;
  permnegated: number | null;
};

export type PermissionTarget = {
  id: number;
  name: string;
  type?: number;
};

export type PermissionsMeta = {
  catalog: PermissionEntry[];
  serverGroups: PermissionTarget[];
  channelGroups: PermissionTarget[];
  channels: PermissionTarget[];
  clients: ClientDbEntry[];
};

export type PermissionScope = "server-group" | "channel-group" | "channel" | "client" | "channel-client";

export type MessageEntry = {
  id: string;
  serverId: number;
  direction: "incoming" | "outgoing";
  targetMode: number;
  target: number;
  channelId: number;
  senderId: number | null;
  senderName: string;
  message: string;
  timestamp: string;
  unread: boolean;
};

export type TeamSpeakVersionsResponse = Record<string, Record<string, { version: string }>>;

export type FileEntry = {
  name: string;
  path: string;
  cid: number;
  type: number;
  size: number;
  datetime: number;
};

export type Ts3Event = {
  type: string;
  timestamp: string;
  payload: Record<string, string>;
};

export type UploadQueueItem = {
  id: string;
  fileName: string;
  size: number;
  status: "queued" | "uploading" | "success" | "error";
  progress: number;
  error: string | null;
  file: File;
};
