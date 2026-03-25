package session

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"ts3-dashboard/backend/internal/ts3"
)

type Session struct {
	ID         string
	Client     *ts3.Client
	CreatedAt  time.Time
	LastUsedAt time.Time
	ExpiresAt  time.Time
}

type Store struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	ttl      time.Duration
}

func NewStore(ttl time.Duration) *Store {
	return &Store{
		sessions: make(map[string]*Session),
		ttl:      ttl,
	}
}

func (s *Store) Create(client *ts3.Client) (*Session, error) {
	id, err := newSessionID()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	session := &Session{
		ID:         id,
		Client:     client,
		CreatedAt:  now,
		LastUsedAt: now,
		ExpiresAt:  now.Add(s.ttl),
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[id] = session

	return session, nil
}

func (s *Store) Get(id string) (*Session, bool) {
	s.mu.RLock()
	session, ok := s.sessions[id]
	s.mu.RUnlock()
	if !ok {
		return nil, false
	}

	if time.Now().After(session.ExpiresAt) {
		s.Delete(id)
		return nil, false
	}

	s.mu.Lock()
	session.LastUsedAt = time.Now()
	session.ExpiresAt = session.LastUsedAt.Add(s.ttl)
	s.mu.Unlock()

	return session, true
}

func (s *Store) Delete(id string) {
	s.mu.Lock()
	session, ok := s.sessions[id]
	if ok {
		delete(s.sessions, id)
	}
	s.mu.Unlock()

	if ok && session.Client != nil {
		_ = session.Client.Close()
	}
}

func newSessionID() (string, error) {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}

	return hex.EncodeToString(buffer), nil
}
