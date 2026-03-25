package ts3

type ClientDBEntry struct {
	CldbID                 int    `json:"cldbid"`
	ClientNickname         string `json:"clientNickname"`
	ClientUniqueIdentifier string `json:"clientUniqueIdentifier"`
	ClientCreated          int64  `json:"clientCreated"`
	ClientLastConnected    int64  `json:"clientLastconnected"`
	ClientTotalConnections int    `json:"clientTotalconnections"`
	ClientDescription      string `json:"clientDescription"`
	ClientLastIP           string `json:"clientLastip"`
}

type ClientDetail struct {
	ID             int    `json:"id"`
	DatabaseID     int    `json:"databaseId"`
	Nickname       string `json:"nickname"`
	Description    string `json:"description"`
	ServerGroupIDs []int  `json:"serverGroupIds"`
}

type GroupEntry struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Type int    `json:"type"`
}

type BanEntry struct {
	BanID       int    `json:"banid"`
	IP          string `json:"ip"`
	Name        string `json:"name"`
	UID         string `json:"uid"`
	Reason      string `json:"reason"`
	Created     int64  `json:"created"`
	Duration    int64  `json:"duration"`
	InvokerName string `json:"invokerName"`
}

type CreateBanInput struct {
	IP     string
	Name   string
	UID    string
	Reason string
	Time   int
}

type TokenEntry struct {
	Token            string `json:"token"`
	TokenType        int    `json:"tokenType"`
	TokenID1         int    `json:"tokenId1"`
	TokenID2         int    `json:"tokenId2"`
	TokenDescription string `json:"tokenDescription"`
	TokenCreated     int64  `json:"tokenCreated"`
}

type APIKeyEntry struct {
	ID         int    `json:"id"`
	ClientDBID int    `json:"cldbid"`
	Scope      string `json:"scope"`
	CreatedAt  int64  `json:"createdAt"`
	ExpiresAt  int64  `json:"expiresAt"`
}

type CreateTokenInput struct {
	TokenType   int
	TokenID1    int
	TokenID2    int
	Description string
}

type CreateAPIKeyInput struct {
	Scope      string
	ClientDBID int
	Lifetime   int
}

type PermissionEntry struct {
	PermID      int    `json:"permid"`
	PermName    string `json:"permname"`
	PermDesc    string `json:"permdesc"`
	PermValue   *int   `json:"permvalue"`
	PermSkip    *int   `json:"permskip"`
	PermNegated *int   `json:"permnegated"`
}

type PermissionScope string

const (
	PermissionScopeServerGroup   PermissionScope = "server-group"
	PermissionScopeChannelGroup  PermissionScope = "channel-group"
	PermissionScopeChannel       PermissionScope = "channel"
	PermissionScopeClient        PermissionScope = "client"
	PermissionScopeChannelClient PermissionScope = "channel-client"
)

type SavePermissionInput struct {
	Scope       PermissionScope
	TargetID    int
	ChannelID   int
	PermID      int
	PermValue   *int
	PermSkip    *int
	PermNegated *int
}

type PermissionsMeta struct {
	Catalog       []PermissionEntry `json:"catalog"`
	ServerGroups  []GroupEntry      `json:"serverGroups"`
	ChannelGroups []GroupEntry      `json:"channelGroups"`
	Channels      []GroupEntry      `json:"channels"`
	Clients       []ClientDBEntry   `json:"clients"`
}
