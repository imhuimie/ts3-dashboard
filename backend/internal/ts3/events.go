package ts3

import (
	"context"
	"strings"
	"time"
)

type Event struct {
	Type      string            `json:"type"`
	Timestamp time.Time         `json:"timestamp"`
	Payload   map[string]string `json:"payload"`
}

func (c *Client) EventClient(ctx context.Context) (*Client, error) {
	eventClient, err := Connect(ctx, c.Options())
	if err != nil {
		return nil, err
	}

	if serverID := c.SelectedServerID(); serverID > 0 {
		if err := eventClient.SelectServer(serverID); err != nil {
			_ = eventClient.Close()
			return nil, err
		}
	}

	for _, params := range []map[string]string{
		{"event": "server"},
		{"event": "channel", "id": "0"},
		{"event": "textserver"},
		{"event": "textchannel"},
		{"event": "textprivate"},
	} {
		if _, err := eventClient.exec("servernotifyregister", params, nil); err != nil {
			_ = eventClient.Close()
			return nil, err
		}
	}

	return eventClient, nil
}

func (c *Client) StreamEvents(ctx context.Context, emit func(Event) error) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line, err := c.reader.ReadString('\n')
		if err != nil {
			return err
		}

		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "error id=0") {
			continue
		}
		if strings.HasPrefix(line, "TS3") || strings.HasPrefix(line, "Welcome") {
			continue
		}
		if !strings.HasPrefix(line, "notify") {
			continue
		}

		event, ok := parseNotification(line)
		if !ok {
			continue
		}
		if err := emit(event); err != nil {
			return err
		}
	}
}

func parseNotification(line string) (Event, bool) {
	command, rawPayload, ok := strings.Cut(line, " ")
	if !ok {
		return Event{}, false
	}

	eventType := mapNotificationType(command)
	if eventType == "" {
		return Event{}, false
	}

	payload := parseFields(rawPayload)
	payload["notifyName"] = command
	return Event{
		Type:      eventType,
		Timestamp: time.Now().UTC(),
		Payload:   payload,
	}, true
}

func mapNotificationType(command string) string {
	switch command {
	case "notifycliententerview":
		return "clientconnect"
	case "notifyclientleftview":
		return "clientdisconnect"
	case "notifyclientmoved":
		return "clientmoved"
	case "notifytokenused":
		return "tokenused"
	case "notifytextmessage":
		return "textmessage"
	case "notifyserveredited":
		return "serveredit"
	case "notifychanneledited":
		return "channeledit"
	case "notifychannelcreated":
		return "channelcreate"
	case "notifychannelmoved":
		return "channelmoved"
	case "notifychanneldeleted":
		return "channeldelete"
	default:
		return ""
	}
}
