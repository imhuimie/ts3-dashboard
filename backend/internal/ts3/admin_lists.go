package ts3

import (
	"errors"
	"sort"
	"strconv"
	"strings"
)

func (c *Client) ClientDBList() ([]ClientDBEntry, error) {
	start := 0
	duration := 200
	entries := make([]ClientDBEntry, 0)

	for {
		records, err := c.exec("clientdblist", map[string]string{
			"start":    strconv.Itoa(start),
			"duration": strconv.Itoa(duration),
		}, nil)
		if err != nil {
			return nil, err
		}
		if len(records) == 0 {
			break
		}

		for _, record := range records {
			entries = append(entries, ClientDBEntry{
				CldbID:                 toInt(record["cldbid"]),
				ClientNickname:         record["client_nickname"],
				ClientUniqueIdentifier: record["client_unique_identifier"],
				ClientCreated:          toInt64(record["client_created"]),
				ClientLastConnected:    toInt64(record["client_lastconnected"]),
				ClientTotalConnections: toInt(record["client_totalconnections"]),
				ClientDescription:      record["client_description"],
				ClientLastIP:           record["client_lastip"],
			})
		}

		if len(records) < duration {
			break
		}
		start += duration
	}

	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].ClientNickname < entries[j].ClientNickname
	})

	return entries, nil
}

func (c *Client) ClientDetail(clientID int) (ClientDetail, error) {
	records, err := c.exec("clientinfo", map[string]string{"clid": strconv.Itoa(clientID)}, nil)
	if err != nil {
		return ClientDetail{}, err
	}
	if len(records) == 0 {
		return ClientDetail{}, errors.New("clientinfo 响应为空")
	}

	record := records[0]
	serverGroups := make([]int, 0)
	for _, raw := range strings.Split(record["client_servergroups"], ",") {
		if raw == "" {
			continue
		}
		serverGroups = append(serverGroups, toInt(raw))
	}

	return ClientDetail{
		ID:             clientID,
		DatabaseID:     toInt(record["client_database_id"]),
		Nickname:       record["client_nickname"],
		Description:    record["client_description"],
		ServerGroupIDs: serverGroups,
	}, nil
}

func (c *Client) UpdateClientDescription(clientID int, description string) error {
	_, err := c.exec("clientedit", map[string]string{
		"clid":               strconv.Itoa(clientID),
		"client_description": description,
	}, nil)
	return err
}

func (c *Client) ServerGroupList() ([]GroupEntry, error) {
	records, err := c.exec("servergrouplist", nil, nil)
	if err != nil {
		return nil, err
	}

	groups := make([]GroupEntry, 0, len(records))
	for _, record := range records {
		groups = append(groups, GroupEntry{ID: toInt(record["sgid"]), Name: record["name"], Type: toInt(record["type"])})
	}

	return groups, nil
}

func (c *Client) CreateServerGroup(name string, groupType int) (int, error) {
	records, err := c.exec("servergroupadd", map[string]string{"name": name, "type": strconv.Itoa(groupType)}, nil)
	if err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return 0, errors.New("servergroupadd 响应为空")
	}
	return toInt(records[0]["sgid"]), nil
}

func (c *Client) RenameServerGroup(groupID int, name string) error {
	_, err := c.exec("servergrouprename", map[string]string{"sgid": strconv.Itoa(groupID), "name": name}, nil)
	return err
}

func (c *Client) DeleteServerGroup(groupID int) error {
	_, err := c.exec("servergroupdel", map[string]string{"sgid": strconv.Itoa(groupID), "force": "1"}, nil)
	return err
}

func (c *Client) ServerGroupClientList(groupID int) ([]ClientDBEntry, error) {
	records, err := c.exec("servergroupclientlist", map[string]string{"sgid": strconv.Itoa(groupID)}, nil)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return []ClientDBEntry{}, nil
	}
	clients, err := c.ClientDBList()
	if err != nil {
		return nil, err
	}
	byID := make(map[int]ClientDBEntry, len(clients))
	for _, client := range clients {
		byID[client.CldbID] = client
	}
	members := make([]ClientDBEntry, 0, len(records))
	for _, record := range records {
		if client, ok := byID[toInt(record["cldbid"])]; ok {
			members = append(members, client)
		}
	}
	return members, nil
}

func (c *Client) AddClientToServerGroup(groupID int, clientDBID int) error {
	_, err := c.exec("servergroupaddclient", map[string]string{"sgid": strconv.Itoa(groupID), "cldbid": strconv.Itoa(clientDBID)}, nil)
	return err
}

func (c *Client) RemoveClientFromServerGroup(groupID int, clientDBID int) error {
	_, err := c.exec("servergroupdelclient", map[string]string{"sgid": strconv.Itoa(groupID), "cldbid": strconv.Itoa(clientDBID)}, nil)
	return err
}

func (c *Client) ChannelGroupList() ([]GroupEntry, error) {
	records, err := c.exec("channelgrouplist", nil, nil)
	if err != nil {
		return nil, err
	}

	groups := make([]GroupEntry, 0, len(records))
	for _, record := range records {
		groups = append(groups, GroupEntry{ID: toInt(record["cgid"]), Name: record["name"], Type: toInt(record["type"])})
	}

	return groups, nil
}

func (c *Client) CreateChannelGroup(name string, groupType int) (int, error) {
	records, err := c.exec("channelgroupadd", map[string]string{"name": name, "type": strconv.Itoa(groupType)}, nil)
	if err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return 0, errors.New("channelgroupadd 响应为空")
	}
	return toInt(records[0]["cgid"]), nil
}

func (c *Client) RenameChannelGroup(groupID int, name string) error {
	_, err := c.exec("channelgrouprename", map[string]string{"cgid": strconv.Itoa(groupID), "name": name}, nil)
	return err
}

func (c *Client) DeleteChannelGroup(groupID int) error {
	_, err := c.exec("channelgroupdel", map[string]string{"cgid": strconv.Itoa(groupID), "force": "1"}, nil)
	return err
}

func (c *Client) DefaultChannelGroupID() (int, error) {
	records, err := c.exec("serverinfo", nil, nil)
	if err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return 0, errors.New("serverinfo 响应为空")
	}
	return toInt(records[0]["virtualserver_default_channel_group"]), nil
}

func (c *Client) ChannelGroupClientList(groupID int, channelID int) ([]ClientDBEntry, error) {
	records, err := c.exec("channelgroupclientlist", map[string]string{"cgid": strconv.Itoa(groupID), "cid": strconv.Itoa(channelID)}, nil)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return []ClientDBEntry{}, nil
	}
	clients, err := c.ClientDBList()
	if err != nil {
		return nil, err
	}
	byID := make(map[int]ClientDBEntry, len(clients))
	for _, client := range clients {
		byID[client.CldbID] = client
	}
	members := make([]ClientDBEntry, 0, len(records))
	for _, record := range records {
		if client, ok := byID[toInt(record["cldbid"])]; ok {
			members = append(members, client)
		}
	}
	return members, nil
}

func (c *Client) SetClientChannelGroup(groupID int, channelID int, clientDBID int) error {
	_, err := c.exec("setclientchannelgroup", map[string]string{"cgid": strconv.Itoa(groupID), "cid": strconv.Itoa(channelID), "cldbid": strconv.Itoa(clientDBID)}, nil)
	return err
}

func (c *Client) BanList() ([]BanEntry, error) {
	records, err := c.exec("banlist", nil, nil)
	if err != nil {
		return nil, err
	}

	bans := make([]BanEntry, 0, len(records))
	for _, record := range records {
		bans = append(bans, BanEntry{
			BanID:       toInt(record["banid"]),
			IP:          record["ip"],
			Name:        record["name"],
			UID:         record["uid"],
			Reason:      record["reason"],
			Created:     toInt64(record["created"]),
			Duration:    toInt64(record["duration"]),
			InvokerName: record["invokername"],
		})
	}

	return bans, nil
}

func (c *Client) AddBan(input CreateBanInput) error {
	params := map[string]string{
		"banreason": input.Reason,
		"time":      strconv.Itoa(input.Time),
	}
	if input.IP != "" {
		params["ip"] = input.IP
	}
	if input.Name != "" {
		params["name"] = input.Name
	}
	if input.UID != "" {
		params["uid"] = input.UID
	}

	_, err := c.exec("banadd", params, nil)
	return err
}

func (c *Client) DeleteBan(banID int) error {
	_, err := c.exec("bandel", map[string]string{"banid": strconv.Itoa(banID)}, nil)
	return err
}
