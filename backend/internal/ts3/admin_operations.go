package ts3

import (
	"errors"
	"strconv"
)

type ChannelCreateInput struct {
	Name         string
	ParentID     int
	Topic        string
	Password     string
	MaxClients   int
	Type         string
	OrderAfterID int
}

type ChannelUpdateInput struct {
	ChannelID    int
	Name         string
	ParentID     int
	Topic        string
	Password     string
	MaxClients   int
	Type         string
	OrderAfterID int
}

type ChannelMoveInput struct {
	ChannelID    int
	ParentID     int
	OrderAfterID int
}

type ClientKickInput struct {
	ClientID int
	Reason   string
	Mode     string
}

type ClientMoveInput struct {
	ClientID        int
	TargetChannelID int
	ChannelPassword string
}

type ClientBanInput struct {
	ClientID int
	Reason   string
	Time     int
}

type ClientUpdateInput struct {
	ClientID       int
	Description    string
	ServerGroupIDs []int
}

func (c *Client) CreateChannel(input ChannelCreateInput) (int, error) {
	params := buildChannelParams(input.Name, input.ParentID, input.Topic, input.Password, input.MaxClients, input.Type)

	records, err := c.exec("channelcreate", params, nil)
	if err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return 0, errors.New("channelcreate 响应为空")
	}

	channelID := toInt(records[0]["cid"])
	if input.ParentID > 0 || input.OrderAfterID > 0 {
		if err := c.MoveChannel(ChannelMoveInput{ChannelID: channelID, ParentID: input.ParentID, OrderAfterID: input.OrderAfterID}); err != nil {
			return channelID, err
		}
	}

	return channelID, nil
}

func (c *Client) UpdateChannel(input ChannelUpdateInput) error {
	params := buildChannelParams(input.Name, input.ParentID, input.Topic, input.Password, input.MaxClients, input.Type)
	params["cid"] = strconv.Itoa(input.ChannelID)

	if _, err := c.exec("channeledit", params, nil); err != nil {
		return err
	}

	if input.ParentID > 0 || input.OrderAfterID >= 0 {
		return c.MoveChannel(ChannelMoveInput{ChannelID: input.ChannelID, ParentID: input.ParentID, OrderAfterID: input.OrderAfterID})
	}

	return nil
}

func (c *Client) MoveChannel(input ChannelMoveInput) error {
	params := map[string]string{
		"cid": strconv.Itoa(input.ChannelID),
	}
	params["cpid"] = strconv.Itoa(input.ParentID)
	params["order"] = strconv.Itoa(input.OrderAfterID)
	_, err := c.exec("channelmove", params, nil)
	return err
}

func (c *Client) DeleteChannel(channelID int, force bool) error {
	params := map[string]string{
		"cid": strconv.Itoa(channelID),
	}
	if force {
		params["force"] = "1"
	}

	_, err := c.exec("channeldelete", params, nil)
	return err
}

func (c *Client) KickClient(input ClientKickInput) error {
	if input.ClientID <= 0 {
		return errors.New("客户端 ID 必须大于 0")
	}

	reasonID := "4"
	if input.Mode == "channel" {
		reasonID = "5"
	}

	_, err := c.exec("clientkick", map[string]string{
		"clid":      strconv.Itoa(input.ClientID),
		"reasonid":  reasonID,
		"reasonmsg": input.Reason,
	}, nil)
	return err
}

func (c *Client) MoveClient(input ClientMoveInput) error {
	if input.ClientID <= 0 {
		return errors.New("客户端 ID 必须大于 0")
	}
	if input.TargetChannelID <= 0 {
		return errors.New("目标频道 ID 必须大于 0")
	}

	params := map[string]string{
		"clid": strconv.Itoa(input.ClientID),
		"cid":  strconv.Itoa(input.TargetChannelID),
	}
	if input.ChannelPassword != "" {
		params["cpw"] = input.ChannelPassword
	}

	_, err := c.exec("clientmove", params, nil)
	return err
}

func (c *Client) BanClient(input ClientBanInput) error {
	if input.ClientID <= 0 {
		return errors.New("客户端 ID 必须大于 0")
	}

	clients, err := c.ClientList()
	if err != nil {
		return err
	}

	for _, client := range clients {
		if client.ID != input.ClientID {
			continue
		}

		return c.AddBan(CreateBanInput{
			Name:   client.Nickname,
			UID:    client.UniqueID,
			Reason: input.Reason,
			Time:   input.Time,
		})
	}

	return errors.New("未找到客户端")
}

func (c *Client) UpdateClient(input ClientUpdateInput) error {
	detail, err := c.ClientDetail(input.ClientID)
	if err != nil {
		return err
	}
	if err := c.UpdateClientDescription(input.ClientID, input.Description); err != nil {
		return err
	}

	current := make(map[int]bool, len(detail.ServerGroupIDs))
	for _, groupID := range detail.ServerGroupIDs {
		current[groupID] = true
	}
	target := make(map[int]bool, len(input.ServerGroupIDs))
	for _, groupID := range input.ServerGroupIDs {
		target[groupID] = true
	}

	for groupID := range target {
		if current[groupID] {
			continue
		}
		if err := c.AddClientToServerGroup(groupID, detail.DatabaseID); err != nil {
			return err
		}
	}
	for groupID := range current {
		if target[groupID] {
			continue
		}
		if err := c.RemoveClientFromServerGroup(groupID, detail.DatabaseID); err != nil {
			return err
		}
	}

	return nil
}

func buildChannelParams(name string, parentID int, topic string, password string, maxClients int, channelType string) map[string]string {
	params := map[string]string{
		"channel_name": name,
	}
	if parentID > 0 {
		params["cpid"] = strconv.Itoa(parentID)
	}
	if topic != "" {
		params["channel_topic"] = topic
	}
	if password != "" {
		params["channel_password"] = password
		params["channel_flag_password"] = "1"
	}
	if maxClients > 0 {
		params["channel_maxclients"] = strconv.Itoa(maxClients)
		params["channel_flag_maxclients_unlimited"] = "0"
	} else {
		params["channel_flag_maxclients_unlimited"] = "1"
	}

	switch channelType {
	case "permanent":
		params["channel_flag_permanent"] = "1"
		params["channel_flag_semi_permanent"] = "0"
	case "semi-permanent":
		params["channel_flag_permanent"] = "0"
		params["channel_flag_semi_permanent"] = "1"
	default:
		params["channel_flag_permanent"] = "0"
		params["channel_flag_semi_permanent"] = "0"
	}

	return params
}
