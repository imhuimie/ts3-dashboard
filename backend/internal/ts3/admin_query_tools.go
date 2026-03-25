package ts3

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

func (c *Client) APIKeyList(clientDBPattern string) ([]APIKeyEntry, error) {
	if strings.TrimSpace(clientDBPattern) == "" {
		clientDBPattern = "*"
	}

	records, err := c.exec("apikeylist", map[string]string{
		"cldbid": clientDBPattern,
	}, nil)
	if err != nil {
		return nil, err
	}

	keys := make([]APIKeyEntry, 0, len(records))
	for _, record := range records {
		keys = append(keys, APIKeyEntry{
			ID:         toInt(record["id"]),
			ClientDBID: toInt(record["cldbid"]),
			Scope:      record["scope"],
			CreatedAt:  firstInt64(record["created_at"], record["createdAt"]),
			ExpiresAt:  firstInt64(record["expires_at"], record["expiresAt"]),
		})
	}

	return keys, nil
}

func (c *Client) CreateAPIKey(input CreateAPIKeyInput) (string, error) {
	params := map[string]string{
		"scope": input.Scope,
	}
	if input.ClientDBID > 0 {
		params["cldbid"] = strconv.Itoa(input.ClientDBID)
	}
	if input.Lifetime > 0 {
		params["lifetime"] = strconv.Itoa(input.Lifetime)
	}

	records, err := c.exec("apikeyadd", params, nil)
	if err != nil {
		return "", err
	}
	if len(records) == 0 {
		return "", errors.New("apikeyadd 响应为空")
	}

	return records[0]["apikey"], nil
}

func (c *Client) DeleteAPIKey(id int) error {
	_, err := c.exec("apikeydel", map[string]string{
		"id": strconv.Itoa(id),
	}, nil)
	return err
}

func (c *Client) DeleteClientDB(clientDBID int) error {
	_, err := c.exec("clientdbdelete", map[string]string{
		"cldbid": strconv.Itoa(clientDBID),
	}, nil)
	return err
}

func (c *Client) StartServer(serverID int) error {
	_, err := c.exec("serverstart", map[string]string{
		"sid": strconv.Itoa(serverID),
	}, nil)
	return err
}

func (c *Client) StopServer(serverID int, reason string) error {
	params := map[string]string{
		"sid": strconv.Itoa(serverID),
	}
	if strings.TrimSpace(reason) != "" {
		params["reasonmsg"] = reason
	}

	if _, err := c.exec("serverstop", params, nil); err != nil {
		return err
	}
	if c.SelectedServerID() == serverID {
		c.mu.Lock()
		c.selectedServerID = 0
		c.mu.Unlock()
	}
	return nil
}

func (c *Client) DeleteServer(serverID int) error {
	if _, err := c.exec("serverdelete", map[string]string{
		"sid": strconv.Itoa(serverID),
	}, nil); err != nil {
		return err
	}
	if c.SelectedServerID() == serverID {
		c.mu.Lock()
		c.selectedServerID = 0
		c.mu.Unlock()
	}
	return nil
}

func (c *Client) CopyServerGroup(sourceGroupID int, targetGroupID int, targetName string, groupType int) error {
	if sourceGroupID <= 0 {
		return errors.New("源服务器组 ID 无效")
	}
	if targetGroupID <= 0 && strings.TrimSpace(targetName) == "" {
		return errors.New("必须填写目标服务器组名称")
	}

	_, err := c.exec("servergroupcopy", map[string]string{
		"ssgid": strconv.Itoa(sourceGroupID),
		"tsgid": strconv.Itoa(targetGroupID),
		"name":  targetName,
		"type":  strconv.Itoa(groupType),
	}, nil)
	return err
}

func (c *Client) CopyChannelGroup(sourceGroupID int, targetGroupID int, targetName string, groupType int) error {
	if sourceGroupID <= 0 {
		return errors.New("源频道组 ID 无效")
	}
	if targetGroupID <= 0 && strings.TrimSpace(targetName) == "" {
		return errors.New("必须填写目标频道组名称")
	}

	_, err := c.exec("channelgroupcopy", map[string]string{
		"scgid": strconv.Itoa(sourceGroupID),
		"tcgid": strconv.Itoa(targetGroupID),
		"name":  targetName,
		"type":  strconv.Itoa(groupType),
	}, nil)
	return err
}

func (c *Client) ExecuteConsole(input string) ([]map[string]string, error) {
	command, params, flags, err := parseConsoleInput(input)
	if err != nil {
		return nil, err
	}

	switch command {
	case "quit":
		return nil, errors.New("控制台已禁止执行 quit，请使用面板顶部的断开连接按钮")
	case "use":
		serverID := toInt(params["sid"])
		if serverID <= 0 {
			return nil, errors.New("use 命令必须提供有效的 sid")
		}
		if err := c.SelectServer(serverID); err != nil {
			return nil, err
		}
		return []map[string]string{{
			"ok":                 "true",
			"selected_server_id": strconv.Itoa(serverID),
		}}, nil
	default:
		return c.exec(command, params, flags)
	}
}

func parseConsoleInput(input string) (string, map[string]string, []string, error) {
	parts := strings.Fields(strings.TrimSpace(input))
	if len(parts) == 0 {
		return "", nil, nil, errors.New("必须填写命令")
	}

	command := parts[0]
	params := make(map[string]string)
	flags := make([]string, 0)

	for _, part := range parts[1:] {
		if strings.HasPrefix(part, "-") {
			flags = append(flags, part)
			continue
		}

		key, value, ok := strings.Cut(part, "=")
		if !ok || key == "" {
			return "", nil, nil, fmt.Errorf("无法解析参数：%s", part)
		}
		params[key] = value
	}

	return command, params, flags, nil
}

func firstInt64(values ...string) int64 {
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		return toInt64(value)
	}
	return 0
}
