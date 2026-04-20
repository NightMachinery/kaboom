package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	mathrand "math/rand"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type App struct {
	rootDir   string
	playsets  map[string]Playset
	cards     map[string]Card
	rooms     map[string]*Room
	roomsMu   sync.RWMutex
	upgrader  websocket.Upgrader
	rng       *mathrand.Rand
	rngMu     sync.Mutex
	roomTTL   time.Duration
	roomSweep time.Duration
}

type Playset struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Players      string   `json:"players"`
	MinPlayers   int      `json:"min_players"`
	MaxPlayers   int      `json:"max_players"`
	Emoji        string   `json:"emoji"`
	Primaries    []string `json:"primaries"`
	Cards        []string `json:"cards"`
	DefaultCards []string `json:"default_cards"`
	OddCard      string   `json:"odd_card"`
	Shuffle      bool     `json:"shuffle"`
	NoBury       bool     `json:"no_bury"`
	ForceBury    bool     `json:"force_bury"`
}

type Card struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	ColorName   string   `json:"color_name"`
	Src         string   `json:"src"`
	Primary     bool     `json:"primary"`
	Links       []string `json:"links"`
	PauseGameNr int      `json:"pausegamenr"`
}

type Room struct {
	mu                  sync.Mutex
	Code                string
	CreatedAt           int64
	UpdatedAt           time.Time
	Closed              bool
	Phase               string
	Players             map[string]*Player
	PlaysetID           string
	PlayWithBury        bool
	SelectedRoundTab    string
	RoundConfig         []RoundConfig
	Game                *GameState
	LastGeneratedRoomID int
}

type Player struct {
	ID              string
	Name            string
	GuestTokenHash  string
	RoomSessionHash string
	IsHost          bool
	Ready           bool
	Connected       bool
	Conn            *websocket.Conn
	ConnMu          sync.Mutex
	StartingRoom    int
	FirstLeader     bool
	Card            string
	ReadyForRound   int
	LastSeenAt      int64
}

type RoundConfig struct {
	Time      int   `json:"time"`
	Hostages  int   `json:"hostages"`
	StartedAt int64 `json:"started_at,omitempty"`
	Ended     bool  `json:"ended,omitempty"`
}

type SwapRequest struct {
	InitID string `json:"initId"`
	WithID string `json:"withId"`
}

type GameState struct {
	CreatedAt      int64         `json:"created_at"`
	Phase          string        `json:"phase"`
	Round          int           `json:"round"`
	Rounds         []RoundConfig `json:"rounds"`
	PlaysetID      string        `json:"playsetId"`
	BuriedCard     string        `json:"buriedCard,omitempty"`
	CardsInGame    []string      `json:"cardsInGame"`
	SoberCard      string        `json:"soberCard,omitempty"`
	SwapRequests   []SwapRequest `json:"swapRequests"`
	ReadyForRound  int           `json:"readyForRound"`
	Paused         bool          `json:"paused"`
	TimeToReveal   bool          `json:"timeToReveal"`
	PauseGameIndex int           `json:"pauseGameIndex"`
	ColorReveal    bool          `json:"color_reveal"`
	RemoteMode     bool          `json:"remote_mode"`
}

type playerSnapshot struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Host          bool   `json:"host,omitempty"`
	Ready         bool   `json:"ready,omitempty"`
	Connected     bool   `json:"connected,omitempty"`
	StartingRoom  int    `json:"startingRoom,omitempty"`
	FirstLeader   bool   `json:"firstLeader,omitempty"`
	Card          string `json:"card,omitempty"`
	ReadyForRound int    `json:"readyForRound,omitempty"`
}

type roomState struct {
	Code             string           `json:"code"`
	Phase            string           `json:"phase"`
	PlaysetID        string           `json:"playsetId,omitempty"`
	PlayWithBury     bool             `json:"playWithBury"`
	SelectedRoundTab string           `json:"selectedRoundTab"`
	RoundConfig      []RoundConfig    `json:"roundConfig"`
	Game             *GameState       `json:"game,omitempty"`
	Players          []playerSnapshot `json:"players"`
	MeID             string           `json:"meId"`
	IsHost           bool             `json:"isHost"`
}

type envelope struct {
	Type    string          `json:"type"`
	State   *roomState      `json:"state,omitempty"`
	Message string          `json:"message,omitempty"`
	Event   string          `json:"event,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type roomCreateRequest struct {
	GuestToken  string `json:"guestToken"`
	DisplayName string `json:"displayName"`
}

type roomJoinRequest struct {
	GuestToken       string `json:"guestToken"`
	DisplayName      string `json:"displayName"`
	RoomSessionToken string `json:"roomSessionToken"`
}

type roomJoinResponse struct {
	Code             string `json:"code"`
	PlayerID         string `json:"playerId"`
	RoomSessionToken string `json:"roomSessionToken"`
	Phase            string `json:"phase"`
}

type clientEvent struct {
	Type    string          `json:"type"`
	Action  string          `json:"action,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type setReadyPayload struct {
	Ready bool `json:"ready"`
}

type kickPayload struct {
	PlayerID string `json:"playerId"`
}

type selectPlaysetPayload struct {
	PlaysetID string `json:"playsetId"`
}

type boolPayload struct {
	Value bool `json:"value"`
}

type roundTabPayload struct {
	Value string `json:"value"`
}

type roundConfigPayload struct {
	Rounds []RoundConfig `json:"rounds"`
}

type gameActionPayload struct {
	Action string            `json:"action"`
	Args   []json.RawMessage `json:"args"`
}

func main() {
	rootDir := os.Getenv("KABOOM_ROOT_DIR")
	if rootDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			log.Fatalf("getwd: %v", err)
		}
		rootDir = cwd
	}

	playsets, cards, err := loadLocalData(rootDir)
	if err != nil {
		log.Fatalf("load local data: %v", err)
	}

	app := &App{
		rootDir:  rootDir,
		playsets: playsets,
		cards:    cards,
		rooms:    map[string]*Room{},
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		rng:       mathrand.New(mathrand.NewSource(time.Now().UnixNano())),
		roomTTL:   24 * time.Hour,
		roomSweep: 10 * time.Minute,
	}

	go app.sweepRoomsLoop()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", app.handleHealthz)
	mux.HandleFunc("/api/rooms", app.handleCreateRoom)
	mux.HandleFunc("/api/rooms/", app.handleRooms)
	mux.HandleFunc("/ws", app.handleWebSocket)

	addr := os.Getenv("KABOOM_ADDR")
	if addr == "" {
		addr = "127.0.0.1:18084"
	}

	log.Printf("kaboom backend listening on %s", addr)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	var req roomCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if strings.TrimSpace(req.GuestToken) == "" {
		writeError(w, http.StatusBadRequest, "guest_token_required")
		return
	}
	name := sanitizeName(req.DisplayName)
	if name == "" {
		writeError(w, http.StatusBadRequest, "display_name_required")
		return
	}

	code := a.randomRoomCode()
	guestHash := hashToken(req.GuestToken)
	sessionToken := randomHex(24)
	sessionHash := hashToken(sessionToken)
	now := time.Now()
	room := &Room{
		Code:             code,
		CreatedAt:        now.UnixMilli(),
		UpdatedAt:        now,
		Phase:            "lobby",
		Players:          map[string]*Player{},
		PlaysetID:        defaultPlaysetID(a.playsets),
		PlayWithBury:     false,
		SelectedRoundTab: "recommended",
	}
	player := &Player{
		ID:              "HOST",
		Name:            name,
		GuestTokenHash:  guestHash,
		RoomSessionHash: sessionHash,
		IsHost:          true,
		Ready:           true,
		Connected:       false,
		LastSeenAt:      now.UnixMilli(),
	}
	room.Players[player.ID] = player
	room.RoundConfig = generateDefaultRounds(len(room.Players))
	a.roomsMu.Lock()
	a.rooms[room.Code] = room
	a.roomsMu.Unlock()

	writeJSON(w, http.StatusCreated, roomJoinResponse{Code: code, PlayerID: player.ID, RoomSessionToken: sessionToken, Phase: room.Phase})
}

func (a *App) handleRooms(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) != 2 || parts[1] != "join" {
		http.NotFound(w, r)
		return
	}
	code := strings.ToUpper(parts[0])
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	var req roomJoinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if strings.TrimSpace(req.GuestToken) == "" {
		writeError(w, http.StatusBadRequest, "guest_token_required")
		return
	}
	name := sanitizeName(req.DisplayName)
	guestHash := hashToken(req.GuestToken)
	a.roomsMu.RLock()
	room := a.rooms[code]
	a.roomsMu.RUnlock()
	if room == nil || room.Closed {
		writeError(w, http.StatusNotFound, "room_not_found")
		return
	}

	player, roomSessionToken, err := a.joinRoom(room, guestHash, name, req.RoomSessionToken)
	if err != nil {
		switch err.Error() {
		case "display_name_required":
			writeError(w, http.StatusBadRequest, err.Error())
		case "game_started":
			writeError(w, http.StatusConflict, err.Error())
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}

	writeJSON(w, http.StatusOK, roomJoinResponse{Code: room.Code, PlayerID: player.ID, RoomSessionToken: roomSessionToken, Phase: room.Phase})
}

func (a *App) joinRoom(room *Room, guestHash, name, suppliedSessionToken string) (*Player, string, error) {
	room.mu.Lock()
	defer room.mu.Unlock()
	room.UpdatedAt = time.Now()
	sessionHash := ""
	if suppliedSessionToken != "" {
		sessionHash = hashToken(suppliedSessionToken)
	}

	if sessionHash != "" {
		for _, player := range room.Players {
			if player.RoomSessionHash == sessionHash {
				if name != "" {
					player.Name = name
				}
				return player, suppliedSessionToken, nil
			}
		}
	}

	for _, player := range room.Players {
		if player.GuestTokenHash == guestHash {
			if name != "" {
				player.Name = name
			}
			newToken := randomHex(24)
			player.RoomSessionHash = hashToken(newToken)
			return player, newToken, nil
		}
	}

	if room.Phase != "lobby" {
		return nil, "", errors.New("game_started")
	}
	if name == "" {
		return nil, "", errors.New("display_name_required")
	}
	id := a.randomPlayerID(room)
	newToken := randomHex(24)
	player := &Player{ID: id, Name: name, GuestTokenHash: guestHash, RoomSessionHash: hashToken(newToken), LastSeenAt: time.Now().UnixMilli()}
	room.Players[id] = player
	if room.SelectedRoundTab == "recommended" {
		room.RoundConfig = generateDefaultRounds(len(room.Players))
	}
	return player, newToken, nil
}

func (a *App) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("room")))
	token := strings.TrimSpace(r.URL.Query().Get("session"))
	if code == "" || token == "" {
		writeError(w, http.StatusBadRequest, "room_and_session_required")
		return
	}
	a.roomsMu.RLock()
	room := a.rooms[code]
	a.roomsMu.RUnlock()
	if room == nil || room.Closed {
		writeError(w, http.StatusNotFound, "room_not_found")
		return
	}

	conn, err := a.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	player, state, err := a.attachConnection(room, token, conn)
	if err != nil {
		_ = conn.WriteJSON(envelope{Type: "error", Message: err.Error()})
		_ = conn.Close()
		return
	}
	if err := conn.WriteJSON(envelope{Type: "state", State: state}); err != nil {
		a.detachConnection(room, player.ID, conn)
		return
	}
	a.broadcastRoomState(room)

	defer a.detachConnection(room, player.ID, conn)
	defer conn.Close()
	for {
		var event clientEvent
		if err := conn.ReadJSON(&event); err != nil {
			return
		}
		if err := a.handleClientEvent(room, player.ID, event); err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				return
			}
			_ = conn.WriteJSON(envelope{Type: "error", Message: err.Error()})
		}
	}
}

func (a *App) attachConnection(room *Room, sessionToken string, conn *websocket.Conn) (*Player, *roomState, error) {
	room.mu.Lock()
	defer room.mu.Unlock()
	sessionHash := hashToken(sessionToken)
	for _, player := range room.Players {
		if player.RoomSessionHash == sessionHash {
			if player.Conn != nil && player.Conn != conn {
				_ = player.Conn.Close()
			}
			player.Conn = conn
			player.Connected = true
			player.LastSeenAt = time.Now().UnixMilli()
			room.UpdatedAt = time.Now()
			state := snapshotRoomLocked(room, player.ID)
			return player, state, nil
		}
	}
	return nil, nil, errors.New("invalid_room_session")
}

func (a *App) detachConnection(room *Room, playerID string, conn *websocket.Conn) {
	room.mu.Lock()
	defer room.mu.Unlock()
	player := room.Players[playerID]
	if player == nil {
		return
	}
	if player.Conn == conn {
		player.Conn = nil
		player.Connected = false
		player.LastSeenAt = time.Now().UnixMilli()
		room.UpdatedAt = time.Now()
	}
}

func (a *App) handleClientEvent(room *Room, playerID string, event clientEvent) error {
	switch event.Type {
	case "ping":
		return nil
	case "set_ready":
		var payload setReadyPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return errors.New("invalid_payload")
		}
		room.mu.Lock()
		defer room.mu.Unlock()
		player := room.Players[playerID]
		if player == nil {
			return errors.New("player_not_found")
		}
		if room.Phase != "lobby" {
			return errors.New("game_already_started")
		}
		player.Ready = payload.Ready
		if player.IsHost {
			player.Ready = true
		}
		room.UpdatedAt = time.Now()
		go a.broadcastRoomState(room)
		return nil
	case "leave_room":
		room.mu.Lock()
		defer room.mu.Unlock()
		player := room.Players[playerID]
		if player == nil {
			return nil
		}
		if player.IsHost {
			room.Closed = true
			go a.closeRoom(room)
			return nil
		}
		if room.Phase == "lobby" {
			delete(room.Players, playerID)
			if room.SelectedRoundTab == "recommended" {
				room.RoundConfig = generateDefaultRounds(len(room.Players))
			}
		} else {
			player.Connected = false
			if player.Conn != nil {
				_ = player.Conn.Close()
				player.Conn = nil
			}
		}
		room.UpdatedAt = time.Now()
		go a.broadcastRoomState(room)
		return nil
	case "kick_player":
		var payload kickPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return errors.New("invalid_payload")
		}
		room.mu.Lock()
		host := room.Players[playerID]
		if host == nil || !host.IsHost {
			room.mu.Unlock()
			return errors.New("forbidden")
		}
		target := room.Players[payload.PlayerID]
		if target == nil || target.IsHost {
			room.mu.Unlock()
			return nil
		}
		if target.Conn != nil {
			_ = target.Conn.Close()
		}
		delete(room.Players, payload.PlayerID)
		if room.SelectedRoundTab == "recommended" {
			room.RoundConfig = generateDefaultRounds(len(room.Players))
		}
		room.UpdatedAt = time.Now()
		room.mu.Unlock()
		a.broadcastRoomState(room)
		return nil
	case "select_playset":
		var payload selectPlaysetPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return errors.New("invalid_payload")
		}
		room.mu.Lock()
		host := room.Players[playerID]
		if host == nil || !host.IsHost {
			room.mu.Unlock()
			return errors.New("forbidden")
		}
		if _, ok := a.playsets[payload.PlaysetID]; !ok {
			room.mu.Unlock()
			return errors.New("playset_not_found")
		}
		room.PlaysetID = payload.PlaysetID
		room.PlayWithBury = false
		room.UpdatedAt = time.Now()
		room.mu.Unlock()
		a.broadcastRoomState(room)
		return nil
	case "set_play_with_bury":
		var payload boolPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return errors.New("invalid_payload")
		}
		room.mu.Lock()
		host := room.Players[playerID]
		if host == nil || !host.IsHost {
			room.mu.Unlock()
			return errors.New("forbidden")
		}
		room.PlayWithBury = payload.Value
		room.UpdatedAt = time.Now()
		room.mu.Unlock()
		a.broadcastRoomState(room)
		return nil
	case "set_round_tab":
		var payload roundTabPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return errors.New("invalid_payload")
		}
		room.mu.Lock()
		host := room.Players[playerID]
		if host == nil || !host.IsHost {
			room.mu.Unlock()
			return errors.New("forbidden")
		}
		room.SelectedRoundTab = payload.Value
		if payload.Value == "recommended" {
			room.RoundConfig = generateDefaultRounds(len(room.Players))
		}
		room.UpdatedAt = time.Now()
		room.mu.Unlock()
		a.broadcastRoomState(room)
		return nil
	case "set_round_config":
		var payload roundConfigPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return errors.New("invalid_payload")
		}
		room.mu.Lock()
		host := room.Players[playerID]
		if host == nil || !host.IsHost {
			room.mu.Unlock()
			return errors.New("forbidden")
		}
		room.SelectedRoundTab = "custom"
		room.RoundConfig = sanitizeRounds(payload.Rounds)
		room.UpdatedAt = time.Now()
		room.mu.Unlock()
		a.broadcastRoomState(room)
		return nil
	case "start_game":
		room.mu.Lock()
		err := a.startGameLocked(room, playerID)
		room.mu.Unlock()
		if err != nil {
			return err
		}
		a.broadcastRoomState(room)
		return nil
	case "game_action":
		var payload gameActionPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return errors.New("invalid_payload")
		}
		if payload.Action == "do-remote-color-reveal" || payload.Action == "do-remote-card-reveal" {
			return a.handleEphemeralGameAction(room, playerID, payload)
		}
		room.mu.Lock()
		err := a.applyGameActionLocked(room, playerID, payload)
		room.mu.Unlock()
		if err != nil {
			return err
		}
		a.broadcastRoomState(room)
		return nil
	default:
		return errors.New("unsupported_event")
	}
}

func (a *App) handleEphemeralGameAction(room *Room, playerID string, payload gameActionPayload) error {
	room.mu.Lock()
	player := room.Players[playerID]
	if player == nil {
		room.mu.Unlock()
		return errors.New("player_not_found")
	}
	if room.Game == nil {
		room.mu.Unlock()
		return errors.New("game_not_started")
	}
	var targetIDs []string
	var envelopePayload map[string]any
	switch payload.Action {
	case "do-remote-color-reveal":
		if len(payload.Args) != 3 {
			room.mu.Unlock()
			return errors.New("invalid_args")
		}
		_ = json.Unmarshal(payload.Args[0], &targetIDs)
		colorName := jsonString(payload.Args[1])
		var fromPlayer playerSnapshot
		_ = json.Unmarshal(payload.Args[2], &fromPlayer)
		envelopePayload = map[string]any{"color_name": colorName, "from_player": fromPlayer}
	case "do-remote-card-reveal":
		if len(payload.Args) != 3 {
			room.mu.Unlock()
			return errors.New("invalid_args")
		}
		_ = json.Unmarshal(payload.Args[0], &targetIDs)
		var cardRef struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(payload.Args[1], &cardRef)
		var fromPlayer playerSnapshot
		_ = json.Unmarshal(payload.Args[2], &fromPlayer)
		envelopePayload = map[string]any{"card_id": cardRef.ID, "from_player": fromPlayer}
	default:
		room.mu.Unlock()
		return errors.New("unsupported_game_action")
	}

	targets := make([]*Player, 0, len(targetIDs))
	for _, targetID := range targetIDs {
		if target, ok := room.Players[targetID]; ok && target.Conn != nil {
			targets = append(targets, target)
		}
	}
	room.mu.Unlock()

	for _, target := range targets {
		a.sendEvent(target, strings.TrimPrefix(payload.Action, "do-"), envelopePayload)
	}
	return nil
}

func (a *App) startGameLocked(room *Room, playerID string) error {
	host := room.Players[playerID]
	if host == nil || !host.IsHost {
		return errors.New("forbidden")
	}
	if room.Phase != "lobby" {
		return errors.New("game_already_started")
	}
	if len(room.Players) < 3 {
		return errors.New("need_more_players")
	}
	for _, player := range room.Players {
		if !player.IsHost && !player.Ready {
			return errors.New("players_not_ready")
		}
	}
	playset, ok := a.playsets[room.PlaysetID]
	if !ok {
		return errors.New("playset_not_found")
	}

	gameData, assignments, err := a.generateGame(playset, room.PlayWithBury, room.RoundConfig, len(room.Players))
	if err != nil {
		return err
	}
	playerIDs := sortedPlayerIDs(room.Players)
	assignStartingRoomsLocked(room, playerIDs, a.shuffleStrings(playerIDs))
	assignFirstLeadersLocked(room, a.shuffleStrings(playerIDs))
	for idx, playerID := range playerIDs {
		player := room.Players[playerID]
		player.Card = assignments[idx]
		player.ReadyForRound = 1
		player.Ready = false
	}
	gameData.ColorReveal = len(room.Players) > 10
	gameData.RemoteMode = true
	room.Game = gameData
	room.Phase = room.Game.Phase
	room.UpdatedAt = time.Now()
	return nil
}

func assignStartingRoomsLocked(room *Room, playerIDs []string, shuffled []string) {
	rooms := make([]int, 0, len(playerIDs))
	for i := 0; i < len(playerIDs); i++ {
		rooms = append(rooms, (i%2)+1)
	}
	for i, playerID := range shuffled {
		room.Players[playerID].StartingRoom = rooms[i]
	}
}

func assignFirstLeadersLocked(room *Room, playerIDs []string) {
	var room1 []string
	var room2 []string
	for _, playerID := range playerIDs {
		player := room.Players[playerID]
		player.FirstLeader = false
		if player.StartingRoom == 1 {
			room1 = append(room1, playerID)
		} else {
			room2 = append(room2, playerID)
		}
	}
	if len(room1) > 0 {
		room.Players[room1[0]].FirstLeader = true
	}
	if len(room2) > 0 {
		room.Players[room2[0]].FirstLeader = true
	}
}

func (a *App) generateGame(playset Playset, playWithBury bool, rounds []RoundConfig, playerCount int) (*GameState, []string, error) {
	cards, soberCard, err := a.cardsForPlayset(playset, playWithBury, playerCount)
	if err != nil {
		return nil, nil, err
	}
	if len(cards) < playerCount {
		return nil, nil, errors.New("not_enough_cards")
	}
	assignments := append([]string(nil), cards...)
	shuffledAssignments := a.shuffleStrings(assignments)
	cardsInGame := uniqueCardIDs(assignments)
	sort.Slice(cardsInGame, func(i, j int) bool {
		return cardSortKey(cardsInGame[i]) < cardSortKey(cardsInGame[j])
	})
	game := &GameState{
		CreatedAt:      time.Now().UnixMilli(),
		Phase:          "rooms",
		Round:          1,
		Rounds:         cloneRounds(rounds),
		PlaysetID:      playset.ID,
		CardsInGame:    cardsInGame,
		SoberCard:      soberCard,
		SwapRequests:   []SwapRequest{},
		ReadyForRound:  1,
		Paused:         false,
		TimeToReveal:   false,
		PauseGameIndex: 0,
	}
	if playWithBury {
		buried := shuffledAssignments[len(shuffledAssignments)-1]
		game.BuriedCard = buried
		shuffledAssignments = shuffledAssignments[:len(shuffledAssignments)-1]
	}
	return game, shuffledAssignments, nil
}

func (a *App) applyGameActionLocked(room *Room, playerID string, payload gameActionPayload) error {
	if room.Game == nil {
		return errors.New("game_not_started")
	}
	player := room.Players[playerID]
	if player == nil {
		return errors.New("player_not_found")
	}
	switch payload.Action {
	case "request-swap-card":
		if len(payload.Args) != 2 {
			return errors.New("invalid_args")
		}
		initID := jsonString(payload.Args[0])
		withID := jsonString(payload.Args[1])
		if initID != playerID {
			return errors.New("forbidden")
		}
		requests := room.Game.SwapRequests[:0]
		for _, req := range room.Game.SwapRequests {
			if req.InitID != initID && req.WithID != initID {
				requests = append(requests, req)
			}
		}
		room.Game.SwapRequests = append(requests, SwapRequest{InitID: initID, WithID: withID})
	case "accept-swap-card-request":
		if len(payload.Args) != 2 {
			return errors.New("invalid_args")
		}
		initID := jsonString(payload.Args[0])
		withID := jsonString(payload.Args[1])
		if withID != playerID {
			return errors.New("forbidden")
		}
		initPlayer := room.Players[initID]
		withPlayer := room.Players[withID]
		if initPlayer == nil || withPlayer == nil {
			return errors.New("player_not_found")
		}
		initPlayer.Card, withPlayer.Card = withPlayer.Card, initPlayer.Card
		room.Game.SwapRequests = removeSwapRequest(room.Game.SwapRequests, initID)
	case "remove-swap-card-request":
		if len(payload.Args) != 2 {
			return errors.New("invalid_args")
		}
		initID := jsonString(payload.Args[0])
		withID := jsonString(payload.Args[1])
		if initID != playerID && withID != playerID {
			return errors.New("forbidden")
		}
		room.Game.SwapRequests = removeSwapRequest(room.Game.SwapRequests, initID)
	case "get-sober-card":
		if room.Game.SoberCard == "" {
			return nil
		}
		if player.Card == "drunk" {
			player.Card = room.Game.SoberCard
		}
	case "am-in-room":
		if len(payload.Args) != 1 || jsonString(payload.Args[0]) != playerID {
			return errors.New("forbidden")
		}
		player.Ready = true
		allReady := true
		for _, p := range room.Players {
			if !p.Ready {
				allReady = false
				break
			}
		}
		if allReady {
			room.Game.Phase = "rounds"
			startNextRound(room.Game)
			if room.Game.Phase == "boom" && len(pauseGameCards(a.cards, room.Game)) == 0 {
				room.Game.TimeToReveal = true
			}
			room.Phase = room.Game.Phase
		}
	case "ready-for-next-round":
		if len(payload.Args) != 1 || jsonString(payload.Args[0]) != playerID {
			return errors.New("forbidden")
		}
		player.ReadyForRound = room.Game.Round + 1
		allReady := true
		for _, p := range room.Players {
			if p.ReadyForRound != room.Game.Round+1 {
				allReady = false
				break
			}
		}
		if allReady {
			room.Game.Phase = "rounds"
			startNextRound(room.Game)
			if room.Game.Phase == "boom" && len(pauseGameCards(a.cards, room.Game)) == 0 {
				room.Game.TimeToReveal = true
			}
			room.Phase = room.Game.Phase
		}
	case "redirect-to-lobby":
		if !player.IsHost {
			return errors.New("forbidden")
		}
		for _, p := range room.Players {
			p.Card = ""
			p.StartingRoom = 0
			p.FirstLeader = false
			p.ReadyForRound = 0
			p.Ready = p.IsHost
		}
		room.Game = nil
		room.Phase = "lobby"
	case "close-room":
		if !player.IsHost {
			return errors.New("forbidden")
		}
		room.Closed = true
		go a.closeRoom(room)
	case "next-pause-game-number":
		pauseCards := pauseGameCards(a.cards, room.Game)
		if len(pauseCards) == 0 {
			room.Game.TimeToReveal = true
			return nil
		}
		if room.Game.PauseGameIndex >= len(pauseCards)-1 {
			room.Game.TimeToReveal = true
			return nil
		}
		pauseCardID := pauseCards[room.Game.PauseGameIndex]
		target := findPlayerByCard(room.Players, pauseCardID)
		if target != nil && target.ID != playerID && !player.IsHost {
			return nil
		}
		room.Game.PauseGameIndex++
	case "force-start-game":
		if !player.IsHost {
			return errors.New("forbidden")
		}
		room.Game.Phase = "rounds"
		startNextRound(room.Game)
		if room.Game.Phase == "boom" && len(pauseGameCards(a.cards, room.Game)) == 0 {
			room.Game.TimeToReveal = true
		}
		room.Phase = room.Game.Phase
	case "change-color-reveal":
		if !player.IsHost {
			return errors.New("forbidden")
		}
		room.Game.ColorReveal = !room.Game.ColorReveal
	case "change-remote-mode":
		if !player.IsHost {
			return errors.New("forbidden")
		}
		if len(payload.Args) != 1 {
			return errors.New("invalid_args")
		}
		var enabled bool
		if err := json.Unmarshal(payload.Args[0], &enabled); err != nil {
			return errors.New("invalid_args")
		}
		room.Game.RemoteMode = enabled
	case "do-remote-color-reveal", "do-remote-card-reveal":
		// client-only UX event; no server state mutation needed.
		return nil
	default:
		return errors.New("unsupported_game_action")
	}
	room.UpdatedAt = time.Now()
	return nil
}

func pauseGameCards(cards map[string]Card, game *GameState) []string {
	var pauseCards []Card
	for _, id := range game.CardsInGame {
		if id == game.BuriedCard {
			continue
		}
		card, ok := cards[id]
		if !ok || card.PauseGameNr == 0 {
			continue
		}
		pauseCards = append(pauseCards, card)
	}
	sort.Slice(pauseCards, func(i, j int) bool {
		if pauseCards[i].PauseGameNr == pauseCards[j].PauseGameNr {
			return pauseCards[i].Name < pauseCards[j].Name
		}
		return pauseCards[i].PauseGameNr < pauseCards[j].PauseGameNr
	})
	out := make([]string, 0, len(pauseCards))
	for _, card := range pauseCards {
		out = append(out, card.ID)
	}
	return out
}

func startNextRound(game *GameState) {
	ended := 0
	for _, round := range game.Rounds {
		if round.Ended {
			ended++
		}
	}
	if ended == len(game.Rounds) {
		game.Phase = "boom"
		return
	}
	for i := range game.Rounds {
		roundBeforeEnded := i == 0 || game.Rounds[i-1].Ended
		if roundBeforeEnded && game.Rounds[i].StartedAt == 0 {
			game.Rounds[i].StartedAt = time.Now().Unix()
			game.Round = i + 1
			return
		}
	}
}

func removeSwapRequest(requests []SwapRequest, initID string) []SwapRequest {
	filtered := requests[:0]
	for _, req := range requests {
		if req.InitID != initID {
			filtered = append(filtered, req)
		}
	}
	return filtered
}

func findPlayerByCard(players map[string]*Player, cardID string) *Player {
	for _, player := range players {
		if player.Card == cardID {
			return player
		}
	}
	return nil
}

func (a *App) closeRoom(room *Room) {
	room.mu.Lock()
	defer room.mu.Unlock()
	for _, player := range room.Players {
		if player.Conn != nil {
			_ = player.Conn.Close()
			player.Conn = nil
			player.Connected = false
		}
	}
	room.Closed = true
}

func (a *App) broadcastRoomState(room *Room) {
	room.mu.Lock()
	players := sortedPlayers(room.Players)
	states := make([]struct {
		conn  *websocket.Conn
		state *roomState
		pl    *Player
	}, 0, len(players))
	for _, player := range players {
		if player.Conn == nil {
			continue
		}
		states = append(states, struct {
			conn  *websocket.Conn
			state *roomState
			pl    *Player
		}{conn: player.Conn, state: snapshotRoomLocked(room, player.ID), pl: player})
	}
	room.mu.Unlock()
	for _, item := range states {
		item.pl.ConnMu.Lock()
		err := item.conn.WriteJSON(envelope{Type: "state", State: item.state})
		item.pl.ConnMu.Unlock()
		if err != nil {
			_ = item.conn.Close()
		}
	}
}

func (a *App) sendEvent(player *Player, eventName string, payload any) {
	if player == nil || player.Conn == nil {
		return
	}
	player.ConnMu.Lock()
	defer player.ConnMu.Unlock()
	if err := player.Conn.WriteJSON(map[string]any{
		"type":    "event",
		"event":   eventName,
		"payload": payload,
	}); err != nil {
		_ = player.Conn.Close()
	}
}

func snapshotRoomLocked(room *Room, meID string) *roomState {
	players := sortedPlayers(room.Players)
	snaps := make([]playerSnapshot, 0, len(players))
	for _, player := range players {
		snaps = append(snaps, playerSnapshot{
			ID:            player.ID,
			Name:          player.Name,
			Host:          player.IsHost,
			Ready:         player.Ready,
			Connected:     player.Connected || player.IsHost,
			StartingRoom:  player.StartingRoom,
			FirstLeader:   player.FirstLeader,
			Card:          player.Card,
			ReadyForRound: player.ReadyForRound,
		})
	}
	me := room.Players[meID]
	state := &roomState{
		Code:             room.Code,
		Phase:            room.Phase,
		PlaysetID:        room.PlaysetID,
		PlayWithBury:     room.PlayWithBury,
		SelectedRoundTab: room.SelectedRoundTab,
		RoundConfig:      cloneRounds(room.RoundConfig),
		Players:          snaps,
		MeID:             meID,
		IsHost:           me != nil && me.IsHost,
	}
	if room.Game != nil {
		gameCopy := *room.Game
		gameCopy.Rounds = cloneRounds(room.Game.Rounds)
		gameCopy.SwapRequests = append([]SwapRequest(nil), room.Game.SwapRequests...)
		gameCopy.CardsInGame = append([]string(nil), room.Game.CardsInGame...)
		state.Game = &gameCopy
		state.Phase = room.Game.Phase
	}
	return state
}

func defaultPlaysetID(playsets map[string]Playset) string {
	if _, ok := playsets["t0001"]; ok {
		return "t0001"
	}
	for id := range playsets {
		return id
	}
	return ""
}

func loadLocalData(rootDir string) (map[string]Playset, map[string]Card, error) {
	cards := map[string]Card{}
	cardFiles := []string{"blue.json", "red.json", "yellow.json", "grey.json", "green.json", "purple.json", "special.json", "garden.json"}
	for _, name := range cardFiles {
		path := filepath.Join(rootDir, "src", "config", "cards", name)
		var list []Card
		if err := loadJSONFile(path, &list); err != nil {
			return nil, nil, err
		}
		for _, card := range list {
			cards[card.ID] = card
		}
	}
	playsets := map[string]Playset{}
	playsetFiles := []string{"tutorial.json", "official.json", "friends.json", "necroboomicon.json", "dev.json"}
	for _, name := range playsetFiles {
		path := filepath.Join(rootDir, "src", "config", "playsets", name)
		var list []Playset
		if err := loadJSONFile(path, &list); err != nil {
			return nil, nil, err
		}
		for _, playset := range list {
			playsets[playset.ID] = playset
		}
	}
	return playsets, cards, nil
}

func loadJSONFile(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return json.NewDecoder(file).Decode(target)
}

func (a *App) cardsForPlayset(playset Playset, playWithBury bool, playerCount int) ([]string, string, error) {
	defaultCards := append([]string(nil), playset.DefaultCards...)
	if len(defaultCards) == 0 {
		defaultCards = []string{"b000", "r000"}
	}
	outCards := append([]string(nil), playset.Primaries...)
	allCards := append([]string(nil), playset.Cards...)
	if playset.OddCard != "" {
		allCards = append(allCards, playset.OddCard)
	}

	drunkIndex := indexOf(allCards, "drunk")
	playingWithDrunk := drunkIndex >= 0
	if playingWithDrunk {
		allCards = append(allCards[:drunkIndex], allCards[drunkIndex+1:]...)
		outCards = append(outCards, "drunk")
	}

	targetCount := playerCount
	if playWithBury {
		targetCount++
	}
	if playingWithDrunk {
		targetCount++
	}
	cardsNeededCount := targetCount - len(outCards)
	defaultPairsToAdd := 0
	if len(allCards)+len(playset.Primaries) < targetCount {
		n := targetCount - len(allCards)
		defaultPairsToAdd = (n + 1) / 2
	}
	for i := 0; i < defaultPairsToAdd; i++ {
		allCards = append(allCards, defaultCards...)
	}
	allCardsPaired := pairUpCardsFromPoolIDs(allCards, a.cards)
	stats := groupPairStats(allCardsPaired)
	combinations := pairCombinations(stats, cardsNeededCount)
	if len(combinations) == 0 {
		combinations = [][]int{{}}
		for _, pair := range allCardsPaired {
			combinations[0] = append(combinations[0], len(pair))
		}
	}
	if playset.Shuffle {
		shuffledStats := make([]pairStat, 0, len(stats))
		for _, stat := range stats {
			pairs := append([][]string(nil), stat.CardPairs...)
			pairs = a.shufflePairs(pairs)
			shuffledStats = append(shuffledStats, pairStat{PairLength: stat.PairLength, Count: stat.Count, CardPairs: pairs})
		}
		combination := combinations[a.randomInt(len(combinations))]
		for idx, pairLength := range combination {
			stat := findPairStat(shuffledStats, pairLength)
			if stat == nil {
				continue
			}
			pairIndex := countSameBefore(combination, pairLength, idx)
			if pairIndex < len(stat.CardPairs) {
				outCards = append(outCards, stat.CardPairs[pairIndex]...)
			}
		}
	} else {
		sample := make([]int, 0, len(allCardsPaired))
		for _, pair := range allCardsPaired {
			sample = append(sample, len(pair))
		}
		best := sample
		bestScore := -1
		for _, combo := range combinations {
			adapted := adaptCombination(combo, sample)
			score := scoreCombination(adapted, sample)
			if score > bestScore {
				bestScore = score
				best = adapted
			}
		}
		for idx, pairLength := range best {
			stat := findPairStat(stats, pairLength)
			if stat == nil {
				continue
			}
			pairIndex := countSameBefore(best, pairLength, idx)
			if pairIndex < len(stat.CardPairs) {
				outCards = append(outCards, stat.CardPairs[pairIndex]...)
			}
		}
	}

	var soberCard string
	if playingWithDrunk {
		for {
			idx := a.randomInt(len(outCards))
			if outCards[idx] == "drunk" {
				continue
			}
			soberCard = outCards[idx]
			outCards = append(outCards[:idx], outCards[idx+1:]...)
			break
		}
	}
	return outCards, soberCard, nil
}

type pairStat struct {
	PairLength int
	Count      int
	CardPairs  [][]string
}

func pairUpCardsFromPoolIDs(cards []string, cardsMap map[string]Card) [][]string {
	cardsLeft := append([]string(nil), cards...)
	paired := [][]string{}
	for len(cardsLeft) > 0 {
		cardID := cardsLeft[0]
		card := cardsMap[cardID]
		links := append([]string(nil), card.Links...)
		if card.ColorName == "red" {
			links = append([]string{"b" + strings.TrimPrefix(cardID, "r")}, links...)
		}
		if card.ColorName == "blue" {
			links = append([]string{"r" + strings.TrimPrefix(cardID, "b")}, links...)
		}
		picked := []int{}
		pair := []string{cardID}
		for _, link := range links {
			for i := 1; i < len(cardsLeft); i++ {
				if cardsLeft[i] == link {
					picked = append(picked, i)
					pair = append(pair, link)
					break
				}
			}
		}
		for i := len(picked) - 1; i >= 0; i-- {
			index := picked[i]
			cardsLeft = append(cardsLeft[:index], cardsLeft[index+1:]...)
		}
		cardsLeft = cardsLeft[1:]
		paired = append(paired, pair)
	}
	return paired
}

func groupPairStats(pairs [][]string) []pairStat {
	stats := []pairStat{}
	for _, pair := range pairs {
		found := false
		for i := range stats {
			if stats[i].PairLength == len(pair) {
				stats[i].Count++
				stats[i].CardPairs = append(stats[i].CardPairs, pair)
				found = true
				break
			}
		}
		if !found {
			stats = append(stats, pairStat{PairLength: len(pair), Count: 1, CardPairs: [][]string{pair}})
		}
	}
	return stats
}

func pairCombinations(stats []pairStat, target int) [][]int {
	results := [][]int{}
	counts := make([]int, len(stats))
	for i, stat := range stats {
		counts[i] = stat.Count
	}
	var walk func(current []int, currentCount, index int)
	walk = func(current []int, currentCount, index int) {
		if currentCount == target {
			results = append(results, append([]int(nil), current...))
			return
		}
		if currentCount > target {
			return
		}
		for i := index; i < len(stats); i++ {
			if counts[i] <= 0 {
				continue
			}
			counts[i]--
			current = append(current, stats[i].PairLength)
			walk(current, currentCount+stats[i].PairLength, i)
			current = current[:len(current)-1]
			counts[i]++
		}
	}
	walk([]int{}, 0, 0)
	return results
}

func findPairStat(stats []pairStat, pairLength int) *pairStat {
	for i := range stats {
		if stats[i].PairLength == pairLength {
			return &stats[i]
		}
	}
	return nil
}

func countSameBefore(values []int, value, index int) int {
	count := 0
	for i := 0; i < index; i++ {
		if values[i] == value {
			count++
		}
	}
	return count
}

func adaptCombination(combination, sample []int) []int {
	adapted := append([]int(nil), combination...)
	for i := range sample {
		if i >= len(adapted) {
			break
		}
		if adapted[i] == sample[i] {
			continue
		}
		for j := i + 1; j < len(adapted); j++ {
			if adapted[j] == sample[i] {
				adapted[i], adapted[j] = adapted[j], adapted[i]
				break
			}
		}
	}
	return adapted
}

func scoreCombination(combination, sample []int) int {
	score := 0
	index := 0
	for i := range sample {
		if index >= len(combination) {
			break
		}
		if combination[index] == sample[i] {
			score += combination[index]
			index++
		}
	}
	return score
}

func generateDefaultRounds(playerCount int) []RoundConfig {
	switch {
	case playerCount >= 22:
		return []RoundConfig{{Time: 5, Hostages: 5}, {Time: 4, Hostages: 4}, {Time: 3, Hostages: 3}, {Time: 2, Hostages: 2}, {Time: 1, Hostages: 1}}
	case playerCount >= 18:
		return []RoundConfig{{Time: 5, Hostages: 4}, {Time: 4, Hostages: 3}, {Time: 3, Hostages: 2}, {Time: 2, Hostages: 1}, {Time: 1, Hostages: 1}}
	case playerCount >= 14:
		return []RoundConfig{{Time: 5, Hostages: 3}, {Time: 4, Hostages: 2}, {Time: 3, Hostages: 2}, {Time: 2, Hostages: 1}, {Time: 1, Hostages: 1}}
	case playerCount >= 8:
		return []RoundConfig{{Time: 3, Hostages: 2}, {Time: 2, Hostages: 1}, {Time: 2, Hostages: 1}}
	default:
		return []RoundConfig{{Time: 3, Hostages: 2}, {Time: 2, Hostages: 1}, {Time: 1, Hostages: 1}}
	}
}

func sanitizeRounds(rounds []RoundConfig) []RoundConfig {
	out := make([]RoundConfig, 0, len(rounds))
	for _, round := range rounds {
		timeValue := round.Time
		hostages := round.Hostages
		if timeValue < 1 {
			timeValue = 1
		}
		if hostages < 1 {
			hostages = 1
		}
		out = append(out, RoundConfig{Time: timeValue, Hostages: hostages})
	}
	if len(out) == 0 {
		return []RoundConfig{{Time: 3, Hostages: 2}}
	}
	return out
}

func sanitizeName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) > 40 {
		runes = runes[:40]
	}
	return string(runes)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": message})
}

func hashToken(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func randomHex(bytesLen int) string {
	buf := make([]byte, bytesLen)
	_, err := rand.Read(buf)
	if err != nil {
		panic(err)
	}
	return hex.EncodeToString(buf)
}

func (a *App) randomRoomCode() string {
	for {
		letters := make([]byte, 4)
		for i := range letters {
			letters[i] = byte('A' + a.randomInt(26))
		}
		code := string(letters)
		a.roomsMu.RLock()
		_, exists := a.rooms[code]
		a.roomsMu.RUnlock()
		if !exists {
			return code
		}
	}
}

func (a *App) randomPlayerID(room *Room) string {
	for {
		letters := make([]byte, 3)
		for i := range letters {
			letters[i] = byte('A' + a.randomInt(26))
		}
		id := string(letters)
		if _, exists := room.Players[id]; !exists {
			return id
		}
	}
}

func (a *App) randomInt(max int) int {
	if max <= 1 {
		return 0
	}
	a.rngMu.Lock()
	defer a.rngMu.Unlock()
	return a.rng.Intn(max)
}

func (a *App) shuffleStrings(values []string) []string {
	out := append([]string(nil), values...)
	a.rngMu.Lock()
	a.rng.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	a.rngMu.Unlock()
	return out
}

func (a *App) shufflePairs(values [][]string) [][]string {
	out := append([][]string(nil), values...)
	a.rngMu.Lock()
	a.rng.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	a.rngMu.Unlock()
	return out
}

func sortedPlayers(players map[string]*Player) []*Player {
	out := make([]*Player, 0, len(players))
	for _, player := range players {
		out = append(out, player)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsHost != out[j].IsHost {
			return out[i].IsHost
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func sortedPlayerIDs(players map[string]*Player) []string {
	ordered := sortedPlayers(players)
	ids := make([]string, 0, len(ordered))
	for _, player := range ordered {
		ids = append(ids, player.ID)
	}
	return ids
}

func cloneRounds(rounds []RoundConfig) []RoundConfig {
	return append([]RoundConfig(nil), rounds...)
}

func uniqueCardIDs(values []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func cardSortKey(id string) string {
	numeric := 0
	if len(id) >= 4 {
		numeric, _ = strconv.Atoi(id[len(id)-3:])
	}
	return fmt.Sprintf("%06d:%s", numeric, id)
}

func indexOf(values []string, target string) int {
	for i, value := range values {
		if value == target {
			return i
		}
	}
	return -1
}

func jsonString(raw json.RawMessage) string {
	var value string
	_ = json.Unmarshal(raw, &value)
	return value
}

func (a *App) sweepRoomsLoop() {
	ticker := time.NewTicker(a.roomSweep)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		a.roomsMu.Lock()
		for code, room := range a.rooms {
			room.mu.Lock()
			stale := room.Closed || now.Sub(room.UpdatedAt) > a.roomTTL
			room.mu.Unlock()
			if stale {
				delete(a.rooms, code)
			}
		}
		a.roomsMu.Unlock()
	}
}

func wsURL(origin string, values url.Values) string {
	scheme := "ws"
	if strings.HasPrefix(origin, "https://") {
		scheme = "wss"
	}
	parsed, _ := url.Parse(origin)
	parsed.Scheme = scheme
	parsed.Path = "/ws"
	parsed.RawQuery = values.Encode()
	return parsed.String()
}

func (a *App) shutdown(ctx context.Context) error {
	_ = ctx
	return nil
}
