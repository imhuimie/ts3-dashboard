package ts3

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
)

type FileEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	ChannelID int    `json:"cid"`
	Type      int    `json:"type"`
	Size      int64  `json:"size"`
	DateTime  int64  `json:"datetime"`
}

type FileInfo struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	ChannelID int    `json:"cid"`
	Size      int64  `json:"size"`
	DateTime  int64  `json:"datetime"`
}

type ClientDBInfo struct {
	ClientFlagAvatar          bool   `json:"clientFlagAvatar"`
	ClientBase64HashClientUID string `json:"clientBase64HashClientUID"`
}

type FileTransferTicket struct {
	ClientTransferID string
	FileTransferKey  string
	Port             int
	Size             int64
	FileName         string
}

func (c *Client) FileList(channelID int, folderPath string) ([]FileEntry, error) {
	if channelID <= 0 {
		return nil, errors.New("频道 ID 必须大于 0")
	}

	resolvedPath := normalizeTS3Path(folderPath)
	records, err := c.exec("ftgetfilelist", map[string]string{
		"cid":  strconv.Itoa(channelID),
		"cpw":  "",
		"path": resolvedPath,
	}, nil)
	if err != nil {
		return nil, err
	}

	items := make([]FileEntry, 0, len(records))
	for _, record := range records {
		items = append(items, FileEntry{
			Name:      record["name"],
			Path:      resolvedPath,
			ChannelID: toInt(record["cid"]),
			Type:      toInt(record["type"]),
			Size:      toInt64(record["size"]),
			DateTime:  toInt64(record["datetime"]),
		})
	}

	return items, nil
}

func (c *Client) FileInfo(channelID int, filePath string) (FileInfo, error) {
	resolvedPath := normalizeTS3FilePath(filePath)
	records, err := c.exec("ftgetfileinfo", map[string]string{
		"cid":  strconv.Itoa(channelID),
		"cpw":  "",
		"name": resolvedPath,
	}, nil)
	if err != nil {
		return FileInfo{}, err
	}
	if len(records) == 0 {
		return FileInfo{}, errors.New("未找到文件")
	}

	record := records[0]
	return FileInfo{
		Name:      record["name"],
		Path:      path.Dir(resolvedPath),
		ChannelID: toInt(record["cid"]),
		Size:      toInt64(record["size"]),
		DateTime:  toInt64(record["datetime"]),
	}, nil
}

func (c *Client) ClientDBInfo(clientDBID int) (ClientDBInfo, error) {
	records, err := c.exec("clientdbinfo", map[string]string{
		"cldbid": strconv.Itoa(clientDBID),
	}, nil)
	if err != nil {
		return ClientDBInfo{}, err
	}
	if len(records) == 0 {
		return ClientDBInfo{}, errors.New("未找到客户端数据库记录")
	}

	record := records[0]
	return ClientDBInfo{
		ClientFlagAvatar:          record["client_flag_avatar"] == "1",
		ClientBase64HashClientUID: record["client_base64HashClientUID"],
	}, nil
}


func (c *Client) CreateDirectory(channelID int, dirPath string) error {
	if channelID <= 0 {
		return errors.New("频道 ID 必须大于 0")
	}

	resolvedPath := normalizeTS3FilePath(dirPath)
	if resolvedPath == "/" {
		return errors.New("必须填写目录路径")
	}

	_, err := c.exec("ftcreatedir", map[string]string{
		"cid":     strconv.Itoa(channelID),
		"cpw":     "",
		"dirname": resolvedPath,
	}, nil)
	return err
}

func (c *Client) RenameFile(channelID int, oldPath, newPath string) error {
	if channelID <= 0 {
		return errors.New("频道 ID 必须大于 0")
	}

	resolvedOldPath := normalizeTS3FilePath(oldPath)
	resolvedNewPath := normalizeTS3FilePath(newPath)
	if resolvedOldPath == "/" || resolvedNewPath == "/" {
		return errors.New("必须填写旧路径和新路径")
	}

	_, err := c.exec("ftrenamefile", map[string]string{
		"cid":     strconv.Itoa(channelID),
		"cpw":     "",
		"oldname": resolvedOldPath,
		"newname": resolvedNewPath,
	}, nil)
	return err
}

func (c *Client) DeleteFile(channelID int, filePath string) error {
	if channelID <= 0 {
		return errors.New("频道 ID 必须大于 0")
	}

	resolvedPath := normalizeTS3FilePath(filePath)
	if resolvedPath == "/" {
		return errors.New("必须填写文件路径")
	}

	_, err := c.exec("ftdeletefile", map[string]string{
		"cid":  strconv.Itoa(channelID),
		"cpw":  "",
		"name": resolvedPath,
	}, nil)
	return err
}
func (c *Client) DownloadAvatar(clientDBID int) ([]byte, string, error) {
	info, err := c.ClientDBInfo(clientDBID)
	if err != nil {
		return nil, "", err
	}
	if !info.ClientFlagAvatar || info.ClientBase64HashClientUID == "" {
		return nil, "", errors.New("未找到头像文件")
	}

	avatarPath := "/avatar_" + info.ClientBase64HashClientUID
	data, err := c.DownloadFile(0, avatarPath)
	if err != nil {
		return nil, "", err
	}

	contentType := http.DetectContentType(data)
	if contentType == "application/octet-stream" {
		contentType = "image/png"
	}

	return data, contentType, nil
}

func (c *Client) DownloadFile(channelID int, filePath string) ([]byte, error) {
	ticket, err := c.InitDownload(channelID, filePath, 0)
	if err != nil {
		return nil, err
	}

	conn, err := c.openFileTransferConn(ticket.Port)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	if err := conn.SetDeadline(time.Now().Add(30 * time.Second)); err != nil {
		return nil, err
	}
	if _, err := conn.Write([]byte(ticket.FileTransferKey)); err != nil {
		return nil, err
	}

	return io.ReadAll(conn)
}

func (c *Client) StreamDownload(channelID int, filePath string, writer io.Writer) (FileTransferTicket, error) {
	ticket, err := c.InitDownload(channelID, filePath, 0)
	if err != nil {
		return FileTransferTicket{}, err
	}

	conn, err := c.openFileTransferConn(ticket.Port)
	if err != nil {
		return FileTransferTicket{}, err
	}
	defer conn.Close()

	if err := conn.SetDeadline(time.Now().Add(60 * time.Second)); err != nil {
		return FileTransferTicket{}, err
	}
	if _, err := conn.Write([]byte(ticket.FileTransferKey)); err != nil {
		return FileTransferTicket{}, err
	}
	if _, err := io.Copy(writer, conn); err != nil {
		return FileTransferTicket{}, err
	}

	return ticket, nil
}

func (c *Client) UploadFile(channelID int, folderPath, fileName string, size int64, reader io.Reader, overwrite bool) error {
	fullPath := joinTS3Path(folderPath, fileName)
	ticket, err := c.InitUpload(channelID, fullPath, size, overwrite)
	if err != nil {
		return err
	}

	conn, err := c.openFileTransferConn(ticket.Port)
	if err != nil {
		return err
	}
	defer conn.Close()

	if err := conn.SetDeadline(time.Now().Add(60 * time.Second)); err != nil {
		return err
	}
	if _, err := conn.Write([]byte(ticket.FileTransferKey)); err != nil {
		return err
	}
	if _, err := io.Copy(conn, reader); err != nil {
		return err
	}

	return nil
}

func (c *Client) InitDownload(channelID int, filePath string, seekPosition int64) (FileTransferTicket, error) {
	resolvedPath := normalizeTS3FilePath(filePath)
	records, err := c.exec("ftinitdownload", map[string]string{
		"clientftfid": newClientTransferID(),
		"name":        resolvedPath,
		"cid":         strconv.Itoa(channelID),
		"cpw":         "",
		"seekpos":     strconv.FormatInt(seekPosition, 10),
	}, nil)
	if err != nil {
		return FileTransferTicket{}, err
	}
	return parseTransferTicket(records, resolvedPath)
}

func (c *Client) InitUpload(channelID int, filePath string, size int64, overwrite bool) (FileTransferTicket, error) {
	overwriteValue := "0"
	if overwrite {
		overwriteValue = "1"
	}

	resolvedPath := normalizeTS3FilePath(filePath)
	records, err := c.exec("ftinitupload", map[string]string{
		"clientftfid": newClientTransferID(),
		"name":        resolvedPath,
		"cid":         strconv.Itoa(channelID),
		"size":        strconv.FormatInt(size, 10),
		"cpw":         "",
		"overwrite":   overwriteValue,
		"resume":      "0",
	}, nil)
	if err != nil {
		return FileTransferTicket{}, err
	}
	return parseTransferTicket(records, resolvedPath)
}

func (c *Client) openFileTransferConn(port int) (net.Conn, error) {
	host, _, err := net.SplitHostPort(c.address)
	if err != nil {
		return nil, err
	}

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), 10*time.Second)
	if err != nil {
		return nil, err
	}

	return conn, nil
}

func parseTransferTicket(records []map[string]string, fallbackName string) (FileTransferTicket, error) {
	if len(records) == 0 {
		return FileTransferTicket{}, errors.New("文件传输响应为空")
	}

	record := records[0]
	ticket := FileTransferTicket{
		ClientTransferID: record["clientftfid"],
		FileTransferKey:  record["ftkey"],
		Port:             toInt(record["port"]),
		Size:             toInt64(record["size"]),
		FileName:         record["name"],
	}
	if ticket.FileName == "" {
		ticket.FileName = fallbackName
	}
	if ticket.FileTransferKey == "" || ticket.Port == 0 {
		return FileTransferTicket{}, fmt.Errorf("%s 的文件传输票据无效", fallbackName)
	}

	return ticket, nil
}

func normalizeTS3Path(value string) string {
	if value == "" || value == "." {
		return "/"
	}

	cleaned := path.Clean(strings.ReplaceAll(value, "\\", "/"))
	if cleaned == "." {
		return "/"
	}
	if !strings.HasPrefix(cleaned, "/") {
		return "/" + cleaned
	}

	return cleaned
}

func normalizeTS3FilePath(value string) string {
	cleaned := normalizeTS3Path(value)
	if cleaned == "/" {
		return cleaned
	}
	return strings.TrimSuffix(cleaned, "/")
}

func joinTS3Path(folderPath, fileName string) string {
	base := normalizeTS3Path(folderPath)
	return normalizeTS3FilePath(path.Join(base, fileName))
}

func newClientTransferID() string {
	buffer := make([]byte, 4)
	if _, err := rand.Read(buffer); err == nil {
		return hex.EncodeToString(buffer)
	}

	return strconv.FormatInt(time.Now().UnixNano(), 10)
}

