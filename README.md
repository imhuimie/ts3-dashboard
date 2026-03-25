# TS3 Dashboard

`TS3 Dashboard` 是一个基于 Go 后端与 Next.js 16 前端实现的 TeamSpeak 3 Web 管理面板，用于通过 ServerQuery 管理虚拟服务器、频道、客户端、权限、文件、消息、日志及常用运维动作。

当前仓库中的 `ts3-dashboard` 已完成对旧版 `ts3-manager` 核心管理功能的迁移，整体采用前后端分离结构：

- 后端：Go，负责维护 ServerQuery 会话、执行业务命令、暴露 HTTP API 与 SSE 事件流
- 前端：Next.js 16 + React 19，负责连接页、概览页与各管理标签页
- 会话：基于 HttpOnly Cookie + 内存 Session Store
- 实时性：通过 Server-Sent Events 接收 TeamSpeak 事件并驱动 UI 刷新

## 功能概览

### 已覆盖的主要能力

- ServerQuery 连接、断开、会话恢复
- 虚拟服务器列表、切换、创建、编辑、启动、停止、删除
- 概览面板、Server Viewer、实时事件流
- 文本消息管理与未读提醒
- 服务器日志查看、筛选、搜索
- 频道管理、Spacer 频道创建
- 客户端管理、踢出、移动、封禁、Poke、数据库账号删除
- 服务器组 / 频道组管理、复制、成员管理
- 权限管理
  - 服务器组权限
  - 频道组权限
  - 频道权限
  - 客户端权限
  - 频道客户端权限
- Ban 管理
- 投诉管理
- Privilege Key 管理
- API Key 管理
- ServerQuery Console
- 快照创建与恢复
- 文件浏览、上传、下载、删除、重命名、创建目录
- TeamSpeak 版本更新提示

## 项目结构

```text
ts3-dashboard/
├─ backend/                  # Go 后端
│  ├─ cmd/server/            # 后端启动入口
│  └─ internal/
│     ├─ config/             # 配置加载
│     ├─ httpapi/            # HTTP API / SSE
│     ├─ session/            # 内存会话存储
│     └─ ts3/                # TeamSpeak Query 客户端与业务实现
├─ web/                      # Next.js 前端
│  ├─ app/                   # App Router 入口
│  ├─ components/            # 页面与管理组件
│  └─ lib/                   # API 封装与类型定义
└─ README.md
```

## 技术栈

- Go 1.25
- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS 4
- Recharts
- Lucide React

## 运行要求

### 基础依赖

- Go 1.25 或兼容版本
- Node.js 20+ 与 npm
- 可访问的 TeamSpeak 3 ServerQuery 服务

### TeamSpeak 侧要求

- 已开启 ServerQuery
- 已知查询地址、查询端口、用户名、密码
- 运行账号具备足够管理权限，否则部分操作会被 TS3 拒绝

## 快速开始

### 1. 启动后端

```powershell
Set-Location "D:/emper0r/code/teamspeak/ts3-dashboard/backend"
go run "./cmd/server"
```

默认监听地址为 `:8080`。

### 2. 启动前端

```powershell
Set-Location "D:/emper0r/code/teamspeak/ts3-dashboard/web"
npm install
npm run dev
```

默认前端地址为 `http://localhost:3000`。

### 3. 打开页面

访问：

```text
http://localhost:3000
```

页面首次打开后，输入 TeamSpeak ServerQuery 连接信息即可建立管理会话。

## 环境变量

### 后端环境变量

后端配置定义见 `backend/internal/config/config.go`。

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `TS3_DASHBOARD_ADDR` | `:8080` | 后端监听地址 |
| `TS3_DASHBOARD_FRONTEND_ORIGIN` | `http://localhost:3000` | 允许跨域访问的前端来源，影响 CORS 与 Cookie |
| `TS3_DASHBOARD_COOKIE_NAME` | `ts3_dashboard_session` | 会话 Cookie 名称 |
| `TS3_DASHBOARD_COOKIE_SECURE` | `false` | 是否仅在 HTTPS 下发送 Cookie |
| `TS3_DASHBOARD_SESSION_TTL` | `12h` | 会话过期时间，支持 Go Duration 格式 |

示例：

```powershell
$env:TS3_DASHBOARD_ADDR=":8080"
$env:TS3_DASHBOARD_FRONTEND_ORIGIN="http://localhost:3000"
$env:TS3_DASHBOARD_COOKIE_SECURE="false"
$env:TS3_DASHBOARD_SESSION_TTL="12h"
go run "./cmd/server"
```

### 前端环境变量

前端通过 `web/lib/api.ts` 中的 `NEXT_PUBLIC_TS3_API_BASE_URL` 访问后端 API。

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `NEXT_PUBLIC_TS3_API_BASE_URL` | `http://localhost:8080/api` | 前端请求后端 API 的基地址 |

示例：

```powershell
$env:NEXT_PUBLIC_TS3_API_BASE_URL="http://localhost:8080/api"
npm run dev
```

## 本地开发建议

### 推荐启动顺序

1. 启动后端
2. 启动前端
3. 打开浏览器访问前端地址
4. 使用真实 ServerQuery 账号连接目标 TS3 服务

### 常用开发命令

后端编译检查：

```powershell
Set-Location "D:/emper0r/code/teamspeak/ts3-dashboard/backend"
go build ./...
```

前端类型检查：

```powershell
Set-Location "D:/emper0r/code/teamspeak/ts3-dashboard/web"
cmd /c "npx.cmd tsc --noEmit"
```

前端生产构建：

```powershell
Set-Location "D:/emper0r/code/teamspeak/ts3-dashboard/web"
npm run build
```

后端可执行文件构建：

```powershell
Set-Location "D:/emper0r/code/teamspeak/ts3-dashboard/backend"
go build -o "ts3-dashboard-backend.exe" "./cmd/server"
```

## 生产部署

### 部署方式

当前项目是前后端分离结构，常见部署方式有两种：

- 前端与后端分开部署，通过反向代理统一域名
- 前端静态/SSR 服务与后端 API 分别运行，通过 CORS + Cookie 协同

### 生产环境建议

- 前端与后端尽量放在同一主域名体系下，降低跨域 Cookie 问题
- 使用 HTTPS 时，将 `TS3_DASHBOARD_COOKIE_SECURE=true`
- 确保 `TS3_DASHBOARD_FRONTEND_ORIGIN` 与实际前端访问地址一致
- 将 `NEXT_PUBLIC_TS3_API_BASE_URL` 指向实际后端 `/api` 地址

### 反向代理注意事项

- 必须保留 Cookie
- 必须允许 SSE 长连接，不要错误缓存 `/api/events`
- 上传下载接口应允许较大的请求体和较长超时

## 使用流程

### 首次连接

1. 打开前端页面
2. 填写 Host、Query Port、Username、Password、Nickname
3. 提交连接
4. 后端建立 ServerQuery 会话并写入 HttpOnly Cookie
5. 页面进入主仪表板

### 进入主面板后

可在顶部完成：

- 切换虚拟服务器
- 启动 / 停止 / 删除当前虚拟服务器
- 刷新状态
- 断开连接

可在管理区域完成：

- 服务器工具
- 频道管理
- 客户端操作
- 组管理
- 消息发送
- 服务器日志
- 投诉管理
- 封禁管理
- 权限密钥
- API Keys
- 查询控制台
- 权限管理
- 文件传输

## API 与会话模型

### 会话模型

- 登录不是项目自身账号体系，而是直接使用 TeamSpeak ServerQuery 账号
- 后端连接成功后，在内存中保存 `ts3.Client`
- 浏览器通过 HttpOnly Cookie 维持会话
- 会话到期或主动断开后，后端会关闭对应 Query 连接

### 核心接口分组

| 分组 | 示例接口 |
|---|---|
| 会话 | `/api/session`、`/api/session/connect`、`/api/session/select-server` |
| 概览 | `/api/dashboard`、`/api/viewer`、`/api/logs`、`/api/events` |
| 服务器 | `/api/servers`、`/api/servers/{id}/actions`、`/api/servers/create`、`/api/server-admin` |
| 客户端 | `/api/clients`、`/api/clients/{id}`、`/api/client-database/{id}` |
| 频道 | `/api/channels`、`/api/channels/{id}` |
| 组与权限 | `/api/server-groups`、`/api/channel-groups`、`/api/permissions` |
| 文件 | `/api/file-channels`、`/api/files`、`/api/files/upload`、`/api/files/download` |
| 运维工具 | `/api/bans`、`/api/tokens`、`/api/api-keys`、`/api/complaints`、`/api/console` |

## 已知限制

### 1. 当前仅支持原生 ServerQuery Raw 协议

后端连接逻辑当前只接受 `raw` 协议，不支持 SSH 等其他接入方式。

### 2. 会话存储为内存实现

- 服务重启后，所有会话会丢失
- 当前不支持多实例共享会话

### 3. 不包含独立数据库

项目不依赖数据库，所有状态主要来自：

- 当前内存会话
- 实时从 TeamSpeak ServerQuery 拉取的数据

### 4. 不负责安装或管理 TeamSpeak Server 本身

本项目是管理面板，不包含 TeamSpeak Server 安装、升级、备份策略与系统服务编排能力。

## 故障排查

### 页面能打开，但无法连接后端

检查：

- 后端是否已经启动
- `NEXT_PUBLIC_TS3_API_BASE_URL` 是否正确
- 浏览器控制台是否出现跨域错误
- `TS3_DASHBOARD_FRONTEND_ORIGIN` 是否与前端真实地址一致

### 连接成功后接口持续返回 `session unauthorized`

检查：

- 浏览器是否成功接收 Cookie
- 前后端是否跨域且 Cookie 被浏览器阻止
- 是否错误启用了 `TS3_DASHBOARD_COOKIE_SECURE=true` 但当前不是 HTTPS
- 会话是否已经过期

### 能连后端，但连不上 TeamSpeak

检查：

- TS3 主机地址和 Query 端口是否正确
- 防火墙是否放行 Query 端口
- 账号密码是否正确
- Query 账号是否被限流或封禁

### 实时事件不更新

检查：

- `/api/events` 是否被代理层缓存或断开
- 反向代理是否支持 SSE 长连接
- 浏览器网络面板中 `EventSource` 是否持续保持连接

### 文件上传失败

检查：

- 目标频道是否支持文件操作
- Query 账号是否有文件权限
- 代理层是否限制上传体积或超时

## 验证建议

如需确认迁移质量，建议至少执行以下检查：

- `go build ./...`
- `cmd /c "npx.cmd tsc --noEmit"`
- 使用真实 TS3 服务器回归关键功能
  - 连接 / 断开
  - 切换服务器
  - 频道与客户端管理
  - 权限、组、封禁、投诉
  - 文件上传下载
  - 消息与实时事件

## 后续改进方向

- 增加持久化会话存储
- 增加容器化部署方案
- 增加统一生产配置样例
- 增加自动化测试与端到端回归
- 增加多实例部署支持

## 相关文件

- 后端入口：`backend/cmd/server/main.go`
- 后端配置：`backend/internal/config/config.go`
- 后端路由：`backend/internal/httpapi/server.go`
- 会话存储：`backend/internal/session/store.go`
- 前端 API 封装：`web/lib/api.ts`
- 前端首页：`web/app/page.tsx`
- 主仪表板：`web/components/dashboard-shell.tsx`

