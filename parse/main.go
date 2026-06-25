// CS2 Scout demo parser.
//
// Parses one or more CS2 demo files and emits scout_data.json: players grouped
// across matches, each match split into rounds, with per-round positions, nades,
// fires, kills and deaths — all tick-normalized to the round start.
//
// Usage: parser <demo_dir_or_file> <output.json>
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	demoinfocs "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs"
	common "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"
	events "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/events"
	msg "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/msg"
)

// --- Output schema (consumed verbatim by scout.html) ---

type ScoutReport struct {
	Map     string            `json:"map"`
	Players []PlayerScoutData `json:"players"`
}

type PlayerScoutData struct {
	SteamID uint64      `json:"steam_id"`
	Name    string      `json:"name"`
	Matches []MatchData `json:"matches"`
}

type MatchData struct {
	DemoFile   string      `json:"demo_file"`
	Map        string      `json:"map"`
	Team       string      `json:"team"` // side at the first scored round (first half)
	TickRate   float64     `json:"tick_rate"`
	TotalTicks int         `json:"total_ticks"`
	Rounds     []RoundData `json:"rounds"`
}

type RoundData struct {
	RoundNum     int            `json:"round_num"`
	StartTick    int            `json:"start_tick"`
	EndTick      int            `json:"end_tick"`
	Positions    []TickPos      `json:"positions"`
	Fires        []FireEvent    `json:"fires"`
	Smokes       []SmokeEvent   `json:"smokes"`
	Flashes      []NadeEvent    `json:"flashes"`
	HEs          []NadeEvent    `json:"hes"`
	Kills        []KillEvent    `json:"kills"`
	Deaths       []KillEvent    `json:"deaths"`
	WeaponCounts map[string]int `json:"weapon_counts"`
}

type TickPos struct {
	Tick int     `json:"tick"` // relative to round start
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

type FireEvent struct {
	Tick   int     `json:"tick"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Weapon string  `json:"weapon"`
}

// SmokeEvent carries both the throw origin and the resting (land) position so
// the front-end can draw the deployed cloud at the right spot.
type SmokeEvent struct {
	Tick   int     `json:"tick"`
	ThrowX float64 `json:"throw_x"`
	ThrowY float64 `json:"throw_y"`
	LandX  float64 `json:"land_x"`
	LandY  float64 `json:"land_y"`
}

// NadeEvent (flash / HE) carries both the throw origin and the detonation point.
type NadeEvent struct {
	Tick   int     `json:"tick"`
	ThrowX float64 `json:"throw_x"`
	ThrowY float64 `json:"throw_y"`
	LandX  float64 `json:"land_x"`
	LandY  float64 `json:"land_y"`
}

type KillEvent struct {
	Tick   int     `json:"tick"`
	X      float64 `json:"x"`      // subject position (killer for kills, victim for deaths)
	Y      float64 `json:"y"`
	OtherX float64 `json:"other_x"` // the other party
	OtherY float64 `json:"other_y"`
	Weapon string  `json:"weapon"`
}

// --- Per-round / per-player accumulators ---

type roundAcc struct {
	roundNum     int
	startTick    int
	endTick      int
	positions    []TickPos
	fires        []FireEvent
	smokes       []SmokeEvent
	flashes      []NadeEvent
	hes          []NadeEvent
	kills        []KillEvent
	deaths       []KillEvent
	weaponCounts map[string]int
}

type playerAcc struct {
	steamID    uint64
	name       string
	team       common.Team
	teamLocked bool // set once we capture the authoritative first-half side
	rounds     []*roundAcc
}

func (pa *playerAcc) curRound() *roundAcc {
	if len(pa.rounds) == 0 {
		return nil
	}
	return pa.rounds[len(pa.rounds)-1]
}

func (pa *playerAcc) startRound(roundNum, startTick int) {
	pa.rounds = append(pa.rounds, &roundAcc{
		roundNum:     roundNum,
		startTick:    startTick,
		weaponCounts: make(map[string]int),
	})
}

func teamStr(t common.Team) string {
	switch t {
	case common.TeamCounterTerrorists:
		return "CT"
	case common.TeamTerrorists:
		return "T"
	default:
		return "SPEC"
	}
}

func parseDemo(path string) (mapName string, tickRate float64, totalTicks int, players map[uint64]*playerAcc, err error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, 0, nil, err
	}
	defer f.Close()

	p := demoinfocs.NewParser(f)
	defer p.Close()

	players = make(map[uint64]*playerAcc)
	currentRound := 0
	roundStartTick := 0
	const sampleEvery = 64 // sample positions ~1Hz at 64-tick

	ensurePlayer := func(pl *common.Player) *playerAcc {
		acc, ok := players[pl.SteamID64]
		if !ok {
			acc = &playerAcc{steamID: pl.SteamID64, name: pl.Name, team: pl.Team}
			acc.startRound(currentRound, roundStartTick)
			players[pl.SteamID64] = acc
		}
		return acc
	}

	p.RegisterNetMessageHandler(func(m *msg.CSVCMsg_ServerInfo) {
		mapName = m.GetMapName()
	})

	p.RegisterEventHandler(func(e events.RoundStart) {
		currentRound++
		roundStartTick = p.GameState().IngameTick()
		for _, acc := range players {
			acc.startRound(currentRound, roundStartTick)
		}
	})

	p.RegisterEventHandler(func(e events.RoundEnd) {
		end := p.GameState().IngameTick()
		for _, acc := range players {
			if cr := acc.curRound(); cr != nil {
				cr.endTick = end
			}
		}
	})

	// Authoritative team: capture each player's side at the freezetime end of the
	// FIRST SCORED round (TotalRoundsPlayed == 0). This is immune to warmup, where
	// first-sighting team assignments are unreliable.
	p.RegisterEventHandler(func(e events.RoundFreezetimeEnd) {
		if p.GameState().TotalRoundsPlayed() != 0 {
			return
		}
		for _, pl := range p.GameState().Participants().Playing() {
			if pl == nil || pl.SteamID64 == 0 {
				continue
			}
			acc := ensurePlayer(pl)
			if !acc.teamLocked {
				acc.team = pl.Team
				acc.teamLocked = true
			}
		}
	})

	p.RegisterEventHandler(func(e events.FrameDone) {
		tick := p.GameState().IngameTick()
		if tick%sampleEvery != 0 {
			return
		}
		for _, pl := range p.GameState().Participants().All() {
			if pl == nil || !pl.IsAlive() || pl.SteamID64 == 0 {
				continue
			}
			acc := ensurePlayer(pl)
			cr := acc.curRound()
			if cr == nil {
				continue
			}
			pos := pl.Position()
			if n := len(cr.positions); n > 0 {
				dx, dy := pos.X-cr.positions[n-1].X, pos.Y-cr.positions[n-1].Y
				if dx*dx+dy*dy < 4 { // dedupe within 2 units
					continue
				}
			}
			cr.positions = append(cr.positions, TickPos{Tick: tick, X: pos.X, Y: pos.Y})
		}
	})

	p.RegisterEventHandler(func(e events.WeaponFire) {
		if e.Shooter == nil {
			return
		}
		acc, ok := players[e.Shooter.SteamID64]
		if !ok {
			return
		}
		cr := acc.curRound()
		if cr == nil {
			return
		}
		pos := e.Shooter.Position()
		w := e.Weapon.String()
		cr.fires = append(cr.fires, FireEvent{Tick: p.GameState().IngameTick(), X: pos.X, Y: pos.Y, Weapon: w})
		cr.weaponCounts[w]++
	})

	// Grenades: recorded ONCE, on destroy, when the full trajectory is known.
	// trajectory[0] is the throw origin; trajectory[last] is where it came to rest.
	p.RegisterEventHandler(func(e events.GrenadeProjectileDestroy) {
		proj := e.Projectile
		if proj == nil || proj.Thrower == nil {
			return
		}
		acc, ok := players[proj.Thrower.SteamID64]
		if !ok {
			return
		}
		cr := acc.curRound()
		if cr == nil {
			return
		}
		tick := p.GameState().IngameTick()
		traj := proj.Trajectory
		if len(traj) == 0 {
			return
		}
		throwX, throwY := traj[0].Position.X, traj[0].Position.Y
		landX, landY := traj[len(traj)-1].Position.X, traj[len(traj)-1].Position.Y
		switch proj.WeaponInstance.Type {
		case common.EqSmoke:
			cr.smokes = append(cr.smokes, SmokeEvent{Tick: tick, ThrowX: throwX, ThrowY: throwY, LandX: landX, LandY: landY})
		case common.EqFlash:
			cr.flashes = append(cr.flashes, NadeEvent{Tick: tick, ThrowX: throwX, ThrowY: throwY, LandX: landX, LandY: landY})
		case common.EqHE:
			cr.hes = append(cr.hes, NadeEvent{Tick: tick, ThrowX: throwX, ThrowY: throwY, LandX: landX, LandY: landY})
		}
	})

	p.RegisterEventHandler(func(e events.Kill) {
		tick := p.GameState().IngameTick()
		if e.Killer != nil && e.Victim != nil {
			if acc, ok := players[e.Killer.SteamID64]; ok {
				if cr := acc.curRound(); cr != nil {
					k, v := e.Killer.Position(), e.Victim.Position()
					cr.kills = append(cr.kills, KillEvent{Tick: tick, X: k.X, Y: k.Y, OtherX: v.X, OtherY: v.Y, Weapon: e.Weapon.String()})
				}
			}
		}
		if e.Victim != nil && e.Killer != nil {
			if acc, ok := players[e.Victim.SteamID64]; ok {
				if cr := acc.curRound(); cr != nil {
					k, v := e.Killer.Position(), e.Victim.Position()
					cr.deaths = append(cr.deaths, KillEvent{Tick: tick, X: v.X, Y: v.Y, OtherX: k.X, OtherY: k.Y, Weapon: e.Weapon.String()})
				}
			}
		}
	})

	fmt.Fprintf(os.Stderr, "  parsing %s ...\n", filepath.Base(path))
	err = p.ParseToEnd()
	tickRate = p.TickRate()
	totalTicks = p.GameState().IngameTick()
	return
}

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "Usage: parser <demo_dir_or_file> <output.json>")
		os.Exit(1)
	}
	inputPath, outPath := os.Args[1], os.Args[2]

	var demoFiles []string
	fi, err := os.Stat(inputPath)
	if err != nil {
		panic(err)
	}
	if fi.IsDir() {
		entries, _ := os.ReadDir(inputPath)
		for _, e := range entries {
			if strings.HasSuffix(e.Name(), ".dem") {
				demoFiles = append(demoFiles, filepath.Join(inputPath, e.Name()))
			}
		}
	} else {
		demoFiles = append(demoFiles, inputPath)
	}
	fmt.Fprintf(os.Stderr, "found %d demo(s)\n", len(demoFiles))

	globalPlayers := make(map[uint64]*PlayerScoutData)
	var globalMap string

	for _, demoPath := range demoFiles {
		mapName, tickRate, totalTicks, players, err := parseDemo(demoPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "  ERROR: %v\n", err)
			continue
		}
		if globalMap == "" && mapName != "" {
			globalMap = mapName
		}
		for sid, acc := range players {
			pd, ok := globalPlayers[sid]
			if !ok {
				pd = &PlayerScoutData{SteamID: sid, Name: acc.name}
				globalPlayers[sid] = pd
			}
			var rounds []RoundData
			for _, cr := range acc.rounds {
				rounds = append(rounds, RoundData{
					RoundNum:     cr.roundNum,
					StartTick:    cr.startTick,
					EndTick:      cr.endTick,
					Positions:    normalizeTicks(cr.positions, cr.startTick),
					Fires:        normalizeFires(cr.fires, cr.startTick),
					Smokes:       normalizeSmokes(cr.smokes, cr.startTick),
					Flashes:      normalizeNades(cr.flashes, cr.startTick),
					HEs:          normalizeNades(cr.hes, cr.startTick),
					Kills:        normalizeKills(cr.kills, cr.startTick),
					Deaths:       normalizeKills(cr.deaths, cr.startTick),
					WeaponCounts: cr.weaponCounts,
				})
			}
			pd.Matches = append(pd.Matches, MatchData{
				DemoFile:   filepath.Base(demoPath),
				Map:        mapName,
				Team:       teamStr(acc.team),
				TickRate:   tickRate,
				TotalTicks: totalTicks,
				Rounds:     rounds,
			})
		}
	}

	report := ScoutReport{Map: globalMap}
	for _, pd := range globalPlayers {
		sort.Slice(pd.Matches, func(i, j int) bool { return pd.Matches[i].DemoFile > pd.Matches[j].DemoFile })
		if len(pd.Matches) > 5 {
			pd.Matches = pd.Matches[:5]
		}
		if len(pd.Matches) > 0 {
			report.Players = append(report.Players, *pd)
		}
	}
	sort.Slice(report.Players, func(i, j int) bool {
		return len(report.Players[i].Matches) > len(report.Players[j].Matches)
	})

	w, err := os.Create(outPath)
	if err != nil {
		panic(err)
	}
	defer w.Close()
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(report); err != nil {
		panic(err)
	}
	fmt.Fprintf(os.Stderr, "wrote %d players to %s\n", len(report.Players), outPath)
}

// --- tick normalization (relative to round start) ---

func normalizeTicks(pts []TickPos, startTick int) []TickPos {
	out := make([]TickPos, len(pts))
	for i, p := range pts {
		out[i] = TickPos{Tick: p.Tick - startTick, X: p.X, Y: p.Y}
	}
	return out
}
func normalizeFires(evts []FireEvent, startTick int) []FireEvent {
	out := make([]FireEvent, len(evts))
	for i, e := range evts {
		out[i] = e
		out[i].Tick -= startTick
	}
	return out
}
func normalizeSmokes(evts []SmokeEvent, startTick int) []SmokeEvent {
	out := make([]SmokeEvent, len(evts))
	for i, e := range evts {
		out[i] = e
		out[i].Tick -= startTick
	}
	return out
}
func normalizeNades(evts []NadeEvent, startTick int) []NadeEvent {
	out := make([]NadeEvent, len(evts))
	for i, e := range evts {
		out[i] = e
		out[i].Tick -= startTick
	}
	return out
}
func normalizeKills(evts []KillEvent, startTick int) []KillEvent {
	out := make([]KillEvent, len(evts))
	for i, e := range evts {
		out[i] = e
		out[i].Tick -= startTick
	}
	return out
}
