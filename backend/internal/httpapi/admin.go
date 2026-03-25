package httpapi

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"ts3-dashboard/backend/internal/session"
	"ts3-dashboard/backend/internal/ts3"
)

func (s *Server) handleBans(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch request.Method {
	case http.MethodGet:
		bans, err := sess.Client.BanList()
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"bans": bans})
	case http.MethodPost:
		var payload struct {
			IP     string `json:"ip"`
			Name   string `json:"name"`
			UID    string `json:"uid"`
			Reason string `json:"reason"`
			Time   int    `json:"time"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := sess.Client.AddBan(ts3.CreateBanInput{IP: payload.IP, Name: payload.Name, UID: payload.UID, Reason: payload.Reason, Time: payload.Time}); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleBanByID(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	banID, err := strconv.Atoi(strings.TrimPrefix(request.URL.Path, "/api/bans/"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "ID 无效")
		return
	}

	switch request.Method {
	case http.MethodDelete:
		if err := sess.Client.DeleteBan(banID); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	case http.MethodPut:
		var payload struct {
			IP     string `json:"ip"`
			Name   string `json:"name"`
			UID    string `json:"uid"`
			Reason string `json:"reason"`
			Time   int    `json:"time"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := sess.Client.AddBan(ts3.CreateBanInput{IP: payload.IP, Name: payload.Name, UID: payload.UID, Reason: payload.Reason, Time: payload.Time}); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		if err := sess.Client.DeleteBan(banID); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleTokens(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch request.Method {
	case http.MethodGet:
		tokens, err := sess.Client.TokenList()
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"tokens": tokens})
	case http.MethodPost:
		var payload struct {
			TokenType   int    `json:"tokenType"`
			TokenID1    int    `json:"tokenId1"`
			TokenID2    int    `json:"tokenId2"`
			Description string `json:"description"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		token, err := sess.Client.CreateToken(ts3.CreateTokenInput{TokenType: payload.TokenType, TokenID1: payload.TokenID1, TokenID2: payload.TokenID2, Description: payload.Description})
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"token": token})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleTokenByValue(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodDelete {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	rawToken := strings.TrimPrefix(request.URL.Path, "/api/tokens/")
	token, err := url.PathUnescape(rawToken)
	if err != nil {
		writeError(writer, http.StatusBadRequest, "令牌无效")
		return
	}
	if err := sess.Client.DeleteToken(token); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handlePermissionsMeta(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	catalog, err := sess.Client.PermissionCatalog()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	serverGroups, err := sess.Client.ServerGroupList()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	channelGroups, err := sess.Client.ChannelGroupList()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	channels, err := sess.Client.ChannelList()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	clients, err := sess.Client.ClientDBList()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	channelTargets := make([]ts3.GroupEntry, 0, len(channels))
	for _, channel := range channels {
		channelTargets = append(channelTargets, ts3.GroupEntry{ID: channel.ID, Name: channel.Name})
	}

	writeJSON(writer, http.StatusOK, ts3.PermissionsMeta{
		Catalog:       catalog,
		ServerGroups:  serverGroups,
		ChannelGroups: channelGroups,
		Channels:      channelTargets,
		Clients:       clients,
	})
}

func (s *Server) handlePermissions(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	scope := ts3.PermissionScope(request.URL.Query().Get("scope"))
	targetID, err := strconv.Atoi(request.URL.Query().Get("targetId"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "ID 无效")
		return
	}

	channelID := 0
	channelIDRaw := request.URL.Query().Get("channelId")
	if channelIDRaw != "" {
		channelID, err = strconv.Atoi(channelIDRaw)
		if err != nil {
			writeError(writer, http.StatusBadRequest, "频道 ID 无效")
			return
		}
	}

	switch request.Method {
	case http.MethodGet:
		permissions, err := sess.Client.Permissions(scope, targetID, channelID)
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"permissions": permissions})
	case http.MethodPost:
		var payload struct {
			Scope       ts3.PermissionScope `json:"scope"`
			TargetID    int                 `json:"targetId"`
			ChannelID   int                 `json:"channelId"`
			PermID      int                 `json:"permid"`
			PermValue   *int                `json:"permvalue"`
			PermSkip    *int                `json:"permskip"`
			PermNegated *int                `json:"permnegated"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := sess.Client.SavePermission(ts3.SavePermissionInput{
			Scope:       payload.Scope,
			TargetID:    payload.TargetID,
			ChannelID:   payload.ChannelID,
			PermID:      payload.PermID,
			PermValue:   payload.PermValue,
			PermSkip:    payload.PermSkip,
			PermNegated: payload.PermNegated,
		}); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	case http.MethodDelete:
		permID, err := strconv.Atoi(request.URL.Query().Get("permid"))
		if err != nil {
			writeError(writer, http.StatusBadRequest, "ID 无效")
			return
		}
		if err := sess.Client.DeletePermission(scope, targetID, channelID, permID); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}
