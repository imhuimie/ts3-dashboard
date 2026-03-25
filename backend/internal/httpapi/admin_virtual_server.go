package httpapi

import (
	"encoding/json"
	"net/http"

	"ts3-dashboard/backend/internal/session"
	"ts3-dashboard/backend/internal/ts3"
)

func (s *Server) handleServerAdmin(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch request.Method {
	case http.MethodGet:
		info, err := sess.Client.VirtualServerAdminInfo()
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, info)
	case http.MethodPut:
		var payload ts3.VirtualServerAdminInfo
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if payload.Name == "" {
			writeError(writer, http.StatusBadRequest, "必须填写服务器名称")
			return
		}
		if payload.MaxClients <= 0 {
			writeError(writer, http.StatusBadRequest, "最大客户端数必须大于 0")
			return
		}
		if err := sess.Client.UpdateVirtualServer(payload); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleServerCreate(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	var payload struct {
		Name       string `json:"name"`
		Port       int    `json:"port"`
		MaxClients int    `json:"maxClients"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}
	if payload.Name == "" {
		writeError(writer, http.StatusBadRequest, "必须填写服务器名称")
		return
	}
	if payload.Port <= 0 {
		writeError(writer, http.StatusBadRequest, "端口必须大于 0")
		return
	}
	if payload.MaxClients <= 0 {
		writeError(writer, http.StatusBadRequest, "最大客户端数必须大于 0")
		return
	}

	result, err := sess.Client.CreateVirtualServer(ts3.CreateVirtualServerInput{
		Name:       payload.Name,
		Port:       payload.Port,
		MaxClients: payload.MaxClients,
	})
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, result)
}
