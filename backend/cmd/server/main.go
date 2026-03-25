package main

import (
	"log"
	"net/http"

	"ts3-dashboard/backend/internal/config"
	"ts3-dashboard/backend/internal/httpapi"
	"ts3-dashboard/backend/internal/session"
)

func main() {
	cfg := config.Load()
	store := session.NewStore(cfg.SessionTTL)
	server := httpapi.NewServer(cfg, store)

	log.Printf("ts3-dashboard backend listening on %s", cfg.ListenAddr)

	if err := http.ListenAndServe(cfg.ListenAddr, server.Handler()); err != nil {
		log.Fatal(err)
	}
}
