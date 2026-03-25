package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"ts3-dashboard/backend/internal/session"
	"ts3-dashboard/backend/internal/ts3"
)

func (s *Server) handleChannels(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch request.Method {
	case http.MethodGet:
		channels, err := sess.Client.ChannelList()
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"channels": channels})
	case http.MethodPost:
		var payload struct {
			Name         string `json:"name"`
			ParentID     int    `json:"parentId"`
			Topic        string `json:"topic"`
			Password     string `json:"password"`
			MaxClients   int    `json:"maxClients"`
			Type         string `json:"type"`
			OrderAfterID int    `json:"orderAfterId"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		channelID, err := sess.Client.CreateChannel(ts3.ChannelCreateInput{
			Name:         payload.Name,
			ParentID:     payload.ParentID,
			Topic:        payload.Topic,
			Password:     payload.Password,
			MaxClients:   payload.MaxClients,
			Type:         payload.Type,
			OrderAfterID: payload.OrderAfterID,
		})
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true, "channelId": channelID})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleChannelByID(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	channelID, err := strconv.Atoi(strings.TrimPrefix(request.URL.Path, "/api/channels/"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "ID 无效")
		return
	}

	switch request.Method {
	case http.MethodPut:
		var payload struct {
			Name         string `json:"name"`
			ParentID     int    `json:"parentId"`
			Topic        string `json:"topic"`
			Password     string `json:"password"`
			MaxClients   int    `json:"maxClients"`
			Type         string `json:"type"`
			OrderAfterID int    `json:"orderAfterId"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := sess.Client.UpdateChannel(ts3.ChannelUpdateInput{
			ChannelID:    channelID,
			Name:         payload.Name,
			ParentID:     payload.ParentID,
			Topic:        payload.Topic,
			Password:     payload.Password,
			MaxClients:   payload.MaxClients,
			Type:         payload.Type,
			OrderAfterID: payload.OrderAfterID,
		}); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	case http.MethodDelete:
		force := request.URL.Query().Get("force") != "0"
		if err := sess.Client.DeleteChannel(channelID, force); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleClientByID(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	clientID, err := strconv.Atoi(strings.TrimPrefix(request.URL.Path, "/api/clients/"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "客户端 ID 无效")
		return
	}

	switch request.Method {
	case http.MethodGet:
		detail, err := sess.Client.ClientDetail(clientID)
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, detail)
	case http.MethodPut:
		var payload struct {
			Description    string `json:"description"`
			ServerGroupIDs []int  `json:"serverGroupIds"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := sess.Client.UpdateClient(ts3.ClientUpdateInput{ClientID: clientID, Description: payload.Description, ServerGroupIDs: payload.ServerGroupIDs}); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleClientKick(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	clientID, err := parseClientRouteID(request.URL.Path, "/api/clients/", "/kick")
	if err != nil {
		writeError(writer, http.StatusBadRequest, "客户端 ID 无效")
		return
	}

	var payload struct {
		Reason string `json:"reason"`
		Mode   string `json:"mode"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}

	if err := sess.Client.KickClient(ts3.ClientKickInput{ClientID: clientID, Reason: payload.Reason, Mode: payload.Mode}); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleClientMove(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	clientID, err := parseClientRouteID(request.URL.Path, "/api/clients/", "/move")
	if err != nil {
		writeError(writer, http.StatusBadRequest, "客户端 ID 无效")
		return
	}

	var payload struct {
		TargetChannelID int    `json:"targetChannelId"`
		ChannelPassword string `json:"channelPassword"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}

	if err := sess.Client.MoveClient(ts3.ClientMoveInput{ClientID: clientID, TargetChannelID: payload.TargetChannelID, ChannelPassword: payload.ChannelPassword}); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleClientBan(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	clientID, err := parseClientRouteID(request.URL.Path, "/api/clients/", "/ban")
	if err != nil {
		writeError(writer, http.StatusBadRequest, "客户端 ID 无效")
		return
	}

	var payload struct {
		Reason string `json:"reason"`
		Time   int    `json:"time"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}

	if err := sess.Client.BanClient(ts3.ClientBanInput{ClientID: clientID, Reason: payload.Reason, Time: payload.Time}); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleServerGroups(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch request.Method {
	case http.MethodGet:
		groups, err := sess.Client.ServerGroupList()
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"groups": groups})
	case http.MethodPost:
		var payload struct {
			Name string `json:"name"`
			Type int    `json:"type"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		groupID, err := sess.Client.CreateServerGroup(payload.Name, payload.Type)
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true, "groupId": groupID})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleServerGroupByID(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	path := strings.TrimPrefix(request.URL.Path, "/api/server-groups/")
	parts := strings.Split(path, "/")
	groupID, err := strconv.Atoi(parts[0])
	if err != nil {
		writeError(writer, http.StatusBadRequest, "服务器组 ID 无效")
		return
	}

	if len(parts) == 2 && parts[1] == "copy" {
		if request.Method != http.MethodPost {
			writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
			return
		}

		var payload struct {
			TargetGroupID int    `json:"targetGroupId"`
			Name          string `json:"name"`
			Type          int    `json:"type"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := sess.Client.CopyServerGroup(groupID, payload.TargetGroupID, payload.Name, payload.Type); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		return
	}

	if len(parts) == 1 {
		switch request.Method {
		case http.MethodPut:
			var payload struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				writeError(writer, http.StatusBadRequest, "请求体无效")
				return
			}
			if err := sess.Client.RenameServerGroup(groupID, payload.Name); err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		case http.MethodDelete:
			if err := sess.Client.DeleteServerGroup(groupID); err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		default:
			writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		}
		return
	}

	if len(parts) < 2 || parts[1] != "clients" {
		writeError(writer, http.StatusNotFound, "资源不存在")
		return
	}

	if len(parts) == 2 {
		switch request.Method {
		case http.MethodGet:
			members, err := sess.Client.ServerGroupClientList(groupID)
			if err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(writer, http.StatusOK, map[string]any{"clients": members})
		case http.MethodPost:
			var payload struct {
				ClientDBID int `json:"clientDbId"`
			}
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				writeError(writer, http.StatusBadRequest, "请求体无效")
				return
			}
			if err := sess.Client.AddClientToServerGroup(groupID, payload.ClientDBID); err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		default:
			writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		}
		return
	}

	if len(parts) != 3 || request.Method != http.MethodDelete {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	clientDBID, err := strconv.Atoi(parts[2])
	if err != nil {
		writeError(writer, http.StatusBadRequest, "客户端数据库 ID 无效")
		return
	}
	if err := sess.Client.RemoveClientFromServerGroup(groupID, clientDBID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleChannelGroups(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch request.Method {
	case http.MethodGet:
		groups, err := sess.Client.ChannelGroupList()
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"groups": groups})
	case http.MethodPost:
		var payload struct {
			Name string `json:"name"`
			Type int    `json:"type"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		groupID, err := sess.Client.CreateChannelGroup(payload.Name, payload.Type)
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true, "groupId": groupID})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleChannelGroupByID(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	path := strings.TrimPrefix(request.URL.Path, "/api/channel-groups/")
	parts := strings.Split(path, "/")
	groupID, err := strconv.Atoi(parts[0])
	if err != nil {
		writeError(writer, http.StatusBadRequest, "频道组 ID 无效")
		return
	}

	if len(parts) == 2 && parts[1] == "copy" {
		if request.Method != http.MethodPost {
			writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
			return
		}

		var payload struct {
			TargetGroupID int    `json:"targetGroupId"`
			Name          string `json:"name"`
			Type          int    `json:"type"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := sess.Client.CopyChannelGroup(groupID, payload.TargetGroupID, payload.Name, payload.Type); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		return
	}

	if len(parts) == 1 {
		switch request.Method {
		case http.MethodPut:
			var payload struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				writeError(writer, http.StatusBadRequest, "请求体无效")
				return
			}
			if err := sess.Client.RenameChannelGroup(groupID, payload.Name); err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		case http.MethodDelete:
			if err := sess.Client.DeleteChannelGroup(groupID); err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		default:
			writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		}
		return
	}

	if len(parts) < 2 || parts[1] != "clients" {
		writeError(writer, http.StatusNotFound, "资源不存在")
		return
	}

	if len(parts) == 2 {
		switch request.Method {
		case http.MethodGet:
			channelID, err := strconv.Atoi(request.URL.Query().Get("channelId"))
			if err != nil {
				writeError(writer, http.StatusBadRequest, "频道 ID 无效")
				return
			}
			members, err := sess.Client.ChannelGroupClientList(groupID, channelID)
			if err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(writer, http.StatusOK, map[string]any{"clients": members})
		case http.MethodPost:
			var payload struct {
				ClientDBID int `json:"clientDbId"`
				ChannelID  int `json:"channelId"`
			}
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				writeError(writer, http.StatusBadRequest, "请求体无效")
				return
			}
			if err := sess.Client.SetClientChannelGroup(groupID, payload.ChannelID, payload.ClientDBID); err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		case http.MethodDelete:
			var payload struct {
				ClientDBID int `json:"clientDbId"`
				ChannelID  int `json:"channelId"`
			}
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				writeError(writer, http.StatusBadRequest, "请求体无效")
				return
			}
			defaultGroupID, err := sess.Client.DefaultChannelGroupID()
			if err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			if err := sess.Client.SetClientChannelGroup(defaultGroupID, payload.ChannelID, payload.ClientDBID); err != nil {
				writeError(writer, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		default:
			writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		}
		return
	}

	writeError(writer, http.StatusNotFound, "资源不存在")
}

func parseClientRouteID(path string, prefix string, suffix string) (int, error) {
	raw := strings.TrimPrefix(path, prefix)
	raw = strings.TrimSuffix(raw, suffix)
	return strconv.Atoi(raw)
}
