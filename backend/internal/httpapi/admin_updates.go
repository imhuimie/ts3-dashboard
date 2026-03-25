package httpapi

import (
	"encoding/json"
	"net/http"
	"time"
)

const teamSpeakVersionsURL = "https://www.teamspeak.com/versions/server.json"

func (s *Server) handleTeamSpeakVersions(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	upstreamRequest, err := http.NewRequestWithContext(request.Context(), http.MethodGet, teamSpeakVersionsURL, nil)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "创建上游请求失败")
		return
	}

	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(upstreamRequest)
	if err != nil {
		writeError(writer, http.StatusBadGateway, "获取 TeamSpeak 版本信息失败")
		return
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		writeError(writer, http.StatusBadGateway, "上游版本接口响应异常")
		return
	}

	var payload any
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadGateway, "解析 TeamSpeak 版本信息失败")
		return
	}

	writeJSON(writer, http.StatusOK, payload)
}
