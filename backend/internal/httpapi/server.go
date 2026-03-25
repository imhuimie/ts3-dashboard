package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ts3-dashboard/backend/internal/config"
	"ts3-dashboard/backend/internal/session"
	"ts3-dashboard/backend/internal/ts3"
)

type Server struct {
	config config.Config
	store  *session.Store
	mux    *http.ServeMux
}

func NewServer(cfg config.Config, store *session.Store) *Server {
	server := &Server{
		config: cfg,
		store:  store,
		mux:    http.NewServeMux(),
	}

	server.routes()
	return server
}

func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if s.handleCORS(writer, request) {
			return
		}

		s.mux.ServeHTTP(writer, request)
	})
}

func (s *Server) routes() {
	s.mux.HandleFunc("/api/health", s.handleHealth)
	s.mux.HandleFunc("/api/session", s.handleSession)
	s.mux.HandleFunc("/api/session/connect", s.handleConnect)
	s.mux.HandleFunc("/api/session/select-server", s.withSession(s.handleSelectServer))
	s.mux.HandleFunc("/api/servers", s.withSession(s.handleServers))
	s.mux.HandleFunc("/api/servers/", s.withSession(s.handleServerByID))
	s.mux.HandleFunc("/api/dashboard", s.withSession(s.handleDashboard))
	s.mux.HandleFunc("/api/clients", s.withSession(s.handleClients))
	s.mux.HandleFunc("/api/clients/", s.withSession(s.routeClientAction))
	s.mux.HandleFunc("/api/client-database/", s.withSession(s.handleClientDatabaseByID))
	s.mux.HandleFunc("/api/server-admin", s.withSession(s.handleServerAdmin))
	s.mux.HandleFunc("/api/server-snapshot", s.withSession(s.handleServerSnapshot))
	s.mux.HandleFunc("/api/servers/create", s.withSession(s.handleServerCreate))
	s.mux.HandleFunc("/api/server-groups", s.withSession(s.handleServerGroups))
	s.mux.HandleFunc("/api/server-groups/", s.withSession(s.handleServerGroupByID))
	s.mux.HandleFunc("/api/channel-groups", s.withSession(s.handleChannelGroups))
	s.mux.HandleFunc("/api/channel-groups/", s.withSession(s.handleChannelGroupByID))
	s.mux.HandleFunc("/api/channels", s.withSession(s.handleChannels))
	s.mux.HandleFunc("/api/channels/", s.withSession(s.handleChannelByID))
	s.mux.HandleFunc("/api/viewer", s.withSession(s.handleViewer))
	s.mux.HandleFunc("/api/logs", s.withSession(s.handleLogs))
	s.mux.HandleFunc("/api/events", s.withSession(s.handleEvents))
	s.mux.HandleFunc("/api/file-channels", s.withSession(s.handleFileChannels))
	s.mux.HandleFunc("/api/files", s.withSession(s.handleFiles))
	s.mux.HandleFunc("/api/files/download", s.withSession(s.handleFileDownload))
	s.mux.HandleFunc("/api/files/upload", s.withSession(s.handleFileUpload))
	s.mux.HandleFunc("/api/files/delete", s.withSession(s.handleFileDelete))
	s.mux.HandleFunc("/api/files/rename", s.withSession(s.handleFileRename))
	s.mux.HandleFunc("/api/files/directories", s.withSession(s.handleCreateDirectory))
	s.mux.HandleFunc("/api/avatars/", s.withSession(s.handleAvatar))
	s.mux.HandleFunc("/api/bans", s.withSession(s.handleBans))
	s.mux.HandleFunc("/api/bans/", s.withSession(s.handleBanByID))
	s.mux.HandleFunc("/api/tokens", s.withSession(s.handleTokens))
	s.mux.HandleFunc("/api/tokens/", s.withSession(s.handleTokenByValue))
	s.mux.HandleFunc("/api/api-keys", s.withSession(s.handleAPIKeys))
	s.mux.HandleFunc("/api/api-keys/", s.withSession(s.handleAPIKeyByID))
	s.mux.HandleFunc("/api/complaints", s.withSession(s.handleComplaints))
	s.mux.HandleFunc("/api/messages", s.withSession(s.handleMessages))
	s.mux.HandleFunc("/api/console", s.withSession(s.handleConsole))
	s.mux.HandleFunc("/api/permissions/meta", s.withSession(s.handlePermissionsMeta))
	s.mux.HandleFunc("/api/permissions", s.withSession(s.handlePermissions))
	s.mux.HandleFunc("/api/teamspeak-versions", s.handleTeamSpeakVersions)
}

func (s *Server) routeClientAction(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch {
	case strings.HasSuffix(request.URL.Path, "/kick"):
		s.handleClientKick(writer, request, sess)
	case strings.HasSuffix(request.URL.Path, "/move"):
		s.handleClientMove(writer, request, sess)
	case strings.HasSuffix(request.URL.Path, "/ban"):
		s.handleClientBan(writer, request, sess)
	case strings.HasSuffix(request.URL.Path, "/poke"):
		s.handleClientPoke(writer, request, sess)
	default:
		s.handleClientByID(writer, request, sess)
	}
}

func (s *Server) handleHealth(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{
		"ok":      true,
		"service": "ts3-dashboard-backend",
		"time":    time.Now().UTC(),
	})
}

func (s *Server) handleConnect(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "unsupported method")
		return
	}

	var payload ts3.ConnectOptions
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid request body")
		return
	}

	startedAt := time.Now()
	log.Printf("connect: start host=%s port=%d protocol=%s user=%s nickname=%s", payload.Host, payload.QueryPort, payload.Protocol, payload.Username, payload.Nickname)

	ctx, cancel := context.WithTimeout(request.Context(), 30*time.Second)
	defer cancel()

	client, err := ts3.Connect(ctx, payload)
	if err != nil {
		log.Printf("connect: failed stage=connect duration=%s err=%v", time.Since(startedAt).Round(time.Millisecond), err)
		writeError(writer, statusForConnectError(err), mapError(err, "connect"))
		return
	}
	log.Printf("connect: stage=connect ok duration=%s", time.Since(startedAt).Round(time.Millisecond))

	servers, err := client.ServerList()
	if err != nil {
		_ = client.Close()
		log.Printf("connect: failed stage=server_list duration=%s err=%v", time.Since(startedAt).Round(time.Millisecond), err)
		writeError(writer, statusForConnectError(err), mapError(err, "server_list"))
		return
	}
	log.Printf("connect: stage=server_list ok duration=%s servers=%d", time.Since(startedAt).Round(time.Millisecond), len(servers))

	if len(servers) > 0 {
		if err := client.SelectServer(servers[0].ID); err != nil {
			_ = client.Close()
			log.Printf("connect: failed stage=select_server duration=%s server_id=%d err=%v", time.Since(startedAt).Round(time.Millisecond), servers[0].ID, err)
			writeError(writer, statusForConnectError(err), mapError(err, "select_server"))
			return
		}
		log.Printf("connect: stage=select_server ok duration=%s server_id=%d", time.Since(startedAt).Round(time.Millisecond), servers[0].ID)
		if err := client.UpdateNickname(payload.Nickname); err != nil {
			_ = client.Close()
			log.Printf("connect: failed stage=update_nickname duration=%s err=%v", time.Since(startedAt).Round(time.Millisecond), err)
			writeError(writer, statusForConnectError(err), mapError(err, "update_nickname"))
			return
		}
		if strings.TrimSpace(payload.Nickname) != "" {
			log.Printf("connect: stage=update_nickname ok duration=%s", time.Since(startedAt).Round(time.Millisecond))
		}
	}

	sess, err := s.store.Create(client)
	if err != nil {
		_ = client.Close()
		log.Printf("connect: failed stage=create_session duration=%s err=%v", time.Since(startedAt).Round(time.Millisecond), err)
		writeError(writer, http.StatusInternalServerError, "internal server error")
		return
	}

	http.SetCookie(writer, &http.Cookie{
		Name:     s.config.CookieName,
		Value:    sess.ID,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.config.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  sess.ExpiresAt,
	})

	state, err := client.SessionState()
	if err != nil {
		s.store.Delete(sess.ID)
		log.Printf("connect: failed stage=session_state duration=%s err=%v", time.Since(startedAt).Round(time.Millisecond), err)
		writeError(writer, statusForConnectError(err), mapError(err, "session_state"))
		return
	}
	log.Printf("connect: success duration=%s selected_server_id=%v", time.Since(startedAt).Round(time.Millisecond), state["selectedServerId"])

	writeJSON(writer, http.StatusOK, state)
}

func (s *Server) handleSession(writer http.ResponseWriter, request *http.Request) {
	switch request.Method {
	case http.MethodGet:
		cookie, err := request.Cookie(s.config.CookieName)
		if err != nil || cookie.Value == "" {
			writer.WriteHeader(http.StatusNoContent)
			return
		}

		sess, ok := s.store.Get(cookie.Value)
		if !ok {
			http.SetCookie(writer, &http.Cookie{
				Name:     s.config.CookieName,
				Value:    "",
				Path:     "/",
				HttpOnly: true,
				Secure:   s.config.CookieSecure,
				SameSite: http.SameSiteLaxMode,
				MaxAge:   -1,
			})
			writer.WriteHeader(http.StatusNoContent)
			return
		}

		state, err := sess.Client.SessionState()
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}

		writeJSON(writer, http.StatusOK, state)
	case http.MethodDelete:
		cookie, err := request.Cookie(s.config.CookieName)
		if err == nil && cookie.Value != "" {
			s.store.Delete(cookie.Value)
		}

		http.SetCookie(writer, &http.Cookie{
			Name:     s.config.CookieName,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   s.config.CookieSecure,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})

		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "unsupported method")
	}
}

func (s *Server) handleSelectServer(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "unsupported method")
		return
	}

	var payload struct {
		ServerID int `json:"serverId"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := sess.Client.SelectServer(payload.ServerID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	state, err := sess.Client.SessionState()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, state)
}

func (s *Server) handleServers(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "unsupported method")
		return
	}

	servers, err := sess.Client.ServerList()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"servers": servers})
}

func (s *Server) handleDashboard(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "unsupported method")
		return
	}

	dashboard, err := sess.Client.Dashboard()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, dashboard)
}

func (s *Server) handleClients(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "unsupported method")
		return
	}

	clients, err := sess.Client.ClientList()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"clients": clients})
}

func (s *Server) handleViewer(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "unsupported method")
		return
	}

	viewer, err := sess.Client.Viewer()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, viewer)
}

func (s *Server) handleLogs(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "unsupported method")
		return
	}

	limit, _ := strconv.Atoi(request.URL.Query().Get("limit"))
	logs, err := sess.Client.Logs(limit)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"logs": logs})
}

func (s *Server) withSession(next func(http.ResponseWriter, *http.Request, *session.Session)) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		cookie, err := request.Cookie(s.config.CookieName)
		if err != nil || cookie.Value == "" {
			writeError(writer, http.StatusUnauthorized, "session unauthorized")
			return
		}

		sess, ok := s.store.Get(cookie.Value)
		if !ok {
			writeError(writer, http.StatusUnauthorized, "session unauthorized")
			return
		}

		next(writer, request, sess)
	}
}

func (s *Server) handleCORS(writer http.ResponseWriter, request *http.Request) bool {
	origin := request.Header.Get("Origin")
	if origin == "" {
		origin = s.config.FrontendOrigin
	}

	allowOrigin := s.config.FrontendOrigin
	if allowOrigin == "*" {
		allowOrigin = origin
	}

	writer.Header().Set("Access-Control-Allow-Origin", allowOrigin)
	writer.Header().Set("Vary", "Origin")
	writer.Header().Set("Access-Control-Allow-Credentials", "true")
	writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	writer.Header().Set("Access-Control-Allow-Methods", strings.Join([]string{
		http.MethodGet,
		http.MethodPost,
		http.MethodPut,
		http.MethodDelete,
		http.MethodOptions,
	}, ", "))

	if request.Method == http.MethodOptions {
		writer.WriteHeader(http.StatusNoContent)
		return true
	}

	return false
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]any{
		"error": message,
	})
}

func statusForConnectError(err error) int {
	if err == nil {
		return http.StatusOK
	}

	var queryErr ts3.QueryError
	if errors.As(err, &queryErr) {
		message := strings.ToLower(queryErr.Message)
		if strings.Contains(message, "login") || strings.Contains(message, "password") {
			return http.StatusUnauthorized
		}
		return http.StatusBadGateway
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return http.StatusGatewayTimeout
	}

	if errors.Is(err, context.DeadlineExceeded) {
		return http.StatusGatewayTimeout
	}

	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "connection refused"),
		strings.Contains(message, "no such host"),
		strings.Contains(message, "network is unreachable"),
		strings.Contains(message, "no route to host"),
		strings.Contains(message, "eof"):
		return http.StatusBadGateway
	case strings.Contains(message, "必须"),
		strings.Contains(message, "仅支持"),
		strings.Contains(message, "端口"):
		return http.StatusBadRequest
	default:
		return http.StatusBadGateway
	}
}

func mapError(err error, stage string) string {
	if err == nil {
		return ""
	}

	var queryErr ts3.QueryError
	if errors.As(err, &queryErr) {
		if stage == "update_nickname" {
			return fmt.Sprintf("已连接并选中默认虚拟服务器，但设置查询昵称失败：%s", queryErr.Message)
		}
		return queryErr.Message
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		switch stage {
		case "server_list":
			return "已连接到 TeamSpeak ServerQuery，但读取虚拟服务器列表超时。请稍后重试，并检查远端负载、白名单和 Query 响应速度。"
		case "select_server":
			return "已连接到 TeamSpeak ServerQuery，但切换默认虚拟服务器超时。请检查目标实例状态后重试。"
		case "update_nickname":
			return "已连接到 TeamSpeak ServerQuery，但设置查询昵称超时。可以先留空昵称重试，确认连接稳定后再调整。"
		case "session_state":
			return "已建立 Query 会话，但读取初始状态超时。请稍后重试。"
		}
		return "连接 TeamSpeak ServerQuery 超时。请检查主机地址、Query 端口（默认 10011）、ServerQuery 是否已开启，以及防火墙或 IP 白名单配置。"
	}

	if errors.Is(err, context.DeadlineExceeded) {
		switch stage {
		case "server_list":
			return "已连接到 TeamSpeak ServerQuery，但在请求时限内未能读取虚拟服务器列表。"
		case "session_state":
			return "已建立 Query 会话，但在请求时限内未能读取初始状态。"
		}
		return "连接 TeamSpeak ServerQuery 超时。请检查目标服务是否可达，以及远端是否正常响应 Query 请求。"
	}

	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "connection refused"):
		return "目标主机拒绝连接。请确认 TeamSpeak ServerQuery 已开启，并检查主机地址和 Query 端口是否正确。"
	case strings.Contains(message, "no such host"):
		return "无法解析目标主机名。请检查填写的主机地址是否正确。"
	case strings.Contains(message, "network is unreachable"), strings.Contains(message, "no route to host"):
		return "无法到达目标主机。请检查网络连通性、路由和防火墙配置。"
	case strings.Contains(message, "eof"):
		if stage == "connect" {
			return "目标端口建立连接后立即断开，通常说明该端口不是可用的 TeamSpeak ServerQuery 服务，或当前来源 IP 被策略拒绝。"
		}
		return "目标服务已断开连接，可能不是可用的 TeamSpeak ServerQuery 服务，或远端主动关闭了连接。"
	}

	return err.Error()
}
