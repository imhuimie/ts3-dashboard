package ts3

import (
	"errors"
	"strconv"
)

func (c *Client) PokeClient(clientID int, message string) error {
	_, err := c.exec("clientpoke", map[string]string{
		"clid": strconv.Itoa(clientID),
		"msg":  message,
	}, nil)
	return err
}

func (c *Client) CreateServerSnapshot() (string, error) {
	records, err := c.exec("serversnapshotcreate", nil, nil)
	if err != nil {
		return "", err
	}
	if len(records) == 0 {
		return "", errors.New("serversnapshotcreate 响应为空")
	}
	return records[0]["snapshot"], nil
}

func (c *Client) DeployServerSnapshot(snapshot string) error {
	_, err := c.exec("serversnapshotdeploy", map[string]string{
		"virtualserver_snapshot": snapshot,
	}, nil)
	return err
}
