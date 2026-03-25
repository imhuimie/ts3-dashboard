package httpapi

import (
	"encoding/json"
	"net/http"

	"ts3-dashboard/backend/internal/session"
)

func (s *Server) handleComplaints(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	switch request.Method {
	case http.MethodGet:
		complaints, err := sess.Client.ComplaintList()
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"complaints": complaints})
	case http.MethodDelete:
		var payload struct {
			TargetClientDBID int `json:"tcldbid"`
			FromClientDBID   int `json:"fcldbid"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(writer, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := sess.Client.DeleteComplaint(payload.TargetClientDBID, payload.FromClientDBID); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *Server) handleMessages(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	var payload struct {
		TargetMode int    `json:"targetMode"`
		Target     int    `json:"target"`
		Message    string `json:"message"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}
	if payload.TargetMode < 1 || payload.TargetMode > 3 || payload.Target <= 0 || payload.Message == "" {
		writeError(writer, http.StatusBadRequest, "消息参数无效")
		return
	}

	if err := sess.Client.SendTextMessage(payload.TargetMode, payload.Target, payload.Message); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}
