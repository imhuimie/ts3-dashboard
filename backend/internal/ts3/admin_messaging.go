package ts3

import "strconv"

type ComplaintEntry struct {
	TargetClientDBID int    `json:"tcldbid"`
	TargetName       string `json:"tname"`
	FromClientDBID   int    `json:"fcldbid"`
	FromName         string `json:"fname"`
	Message          string `json:"message"`
	Timestamp        int64  `json:"timestamp"`
}

func (c *Client) ComplaintList() ([]ComplaintEntry, error) {
	records, err := c.exec("complainlist", nil, nil)
	if err != nil {
		if isEmptyResultError(err) {
			return []ComplaintEntry{}, nil
		}
		return nil, err
	}

	complaints := make([]ComplaintEntry, 0, len(records))
	for _, record := range records {
		complaints = append(complaints, ComplaintEntry{
			TargetClientDBID: toInt(record["tcldbid"]),
			TargetName:       record["tname"],
			FromClientDBID:   toInt(record["fcldbid"]),
			FromName:         record["fname"],
			Message:          record["message"],
			Timestamp:        toInt64(record["timestamp"]),
		})
	}

	return complaints, nil
}

func (c *Client) DeleteComplaint(targetClientDBID int, fromClientDBID int) error {
	_, err := c.exec("complaindel", map[string]string{
		"tcldbid": strconv.Itoa(targetClientDBID),
		"fcldbid": strconv.Itoa(fromClientDBID),
	}, nil)
	return err
}

func (c *Client) SendTextMessage(targetMode int, target int, message string) error {
	_, err := c.exec("sendtextmessage", map[string]string{
		"targetmode": strconv.Itoa(targetMode),
		"target":     strconv.Itoa(target),
		"msg":        message,
	}, nil)
	return err
}
