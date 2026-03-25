package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	ListenAddr     string
	FrontendOrigin string
	CookieName     string
	CookieSecure   bool
	SessionTTL     time.Duration
}

func Load() Config {
	return Config{
		ListenAddr:     getEnv("TS3_DASHBOARD_ADDR", ":8080"),
		FrontendOrigin: getEnv("TS3_DASHBOARD_FRONTEND_ORIGIN", "http://localhost:3000"),
		CookieName:     getEnv("TS3_DASHBOARD_COOKIE_NAME", "ts3_dashboard_session"),
		CookieSecure:   getEnvBool("TS3_DASHBOARD_COOKIE_SECURE", false),
		SessionTTL:     getEnvDuration("TS3_DASHBOARD_SESSION_TTL", 12*time.Hour),
	}
}

func getEnv(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}

	return parsed
}
