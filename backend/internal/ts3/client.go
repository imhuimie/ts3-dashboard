package ts3

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultQueryPort      = 10011
	queryDialTimeout      = 10 * time.Second
	queryHandshakeTimeout = 20 * time.Second
	queryCommandTimeout   = 20 * time.Second
	queryCommandInterval  = 600 * time.Millisecond
	queryFloodRetryDelay  = 3 * time.Second
)

type ConnectOptions struct {
	Host      string `json:"host"`
	QueryPort int    `json:"queryPort"`
	Username  string `json:"username"`
	Password  string `json:"password"`
	Nickname  string `json:"nickname"`
	Protocol  string `json:"protocol"`
}

type Client struct {
	conn             net.Conn
	reader           *bufio.Reader
	mu               sync.Mutex
	address          string
	options          ConnectOptions
	selectedServerID int
	lastCommandAt    time.Time
}

type ServerSummary struct {
	ID            int    `json:"id"`
	Port          int    `json:"port"`
	Name          string `json:"name"`
	Status        string `json:"status"`
	ClientsOnline int    `json:"clientsOnline"`
	MaxClients    int    `json:"maxClients"`
	UID           string `json:"uid"`
}

type ServerInfo struct {
	ID               int    `json:"id"`
	Name             string `json:"name"`
	Status           string `json:"status"`
	Port             int    `json:"port"`
	ClientsOnline    int    `json:"clientsOnline"`
	MaxClients       int    `json:"maxClients"`
	ChannelsOnline   int    `json:"channelsOnline"`
	UptimeSeconds    int    `json:"uptimeSeconds"`
	QueryConnections int    `json:"queryConnections"`
	Version          string `json:"version"`
	Platform         string `json:"platform"`
	HostMessage      string `json:"hostMessage"`
}

type QueryUser struct {
	ClientID       int    `json:"clientId"`
	ChannelID      int    `json:"channelId"`
	DatabaseID     int    `json:"databaseId"`
	Nickname       string `json:"nickname"`
	LoginName      string `json:"loginName"`
	UniqueID       string `json:"uniqueId"`
	VirtualServer  int    `json:"virtualServerId"`
	VirtualPort    int    `json:"virtualPort"`
	ServerStatus   string `json:"serverStatus"`
	ServerUniqueID string `json:"serverUniqueId"`
}

type ClientSummary struct {
	ID               int    `json:"id"`
	DatabaseID       int    `json:"databaseId"`
	ChannelID        int    `json:"channelId"`
	Nickname         string `json:"nickname"`
	UniqueID         string `json:"uniqueId"`
	Platform         string `json:"platform"`
	Version          string `json:"version"`
	Country          string `json:"country"`
	IdleTime         int64  `json:"idleTime"`
	InputMuted       bool   `json:"inputMuted"`
	OutputMuted      bool   `json:"outputMuted"`
	Away             bool   `json:"away"`
	ChannelCommander bool   `json:"channelCommander"`
	IsQuery          bool   `json:"isQuery"`
}

type ChannelSummary struct {
	ID              int    `json:"id"`
	ParentID        int    `json:"parentId"`
	Order           int    `json:"order"`
	Name            string `json:"name"`
	Topic           string `json:"topic"`
	TotalClients    int    `json:"totalClients"`
	MaxClients      int    `json:"maxClients"`
	NeededTalkPower int    `json:"neededTalkPower"`
	IsPermanent     bool   `json:"isPermanent"`
	IsSemiPermanent bool   `json:"isSemiPermanent"`
	IsDefault       bool   `json:"isDefault"`
	HasPassword     bool   `json:"hasPassword"`
}

type ViewerNode struct {
	ID       string       `json:"id"`
	Label    string       `json:"label"`
	Kind     string       `json:"kind"`
	Meta     string       `json:"meta,omitempty"`
	Children []ViewerNode `json:"children,omitempty"`
}

type ViewerData struct {
	ServerInfo ServerInfo   `json:"serverInfo"`
	QueryUser  QueryUser    `json:"queryUser"`
	Tree       []ViewerNode `json:"tree"`
}

type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Channel   string    `json:"channel"`
	ServerID  int       `json:"serverId"`
	Message   string    `json:"message"`
}

type ChartPoint struct {
	Label string `json:"label"`
	Value int    `json:"value"`
}

type DashboardData struct {
	ServerInfo          ServerInfo      `json:"serverInfo"`
	QueryUser           QueryUser       `json:"queryUser"`
	ClientsOnline       []ClientSummary `json:"clientsOnline"`
	Logs                []LogEntry      `json:"logs"`
	ConnectionsByDay    []ChartPoint    `json:"connectionsByDay"`
	LogLevels           []ChartPoint    `json:"logLevels"`
	ChannelsByOccupancy []ChartPoint    `json:"channelsByOccupancy"`
}

func Connect(ctx context.Context, options ConnectOptions) (*Client, error) {
	options, err := normalizeConnectOptions(options)
	if err != nil {
		return nil, err
	}

	address := net.JoinHostPort(options.Host, strconv.Itoa(options.QueryPort))
	dialer := net.Dialer{Timeout: queryDialTimeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = conn.SetDeadline(time.Time{})
	}()

	client := &Client{
		conn:    conn,
		reader:  bufio.NewReader(conn),
		address: address,
		options: options,
	}

	handshakeDeadline, hasDeadline := ctx.Deadline()
	if !hasDeadline {
		handshakeDeadline = time.Now().Add(queryHandshakeTimeout)
	}
	if err := conn.SetDeadline(handshakeDeadline); err != nil {
		_ = conn.Close()
		return nil, err
	}

	if err := client.readGreeting(); err != nil {
		_ = conn.Close()
		return nil, err
	}

	if _, err := client.exec("login", map[string]string{
		"client_login_name":     options.Username,
		"client_login_password": options.Password,
	}, nil); err != nil {
		_ = conn.Close()
		return nil, err
	}

	return client, nil
}

func normalizeConnectOptions(options ConnectOptions) (ConnectOptions, error) {
	options.Host = strings.TrimSpace(options.Host)
	options.Username = strings.TrimSpace(options.Username)
	options.Nickname = strings.TrimSpace(options.Nickname)
	options.Protocol = strings.TrimSpace(options.Protocol)

	if options.Host == "" {
		return ConnectOptions{}, errors.New("必须填写主机地址")
	}

	if options.QueryPort == 0 {
		options.QueryPort = defaultQueryPort
	}

	if options.QueryPort < 1 || options.QueryPort > 65535 {
		return ConnectOptions{}, errors.New("Query 端口必须在 1 到 65535 之间")
	}

	if options.Protocol == "" {
		options.Protocol = "raw"
	}

	if !strings.EqualFold(options.Protocol, "raw") {
		return ConnectOptions{}, errors.New("当前 Go 后端仅支持原生查询协议")
	}

	options.Protocol = "raw"
	return options, nil
}

func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return nil
	}

	_, _ = fmt.Fprintf(c.conn, "quit\n")
	err := c.conn.Close()
	c.conn = nil

	return err
}

func (c *Client) Options() ConnectOptions {
	return c.options
}

func (c *Client) SelectedServerID() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.selectedServerID
}

func (c *Client) SessionState() (map[string]any, error) {
	servers, err := c.ServerList()
	if err != nil {
		return nil, err
	}

	state := map[string]any{
		"address":          c.address,
		"selectedServerId": c.selectedServerID,
		"servers":          servers,
	}

	if c.selectedServerID > 0 {
		queryUser, err := c.WhoAmI()
		if err == nil {
			state["queryUser"] = queryUser
		}
	}

	return state, nil
}

func (c *Client) SelectServer(serverID int) error {
	if serverID <= 0 {
		return errors.New("服务器 ID 必须大于 0")
	}

	if _, err := c.exec("use", map[string]string{
		"sid": strconv.Itoa(serverID),
	}, []string{"-virtual"}); err != nil {
		return err
	}

	c.selectedServerID = serverID
	return nil
}

func (c *Client) UpdateNickname(nickname string) error {
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		return nil
	}

	_, err := c.exec("clientupdate", map[string]string{
		"client_nickname": nickname,
	}, nil)
	return err
}

func (c *Client) ServerList() ([]ServerSummary, error) {
	records, err := c.exec("serverlist", nil, []string{"-uid", "-all"})
	if err != nil {
		return nil, err
	}

	servers := make([]ServerSummary, 0, len(records))
	for _, record := range records {
		servers = append(servers, ServerSummary{
			ID:            toInt(record["virtualserver_id"]),
			Port:          toInt(record["virtualserver_port"]),
			Name:          record["virtualserver_name"],
			Status:        record["virtualserver_status"],
			ClientsOnline: toInt(record["virtualserver_clientsonline"]),
			MaxClients:    toInt(record["virtualserver_maxclients"]),
			UID:           record["virtualserver_unique_identifier"],
		})
	}

	return servers, nil
}

func (c *Client) ServerInfo() (ServerInfo, error) {
	records, err := c.exec("serverinfo", nil, nil)
	if err != nil {
		return ServerInfo{}, err
	}

	if len(records) == 0 {
		return ServerInfo{}, errors.New("serverinfo 响应为空")
	}

	record := records[0]

	return ServerInfo{
		ID:               toInt(record["virtualserver_id"]),
		Name:             record["virtualserver_name"],
		Status:           record["virtualserver_status"],
		Port:             toInt(record["virtualserver_port"]),
		ClientsOnline:    toInt(record["virtualserver_clientsonline"]),
		MaxClients:       toInt(record["virtualserver_maxclients"]),
		ChannelsOnline:   toInt(record["virtualserver_channelsonline"]),
		UptimeSeconds:    toInt(record["virtualserver_uptime"]),
		QueryConnections: toInt(record["connection_client_connections"]),
		Version:          record["virtualserver_version"],
		Platform:         record["virtualserver_platform"],
		HostMessage:      record["virtualserver_hostmessage"],
	}, nil
}

func (c *Client) WhoAmI() (QueryUser, error) {
	records, err := c.exec("whoami", nil, nil)
	if err != nil {
		return QueryUser{}, err
	}

	if len(records) == 0 {
		return QueryUser{}, errors.New("whoami 响应为空")
	}

	record := records[0]

	return QueryUser{
		ClientID:       toInt(record["client_id"]),
		ChannelID:      toInt(record["client_channel_id"]),
		DatabaseID:     toInt(record["client_database_id"]),
		Nickname:       record["client_nickname"],
		LoginName:      record["client_login_name"],
		UniqueID:       record["client_unique_identifier"],
		VirtualServer:  toInt(record["virtualserver_id"]),
		VirtualPort:    toInt(record["virtualserver_port"]),
		ServerStatus:   record["virtualserver_status"],
		ServerUniqueID: record["virtualserver_unique_identifier"],
	}, nil
}

func (c *Client) ClientList() ([]ClientSummary, error) {
	records, err := c.exec("clientlist", nil, []string{"-uid", "-away", "-voice", "-times", "-country"})
	if err != nil {
		return nil, err
	}

	clients := make([]ClientSummary, 0, len(records))
	for _, record := range records {
		clients = append(clients, ClientSummary{
			ID:               toInt(record["clid"]),
			DatabaseID:       toInt(record["client_database_id"]),
			ChannelID:        toInt(record["cid"]),
			Nickname:         record["client_nickname"],
			UniqueID:         record["client_unique_identifier"],
			Platform:         record["client_platform"],
			Version:          record["client_version"],
			Country:          record["client_country"],
			IdleTime:         toInt64(record["client_idle_time"]),
			InputMuted:       record["client_input_muted"] == "1",
			OutputMuted:      record["client_output_muted"] == "1",
			Away:             record["client_away"] == "1",
			ChannelCommander: record["client_is_channel_commander"] == "1",
			IsQuery:          record["client_type"] == "1",
		})
	}

	return clients, nil
}

func (c *Client) ChannelList() ([]ChannelSummary, error) {
	records, err := c.exec("channellist", nil, []string{"-topic", "-flags", "-voice", "-limits"})
	if err != nil {
		return nil, err
	}

	channels := make([]ChannelSummary, 0, len(records))
	for _, record := range records {
		channels = append(channels, ChannelSummary{
			ID:              toInt(record["cid"]),
			ParentID:        toInt(record["pid"]),
			Order:           toInt(record["channel_order"]),
			Name:            record["channel_name"],
			Topic:           record["channel_topic"],
			TotalClients:    toInt(record["total_clients"]),
			MaxClients:      toInt(record["channel_maxclients"]),
			NeededTalkPower: toInt(record["channel_needed_talk_power"]),
			IsPermanent:     record["channel_flag_permanent"] == "1",
			IsSemiPermanent: record["channel_flag_semi_permanent"] == "1",
			IsDefault:       record["channel_flag_default"] == "1",
			HasPassword:     record["channel_flag_password"] == "1",
		})
	}

	sort.Slice(channels, func(i int, j int) bool {
		if channels[i].ParentID == channels[j].ParentID {
			return channels[i].Order < channels[j].Order
		}

		return channels[i].ParentID < channels[j].ParentID
	})

	return channels, nil
}

func (c *Client) Logs(limit int) ([]LogEntry, error) {
	if limit <= 0 {
		limit = 100
	}

	records, err := c.exec("logview", map[string]string{
		"instance": "0",
		"reverse":  "1",
		"lines":    strconv.Itoa(limit),
	}, nil)
	if err != nil {
		return nil, err
	}

	logs := make([]LogEntry, 0, len(records))
	for _, record := range records {
		raw := record["l"]
		if raw == "" {
			continue
		}

		parts := strings.Split(raw, "|")
		if len(parts) < 5 {
			continue
		}

		timestamp, err := time.Parse("2006-01-02 15:04:05.000000", parts[0])
		if err != nil {
			timestamp = time.Time{}
		}

		logs = append(logs, LogEntry{
			Timestamp: timestamp,
			Level:     strings.TrimSpace(parts[1]),
			Channel:   strings.TrimSpace(parts[2]),
			ServerID:  toInt(strings.TrimSpace(parts[3])),
			Message:   strings.Join(parts[4:], "|"),
		})
	}

	sort.Slice(logs, func(i int, j int) bool {
		return logs[i].Timestamp.Before(logs[j].Timestamp)
	})

	return logs, nil
}

func (c *Client) Viewer() (ViewerData, error) {
	serverInfo, err := c.ServerInfo()
	if err != nil {
		return ViewerData{}, err
	}

	queryUser, err := c.WhoAmI()
	if err != nil {
		return ViewerData{}, err
	}

	channels, err := c.ChannelList()
	if err != nil {
		return ViewerData{}, err
	}

	clients, err := c.ClientList()
	if err != nil {
		return ViewerData{}, err
	}

	return ViewerData{
		ServerInfo: serverInfo,
		QueryUser:  queryUser,
		Tree:       buildViewerTree(channels, clients),
	}, nil
}

func (c *Client) Dashboard() (DashboardData, error) {
	serverInfo, err := c.ServerInfo()
	if err != nil {
		return DashboardData{}, err
	}

	queryUser, err := c.WhoAmI()
	if err != nil {
		return DashboardData{}, err
	}

	clients, err := c.ClientList()
	if err != nil {
		return DashboardData{}, err
	}

	channels, err := c.ChannelList()
	if err != nil {
		return DashboardData{}, err
	}

	logs, err := c.Logs(120)
	if err != nil {
		logs = []LogEntry{}
	}

	return DashboardData{
		ServerInfo:          serverInfo,
		QueryUser:           queryUser,
		ClientsOnline:       clients,
		Logs:                logs,
		ConnectionsByDay:    buildConnectionSeries(logs),
		LogLevels:           buildLogLevelSeries(logs),
		ChannelsByOccupancy: buildChannelOccupancySeries(channels),
	}, nil
}

func (c *Client) readGreeting() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	for {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			return err
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "TS3") {
			continue
		}

		if strings.HasPrefix(line, "Welcome") {
			return nil
		}

		if strings.HasPrefix(line, "error ") {
			queryErr := parseQueryError(line)
			if queryErr.ID != 0 {
				return queryErr
			}
			return nil
		}
	}
}

func (c *Client) exec(command string, params map[string]string, flags []string) ([]map[string]string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return nil, errors.New("连接已关闭")
	}

	if wait := queryCommandInterval - time.Since(c.lastCommandAt); !c.lastCommandAt.IsZero() && wait > 0 {
		time.Sleep(wait)
	}

	if err := c.conn.SetDeadline(time.Now().Add(queryCommandTimeout)); err != nil {
		return nil, err
	}

	if _, err := fmt.Fprintf(c.conn, "%s\n", buildCommand(command, params, flags)); err != nil {
		return nil, err
	}
	c.lastCommandAt = time.Now()

	records, err := c.readRecords()
	if err == nil {
		return records, nil
	}
	if !isFloodingError(err) {
		return nil, err
	}

	// TS3 ServerQuery may temporarily reject bursts even with pacing.
	// Wait a bit and retry the same command once.
	time.Sleep(queryFloodRetryDelay)
	if err := c.conn.SetDeadline(time.Now().Add(queryCommandTimeout)); err != nil {
		return nil, err
	}
	if _, retryErr := fmt.Fprintf(c.conn, "%s\n", buildCommand(command, params, flags)); retryErr != nil {
		return nil, retryErr
	}
	c.lastCommandAt = time.Now()

	return c.readRecords()
}

func (c *Client) readRecords() ([]map[string]string, error) {
	lines := make([]string, 0, 2)

	for {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			return nil, err
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "TS3") || strings.HasPrefix(line, "Welcome") {
			continue
		}

		if strings.HasPrefix(line, "notify") {
			continue
		}

		if strings.HasPrefix(line, "error ") {
			queryErr := parseQueryError(line)
			if queryErr.ID != 0 {
				return nil, queryErr
			}

			return parseRecordLines(lines), nil
		}

		lines = append(lines, line)
	}
}

func buildViewerTree(channels []ChannelSummary, clients []ClientSummary) []ViewerNode {
	channelsByParent := make(map[int][]ChannelSummary)
	for _, channel := range channels {
		channelsByParent[channel.ParentID] = append(channelsByParent[channel.ParentID], channel)
	}

	clientsByChannel := make(map[int][]ClientSummary)
	for _, client := range clients {
		clientsByChannel[client.ChannelID] = append(clientsByChannel[client.ChannelID], client)
	}

	var walk func(parentID int) []ViewerNode
	walk = func(parentID int) []ViewerNode {
		items := make([]ViewerNode, 0)
		for _, channel := range channelsByParent[parentID] {
			meta := fmt.Sprintf("%d/%d", channel.TotalClients, channel.MaxClients)
			if channel.MaxClients <= 0 {
				meta = strconv.Itoa(channel.TotalClients)
			}

			node := ViewerNode{
				ID:    fmt.Sprintf("channel-%d", channel.ID),
				Label: channel.Name,
				Kind:  "channel",
				Meta:  meta,
			}

			node.Children = append(node.Children, walk(channel.ID)...)

			for _, client := range clientsByChannel[channel.ID] {
				kind := "client"
				clientMeta := client.Platform
				if client.IsQuery {
					kind = "query"
					clientMeta = "ServerQuery"
				}

				node.Children = append(node.Children, ViewerNode{
					ID:    fmt.Sprintf("client-%d", client.ID),
					Label: client.Nickname,
					Kind:  kind,
					Meta:  clientMeta,
				})
			}

			items = append(items, node)
		}

		return items
	}

	return walk(0)
}

func buildConnectionSeries(logs []LogEntry) []ChartPoint {
	now := time.Now()
	counts := make(map[string]int, 7)

	for i := 6; i >= 0; i-- {
		label := now.AddDate(0, 0, -i).Format("01-02")
		counts[label] = 0
	}

	for _, entry := range logs {
		if entry.Timestamp.IsZero() {
			continue
		}

		label := entry.Timestamp.Format("01-02")
		if _, ok := counts[label]; !ok {
			continue
		}

		message := strings.ToLower(entry.Message)
		if strings.Contains(message, "connected") || strings.Contains(message, "login") {
			counts[label]++
		}
	}

	points := make([]ChartPoint, 0, len(counts))
	for i := 6; i >= 0; i-- {
		label := now.AddDate(0, 0, -i).Format("01-02")
		points = append(points, ChartPoint{Label: label, Value: counts[label]})
	}

	return points
}

func buildLogLevelSeries(logs []LogEntry) []ChartPoint {
	counts := map[string]int{
		"debug":   0,
		"info":    0,
		"warning": 0,
		"error":   0,
	}

	for _, entry := range logs {
		level := strings.ToLower(entry.Level)
		if _, ok := counts[level]; ok {
			counts[level]++
		}
	}

	return []ChartPoint{
		{Label: "调试", Value: counts["debug"]},
		{Label: "信息", Value: counts["info"]},
		{Label: "警告", Value: counts["warning"]},
		{Label: "错误", Value: counts["error"]},
	}
}

func buildChannelOccupancySeries(channels []ChannelSummary) []ChartPoint {
	points := make([]ChartPoint, 0, min(len(channels), 6))
	for index, channel := range channels {
		if index == 6 {
			break
		}

		points = append(points, ChartPoint{
			Label: channel.Name,
			Value: channel.TotalClients,
		})
	}

	return points
}

type QueryError struct {
	ID      int
	Message string
}

func (e QueryError) Error() string {
	if e.Message == "" {
		return "TeamSpeak 查询命令执行失败"
	}

	return e.Message
}

func parseQueryError(line string) QueryError {
	record := parseFields(strings.TrimPrefix(line, "error "))
	return QueryError{
		ID:      toInt(record["id"]),
		Message: record["msg"],
	}
}

func isEmptyResultError(err error) bool {
	var queryErr QueryError
	if !errors.As(err, &queryErr) {
		return false
	}

	if queryErr.ID == 1281 {
		return true
	}

	message := strings.ToLower(strings.TrimSpace(queryErr.Message))
	return strings.Contains(message, "empty result")
}

func isUnsupportedCommandError(err error) bool {
	var queryErr QueryError
	if !errors.As(err, &queryErr) {
		return false
	}

	message := strings.ToLower(strings.TrimSpace(queryErr.Message))
	return strings.Contains(message, "command not found") || strings.Contains(message, "invalid command")
}

func isInvalidParameterError(err error) bool {
	var queryErr QueryError
	if !errors.As(err, &queryErr) {
		return false
	}

	message := strings.ToLower(strings.TrimSpace(queryErr.Message))
	return strings.Contains(message, "invalid parameter") || strings.Contains(message, "convert error")
}

func isFloodingError(err error) bool {
	var queryErr QueryError
	if !errors.As(err, &queryErr) {
		return false
	}

	message := strings.ToLower(strings.TrimSpace(queryErr.Message))
	return strings.Contains(message, "flood")
}

func parseRecordLines(lines []string) []map[string]string {
	records := make([]map[string]string, 0)
	for _, line := range lines {
		if line == "" {
			continue
		}

		for _, rawRecord := range strings.Split(line, "|") {
			records = append(records, parseFields(rawRecord))
		}
	}

	return records
}

func parseFields(raw string) map[string]string {
	result := make(map[string]string)

	for _, part := range strings.Fields(raw) {
		key, value, ok := strings.Cut(part, "=")
		if !ok {
			result[part] = ""
			continue
		}

		result[key] = unescape(value)
	}

	return result
}

func buildCommand(command string, params map[string]string, flags []string) string {
	parts := []string{command}

	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s=%s", key, escape(params[key])))
	}

	parts = append(parts, flags...)

	return strings.Join(parts, " ")
}

func escape(value string) string {
	replacer := strings.NewReplacer(
		"\\", "\\\\",
		"/", "\\/",
		" ", "\\s",
		"|", "\\p",
		"\n", "\\n",
		"\r", "\\r",
		"\t", "\\t",
	)

	return replacer.Replace(value)
}

func unescape(value string) string {
	replacer := strings.NewReplacer(
		"\\s", " ",
		"\\p", "|",
		"\\/", "/",
		"\\\\", "\\",
		"\\n", "\n",
		"\\r", "\r",
		"\\t", "\t",
	)

	return replacer.Replace(value)
}

func toInt(value string) int {
	number, _ := strconv.Atoi(value)
	return number
}

func toInt64(value string) int64 {
	number, _ := strconv.ParseInt(value, 10, 64)
	return number
}

func min(a int, b int) int {
	if a < b {
		return a
	}

	return b
}
