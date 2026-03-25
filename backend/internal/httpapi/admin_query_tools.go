package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"ts3-dashboard/backend/internal/session"
	"ts3-dashboard/backend/internal/ts3"
)

func (s *Server) handleAPIKeys(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch request.Method {
	case http.MethodGet:
		keys, err := sess.Client.APIKeyList("*")
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"apiKeys": keys})
	case http.MethodPost:
		var payload struct {
			Scope      string `json:"scope"`
			ClientDBID int    `json:"clientDbId"`
			Lifetime   int    `json:"lifetime"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if strings.TrimSpace(payload.Scope) == "" {
			writeError(writer, http.StatusBadRequest, "必须填写 API Key 作用域")
			return
		}
		apiKey, err := sess.Client.CreateAPIKey(ts3.CreateAPIKeyInput{
			Scope:      payload.Scope,
			ClientDBID: payload.ClientDBID,
			Lifetime:   payload.Lifetime,
		})
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"apiKey": apiKey})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleAPIKeyByID(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodDelete {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	id, err := strconv.Atoi(strings.TrimPrefix(request.URL.Path, "/api/api-keys/"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "API Key ID 无效")
		return
	}

	if err := sess.Client.DeleteAPIKey(id); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleConsole(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	var payload struct {
		Input string `json:"input"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}

	records, err := sess.Client.ExecuteConsole(payload.Input)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"records": records})
}

func (s *Server) handleClientDatabaseByID(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodDelete {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	clientDBID, err := strconv.Atoi(strings.TrimPrefix(request.URL.Path, "/api/client-database/"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "客户端数据库 ID 无效")
		return
	}

	if err := sess.Client.DeleteClientDB(clientDBID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleServerByID(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	path := strings.TrimPrefix(request.URL.Path, "/api/servers/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[1] != "actions" {
		writeError(writer, http.StatusNotFound, "资源不存在")
		return
	}

	serverID, err := strconv.Atoi(parts[0])
	if err != nil {
		writeError(writer, http.StatusBadRequest, "虚拟服务器 ID 无效")
		return
	}

	var payload struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}

	switch payload.Action {
	case "start":
		err = sess.Client.StartServer(serverID)
	case "stop":
		err = sess.Client.StopServer(serverID, payload.Reason)
	case "delete":
		err = sess.Client.DeleteServer(serverID)
	default:
		writeError(writer, http.StatusBadRequest, "不支持的操作")
		return
	}
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	state, err := refreshSessionState(sess.Client)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, state)
}

func refreshSessionState(client *ts3.Client) (map[string]any, error) {
	if client.SelectedServerID() == 0 {
		servers, err := client.ServerList()
		if err != nil {
			return nil, err
		}
		for _, server := range servers {
			if !strings.EqualFold(server.Status, "online") {
				continue
			}
			if err := client.SelectServer(server.ID); err == nil {
				break
			}
		}
	}

	return client.SessionState()
}
