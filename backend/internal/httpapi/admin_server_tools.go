package httpapi

import (
	"encoding/json"
	"net/http"

	"ts3-dashboard/backend/internal/session"
)

func (s *Server) handleClientPoke(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	clientID, err := parseClientRouteID(request.URL.Path, "/api/clients/", "/poke")
	if err != nil {
		writeError(writer, http.StatusBadRequest, "客户端 ID 无效")
		return
	}

	var payload struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}
	if payload.Message == "" {
		writeError(writer, http.StatusBadRequest, "必须填写消息内容")
		return
	}

	if err := sess.Client.PokeClient(clientID, payload.Message); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleServerSnapshot(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch request.Method {
	case http.MethodGet:
		snapshot, err := sess.Client.CreateServerSnapshot()
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"snapshot": snapshot})
	case http.MethodPost:
		var payload struct {
			Snapshot string `json:"snapshot"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if payload.Snapshot == "" {
			writeError(writer, http.StatusBadRequest, "必须填写快照内容")
			return
		}
		if err := sess.Client.DeployServerSnapshot(payload.Snapshot); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}
