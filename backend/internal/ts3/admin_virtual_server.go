package ts3

import (
	"errors"
	"strconv"
)

type VirtualServerAdminInfo struct {
	Name                                   string `json:"name"`
	NamePhonetic                           string `json:"namePhonetic"`
	Password                               string `json:"password"`
	MaxClients                             int    `json:"maxClients"`
	ReservedSlots                          int    `json:"reservedSlots"`
	WelcomeMessage                         string `json:"welcomeMessage"`
	HostMessage                            string `json:"hostMessage"`
	HostMessageMode                        int    `json:"hostMessageMode"`
	HostBannerGfxURL                       string `json:"hostBannerGfxUrl"`
	HostBannerURL                          string `json:"hostBannerUrl"`
	HostBannerGfxInterval                  int    `json:"hostBannerGfxInterval"`
	HostBannerMode                         int    `json:"hostBannerMode"`
	HostButtonTooltip                      string `json:"hostButtonTooltip"`
	HostButtonURL                          string `json:"hostButtonUrl"`
	HostButtonGfxURL                       string `json:"hostButtonGfxUrl"`
	MaxUploadTotalBandwidth                int    `json:"maxUploadTotalBandwidth"`
	UploadQuota                            int    `json:"uploadQuota"`
	MaxDownloadTotalBandwidth              int    `json:"maxDownloadTotalBandwidth"`
	DownloadQuota                          int    `json:"downloadQuota"`
	AntifloodPointsTickReduce              int    `json:"antifloodPointsTickReduce"`
	AntifloodPointsNeededCommandBlock      int    `json:"antifloodPointsNeededCommandBlock"`
	AntifloodPointsNeededIPBlock           int    `json:"antifloodPointsNeededIpBlock"`
	NeededIdentitySecurityLevel            int    `json:"neededIdentitySecurityLevel"`
	CodecEncryptionMode                    int    `json:"codecEncryptionMode"`
	DefaultServerGroup                     int    `json:"defaultServerGroup"`
	DefaultChannelGroup                    int    `json:"defaultChannelGroup"`
	DefaultChannelAdminGroup               int    `json:"defaultChannelAdminGroup"`
	ComplainAutobanCount                   int    `json:"complainAutobanCount"`
	ComplainAutobanTime                    int    `json:"complainAutobanTime"`
	ComplainRemoveTime                     int    `json:"complainRemoveTime"`
	MinClientsInChannelBeforeForcedSilence int    `json:"minClientsInChannelBeforeForcedSilence"`
	PrioritySpeakerDimmModificator         int    `json:"prioritySpeakerDimmModificator"`
	ChannelTempDeleteDelayDefault          int    `json:"channelTempDeleteDelayDefault"`
	WeblistEnabled                         int    `json:"weblistEnabled"`
	LogClient                              int    `json:"logClient"`
	LogQuery                               int    `json:"logQuery"`
	LogChannel                             int    `json:"logChannel"`
	LogPermissions                         int    `json:"logPermissions"`
	LogServer                              int    `json:"logServer"`
	LogFileTransfer                        int    `json:"logFileTransfer"`
}

type CreateVirtualServerInput struct {
	Name       string
	Port       int
	MaxClients int
}

type CreateVirtualServerResult struct {
	ServerID int    `json:"serverId"`
	Token    string `json:"token"`
}

func (c *Client) VirtualServerAdminInfo() (VirtualServerAdminInfo, error) {
	records, err := c.exec("serverinfo", nil, nil)
	if err != nil {
		return VirtualServerAdminInfo{}, err
	}
	if len(records) == 0 {
		return VirtualServerAdminInfo{}, errors.New("serverinfo 响应为空")
	}

	record := records[0]
	return VirtualServerAdminInfo{
		Name:                                   record["virtualserver_name"],
		NamePhonetic:                           record["virtualserver_name_phonetic"],
		MaxClients:                             toInt(record["virtualserver_maxclients"]),
		ReservedSlots:                          toInt(record["virtualserver_reserved_slots"]),
		WelcomeMessage:                         record["virtualserver_welcomemessage"],
		HostMessage:                            record["virtualserver_hostmessage"],
		HostMessageMode:                        toInt(record["virtualserver_hostmessage_mode"]),
		HostBannerGfxURL:                       record["virtualserver_hostbanner_gfx_url"],
		HostBannerURL:                          record["virtualserver_hostbanner_url"],
		HostBannerGfxInterval:                  toInt(record["virtualserver_hostbanner_gfx_interval"]),
		HostBannerMode:                         toInt(record["virtualserver_hostbanner_mode"]),
		HostButtonTooltip:                      record["virtualserver_hostbutton_tooltip"],
		HostButtonURL:                          record["virtualserver_hostbutton_url"],
		HostButtonGfxURL:                       record["virtualserver_hostbutton_gfx_url"],
		MaxUploadTotalBandwidth:                toInt(record["virtualserver_max_upload_total_bandwidth"]),
		UploadQuota:                            toInt(record["virtualserver_upload_quota"]),
		MaxDownloadTotalBandwidth:              toInt(record["virtualserver_max_download_total_bandwidth"]),
		DownloadQuota:                          toInt(record["virtualserver_download_quota"]),
		AntifloodPointsTickReduce:              toInt(record["virtualserver_antiflood_points_tick_reduce"]),
		AntifloodPointsNeededCommandBlock:      toInt(record["virtualserver_antiflood_points_needed_command_block"]),
		AntifloodPointsNeededIPBlock:           toInt(record["virtualserver_antiflood_points_needed_ip_block"]),
		NeededIdentitySecurityLevel:            toInt(record["virtualserver_needed_identity_security_level"]),
		CodecEncryptionMode:                    toInt(record["virtualserver_codec_encryption_mode"]),
		DefaultServerGroup:                     toInt(record["virtualserver_default_server_group"]),
		DefaultChannelGroup:                    toInt(record["virtualserver_default_channel_group"]),
		DefaultChannelAdminGroup:               toInt(record["virtualserver_default_channel_admin_group"]),
		ComplainAutobanCount:                   toInt(record["virtualserver_complain_autoban_count"]),
		ComplainAutobanTime:                    toInt(record["virtualserver_complain_autoban_time"]),
		ComplainRemoveTime:                     toInt(record["virtualserver_complain_remove_time"]),
		MinClientsInChannelBeforeForcedSilence: toInt(record["virtualserver_min_clients_in_channel_before_forced_silence"]),
		PrioritySpeakerDimmModificator:         toInt(record["virtualserver_priority_speaker_dimm_modificator"]),
		ChannelTempDeleteDelayDefault:          toInt(record["virtualserver_channel_temp_delete_delay_default"]),
		WeblistEnabled:                         toInt(record["virtualserver_weblist_enabled"]),
		LogClient:                              toInt(record["virtualserver_log_client"]),
		LogQuery:                               toInt(record["virtualserver_log_query"]),
		LogChannel:                             toInt(record["virtualserver_log_channel"]),
		LogPermissions:                         toInt(record["virtualserver_log_permissions"]),
		LogServer:                              toInt(record["virtualserver_log_server"]),
		LogFileTransfer:                        toInt(record["virtualserver_log_filetransfer"]),
	}, nil
}

func (c *Client) UpdateVirtualServer(input VirtualServerAdminInfo) error {
	params := map[string]string{
		"virtualserver_name":                                         input.Name,
		"virtualserver_name_phonetic":                                input.NamePhonetic,
		"virtualserver_maxclients":                                   strconv.Itoa(input.MaxClients),
		"virtualserver_reserved_slots":                               strconv.Itoa(input.ReservedSlots),
		"virtualserver_welcomemessage":                               input.WelcomeMessage,
		"virtualserver_hostmessage":                                  input.HostMessage,
		"virtualserver_hostmessage_mode":                             strconv.Itoa(input.HostMessageMode),
		"virtualserver_hostbanner_gfx_url":                           input.HostBannerGfxURL,
		"virtualserver_hostbanner_url":                               input.HostBannerURL,
		"virtualserver_hostbanner_gfx_interval":                      strconv.Itoa(input.HostBannerGfxInterval),
		"virtualserver_hostbanner_mode":                              strconv.Itoa(input.HostBannerMode),
		"virtualserver_hostbutton_tooltip":                           input.HostButtonTooltip,
		"virtualserver_hostbutton_url":                               input.HostButtonURL,
		"virtualserver_hostbutton_gfx_url":                           input.HostButtonGfxURL,
		"virtualserver_max_upload_total_bandwidth":                   strconv.Itoa(input.MaxUploadTotalBandwidth),
		"virtualserver_upload_quota":                                 strconv.Itoa(input.UploadQuota),
		"virtualserver_max_download_total_bandwidth":                 strconv.Itoa(input.MaxDownloadTotalBandwidth),
		"virtualserver_download_quota":                               strconv.Itoa(input.DownloadQuota),
		"virtualserver_antiflood_points_tick_reduce":                 strconv.Itoa(input.AntifloodPointsTickReduce),
		"virtualserver_antiflood_points_needed_command_block":        strconv.Itoa(input.AntifloodPointsNeededCommandBlock),
		"virtualserver_antiflood_points_needed_ip_block":             strconv.Itoa(input.AntifloodPointsNeededIPBlock),
		"virtualserver_needed_identity_security_level":               strconv.Itoa(input.NeededIdentitySecurityLevel),
		"virtualserver_codec_encryption_mode":                        strconv.Itoa(input.CodecEncryptionMode),
		"virtualserver_default_server_group":                         strconv.Itoa(input.DefaultServerGroup),
		"virtualserver_default_channel_group":                        strconv.Itoa(input.DefaultChannelGroup),
		"virtualserver_default_channel_admin_group":                  strconv.Itoa(input.DefaultChannelAdminGroup),
		"virtualserver_complain_autoban_count":                       strconv.Itoa(input.ComplainAutobanCount),
		"virtualserver_complain_autoban_time":                        strconv.Itoa(input.ComplainAutobanTime),
		"virtualserver_complain_remove_time":                         strconv.Itoa(input.ComplainRemoveTime),
		"virtualserver_min_clients_in_channel_before_forced_silence": strconv.Itoa(input.MinClientsInChannelBeforeForcedSilence),
		"virtualserver_priority_speaker_dimm_modificator":            strconv.Itoa(input.PrioritySpeakerDimmModificator),
		"virtualserver_channel_temp_delete_delay_default":            strconv.Itoa(input.ChannelTempDeleteDelayDefault),
		"virtualserver_weblist_enabled":                              strconv.Itoa(input.WeblistEnabled),
		"virtualserver_log_client":                                   strconv.Itoa(input.LogClient),
		"virtualserver_log_query":                                    strconv.Itoa(input.LogQuery),
		"virtualserver_log_channel":                                  strconv.Itoa(input.LogChannel),
		"virtualserver_log_permissions":                              strconv.Itoa(input.LogPermissions),
		"virtualserver_log_server":                                   strconv.Itoa(input.LogServer),
		"virtualserver_log_filetransfer":                             strconv.Itoa(input.LogFileTransfer),
	}
	if input.Password != "" {
		params["virtualserver_password"] = input.Password
	}

	_, err := c.exec("serveredit", params, nil)
	return err
}

func (c *Client) CreateVirtualServer(input CreateVirtualServerInput) (CreateVirtualServerResult, error) {
	params := map[string]string{
		"virtualserver_name":       input.Name,
		"virtualserver_port":       strconv.Itoa(input.Port),
		"virtualserver_maxclients": strconv.Itoa(input.MaxClients),
	}

	records, err := c.exec("servercreate", params, nil)
	if err != nil {
		return CreateVirtualServerResult{}, err
	}
	if len(records) == 0 {
		return CreateVirtualServerResult{}, errors.New("servercreate 响应为空")
	}

	return CreateVirtualServerResult{
		ServerID: toInt(records[0]["sid"]),
		Token:    records[0]["token"],
	}, nil
}
