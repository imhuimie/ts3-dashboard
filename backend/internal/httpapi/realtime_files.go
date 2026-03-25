package httpapi

import (
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"ts3-dashboard/backend/internal/session"
	"ts3-dashboard/backend/internal/ts3"
)

func (s *Server) handleEvents(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	flusher, ok := writer.(http.Flusher)
	if !ok {
		writeError(writer, http.StatusInternalServerError, "当前环境不支持流式响应")
		return
	}

	eventClient, err := sess.Client.EventClient(request.Context())
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	defer eventClient.Close()

	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.Header().Set("Connection", "keep-alive")
	writer.Header().Set("X-Accel-Buffering", "no")

	if err := writeSSE(writer, "ready", map[string]any{
		"selectedServerId": sess.Client.SelectedServerID(),
		"timestamp":        time.Now().UTC(),
	}); err != nil {
		return
	}
	flusher.Flush()

	events := make(chan ts3.Event, 16)
	errs := make(chan error, 1)
	go func() {
		errs <- eventClient.StreamEvents(request.Context(), func(event ts3.Event) error {
			select {
			case events <- event:
				return nil
			case <-request.Context().Done():
				return request.Context().Err()
			}
		})
	}()

	pingTicker := time.NewTicker(20 * time.Second)
	defer pingTicker.Stop()

	for {
		select {
		case event := <-events:
			if err := writeSSE(writer, event.Type, event); err != nil {
				return
			}
			flusher.Flush()
		case err := <-errs:
			if errors.Is(err, request.Context().Err()) {
				return
			}
			if err != nil {
				_ = writeSSE(writer, "error", map[string]any{"message": err.Error()})
				flusher.Flush()
			}
			return
		case <-pingTicker.C:
			if err := writeSSE(writer, "ping", map[string]any{"timestamp": time.Now().UTC()}); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func (s *Server) handleFileChannels(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	channels, err := sess.Client.ChannelList()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"channels": channels})
}

func (s *Server) handleFiles(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	channelID, err := strconv.Atoi(request.URL.Query().Get("cid"))
	if err != nil || channelID <= 0 {
		writeError(writer, http.StatusBadRequest, "ID 无效")
		return
	}

	items, err := sess.Client.FileList(channelID, request.URL.Query().Get("path"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleFileDownload(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	channelID, err := strconv.Atoi(request.URL.Query().Get("cid"))
	if err != nil || channelID < 0 {
		writeError(writer, http.StatusBadRequest, "ID 无效")
		return
	}

	filePath := request.URL.Query().Get("path")
	if filePath == "" {
		writeError(writer, http.StatusBadRequest, "必须填写文件路径")
		return
	}

	info, err := sess.Client.FileInfo(channelID, filePath)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writer.Header().Set("Content-Type", "application/octet-stream")
	writer.Header().Set("Content-Disposition", "attachment; filename=\""+path.Base(filePath)+"\"")
	if info.Size > 0 {
		writer.Header().Set("Content-Length", strconv.FormatInt(info.Size, 10))
	}

	if _, err := sess.Client.StreamDownload(channelID, filePath, writer); err != nil {
		return
	}
}

func (s *Server) handleFileUpload(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	channelID, err := strconv.Atoi(request.URL.Query().Get("cid"))
	if err != nil || channelID <= 0 {
		writeError(writer, http.StatusBadRequest, "ID 无效")
		return
	}

	folderPath := request.URL.Query().Get("path")
	overwrite := request.URL.Query().Get("overwrite") != "0"

	file, header, err := request.FormFile("file")
	if err != nil {
		writeError(writer, http.StatusBadRequest, "必须上传文件字段")
		return
	}
	defer file.Close()

	size, err := fileSize(file, header)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	if err := sess.Client.UploadFile(channelID, folderPath, header.Filename, size, file, overwrite); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleFileDelete(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodDelete {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	var payload struct {
		ChannelID int    `json:"cid"`
		Path      string `json:"path"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}
	if err := sess.Client.DeleteFile(payload.ChannelID, payload.Path); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleFileRename(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	var payload struct {
		ChannelID int    `json:"cid"`
		OldPath   string `json:"oldPath"`
		NewPath   string `json:"newPath"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}
	if err := sess.Client.RenameFile(payload.ChannelID, payload.OldPath, payload.NewPath); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleCreateDirectory(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	var payload struct {
		ChannelID int    `json:"cid"`
		Path      string `json:"path"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "请求体无效")
		return
	}
	if err := sess.Client.CreateDirectory(payload.ChannelID, payload.Path); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleAvatar(writer http.ResponseWriter, request *http.Request, sess *session.Session) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	clientDBID, err := strconv.Atoi(strings.TrimPrefix(request.URL.Path, "/api/avatars/"))
	if err != nil || clientDBID <= 0 {
		writeError(writer, http.StatusBadRequest, "客户端数据库 ID 无效")
		return
	}

	data, contentType, err := sess.Client.DownloadAvatar(clientDBID)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writer.Header().Set("Content-Type", contentType)
	writer.Header().Set("Cache-Control", "private, max-age=300")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(data)
}

func writeSSE(writer http.ResponseWriter, event string, payload any) error {
	if event != "" {
		if _, err := writer.Write([]byte("event: " + event + "\n")); err != nil {
			return err
		}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := writer.Write([]byte("data: " + string(body) + "\n\n")); err != nil {
		return err
	}

	return nil
}

func fileSize(file multipart.File, header *multipart.FileHeader) (int64, error) {
	if header.Size > 0 {
		return header.Size, nil
	}

	seeker, ok := file.(interface{ Seek(int64, int) (int64, error) })
	if !ok {
		return 0, errors.New("无法获取文件大小")
	}

	size, err := seeker.Seek(0, 2)
	if err != nil {
		return 0, err
	}
	if _, err := seeker.Seek(0, 0); err != nil {
		return 0, err
	}

	return size, nil
}
