package ts3

import (
	"errors"
	"strconv"
)

func (c *Client) TokenList() ([]TokenEntry, error) {
	records, err := c.exec("tokenlist", nil, nil)
	if err != nil {
		if isEmptyResultError(err) {
			return []TokenEntry{}, nil
		}
		return nil, err
	}

	tokens := make([]TokenEntry, 0, len(records))
	for _, record := range records {
		tokens = append(tokens, TokenEntry{
			Token:            record["token"],
			TokenType:        toInt(record["token_type"]),
			TokenID1:         toInt(record["token_id1"]),
			TokenID2:         toInt(record["token_id2"]),
			TokenDescription: record["token_description"],
			TokenCreated:     toInt64(record["token_created"]),
		})
	}

	return tokens, nil
}

func (c *Client) CreateToken(input CreateTokenInput) (string, error) {
	records, err := c.exec("tokenadd", map[string]string{
		"tokentype":        strconv.Itoa(input.TokenType),
		"tokenid1":         strconv.Itoa(input.TokenID1),
		"tokenid2":         strconv.Itoa(input.TokenID2),
		"tokendescription": input.Description,
	}, nil)
	if err != nil {
		return "", err
	}
	if len(records) == 0 {
		return "", errors.New("tokenadd 响应为空")
	}

	return records[0]["token"], nil
}

func (c *Client) DeleteToken(token string) error {
	_, err := c.exec("tokendelete", map[string]string{"token": token}, nil)
	return err
}

func (c *Client) PermissionCatalog() ([]PermissionEntry, error) {
	records, err := c.exec("permissionlist", nil, nil)
	if err != nil {
		return nil, err
	}

	permissions := make([]PermissionEntry, 0, len(records))
	for _, record := range records {
		permissions = append(permissions, PermissionEntry{
			PermID:   toInt(record["permid"]),
			PermName: record["permname"],
			PermDesc: record["permdesc"],
		})
	}

	return permissions, nil
}

func (c *Client) Permissions(scope PermissionScope, targetID int, channelID int) ([]PermissionEntry, error) {
	var command string
	params := map[string]string{}

	switch scope {
	case PermissionScopeServerGroup:
		command = "servergrouppermlist"
		params["sgid"] = strconv.Itoa(targetID)
	case PermissionScopeChannelGroup:
		command = "channelgrouppermlist"
		params["cgid"] = strconv.Itoa(targetID)
	case PermissionScopeChannel:
		command = "channelpermlist"
		params["cid"] = strconv.Itoa(targetID)
	case PermissionScopeClient:
		command = "clientpermlist"
		params["cldbid"] = strconv.Itoa(targetID)
	case PermissionScopeChannelClient:
		if channelID <= 0 {
			return nil, errors.New("频道 ID 无效")
		}
		command = "channelclientpermlist"
		params["cid"] = strconv.Itoa(channelID)
		params["cldbid"] = strconv.Itoa(targetID)
	default:
		return nil, errors.New("不支持的权限作用域")
	}

	records, err := c.exec(command, params, nil)
	if err != nil {
		if isEmptyResultError(err) {
			return []PermissionEntry{}, nil
		}
		return nil, err
	}

	permissions := make([]PermissionEntry, 0, len(records))
	for _, record := range records {
		permissions = append(permissions, PermissionEntry{
			PermID:      toInt(record["permid"]),
			PermName:    record["permname"],
			PermDesc:    record["permdesc"],
			PermValue:   toIntPointer(record["permvalue"]),
			PermSkip:    toIntPointer(record["permskip"]),
			PermNegated: toIntPointer(record["permnegated"]),
		})
	}

	return permissions, nil
}

func (c *Client) SavePermission(input SavePermissionInput) error {
	params := map[string]string{
		"permid": strconv.Itoa(input.PermID),
	}
	if input.PermValue != nil {
		params["permvalue"] = strconv.Itoa(*input.PermValue)
	}
	if input.PermSkip != nil {
		params["permskip"] = strconv.Itoa(*input.PermSkip)
	}
	if input.PermNegated != nil {
		params["permnegated"] = strconv.Itoa(*input.PermNegated)
	}

	var command string
	switch input.Scope {
	case PermissionScopeServerGroup:
		command = "servergroupaddperm"
		params["sgid"] = strconv.Itoa(input.TargetID)
	case PermissionScopeChannelGroup:
		command = "channelgroupaddperm"
		params["cgid"] = strconv.Itoa(input.TargetID)
	case PermissionScopeChannel:
		command = "channeladdperm"
		params["cid"] = strconv.Itoa(input.TargetID)
	case PermissionScopeClient:
		command = "clientaddperm"
		params["cldbid"] = strconv.Itoa(input.TargetID)
	case PermissionScopeChannelClient:
		if input.ChannelID <= 0 {
			return errors.New("频道 ID 无效")
		}
		command = "channelclientaddperm"
		params["cid"] = strconv.Itoa(input.ChannelID)
		params["cldbid"] = strconv.Itoa(input.TargetID)
		delete(params, "permskip")
		delete(params, "permnegated")
	default:
		return errors.New("不支持的权限作用域")
	}

	_, err := c.exec(command, params, nil)
	return err
}

func (c *Client) DeletePermission(scope PermissionScope, targetID int, channelID int, permID int) error {
	params := map[string]string{
		"permid": strconv.Itoa(permID),
	}

	var command string
	switch scope {
	case PermissionScopeServerGroup:
		command = "servergroupdelperm"
		params["sgid"] = strconv.Itoa(targetID)
	case PermissionScopeChannelGroup:
		command = "channelgroupdelperm"
		params["cgid"] = strconv.Itoa(targetID)
	case PermissionScopeChannel:
		command = "channeldelperm"
		params["cid"] = strconv.Itoa(targetID)
	case PermissionScopeClient:
		command = "clientdelperm"
		params["cldbid"] = strconv.Itoa(targetID)
	case PermissionScopeChannelClient:
		if channelID <= 0 {
			return errors.New("频道 ID 无效")
		}
		command = "channelclientdelperm"
		params["cid"] = strconv.Itoa(channelID)
		params["cldbid"] = strconv.Itoa(targetID)
	default:
		return errors.New("不支持的权限作用域")
	}

	_, err := c.exec(command, params, nil)
	return err
}

func toIntPointer(value string) *int {
	if value == "" {
		return nil
	}
	parsed := toInt(value)
	return &parsed
}
