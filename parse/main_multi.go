//go:build ignore
// Multi-demo batch parser: parses N demos, groups by player, normalizes by round start
// Usage: go run main_multi.go <demo_dir> <output.json>

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

// --- Output types ---

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
	Team       string      `json:"team"`
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

type SmokeEvent struct {
	Tick       int        `json:"tick"`
	ThrowX     float64    `json:"throw_x"`
	ThrowY     float64    `json:"throw_y"`
	LandX      float64    `json:"land_x"`
	LandY      float64    `json:"land_y"`
	Trajectory []TickPos  `json:"trajectory"`
}

type NadeEvent struct {
	Tick       int        `json:"tick"`
	ThrowX     float64    `json:"throw_x"`
	ThrowY     float64    `json:"throw_y"`
	Trajectory []TickPos  `json:"trajectory"`
}

type KillEvent struct {
	Tick   int     `json:"tick"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	OtherX float64 `json:"other_x"`
	OtherY float64 `json:"other_y"`
	Weapon string  `json:"weapon"`
}

// --- Per-round accumulator ---

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

// --- Per-player accumulator ---

type playerAcc struct {
	steamID uint64
	name    string
	team    common.Team
	rounds  []*roundAcc // last element is the current round
}

func (pa *playerAcc) curRound() *roundAcc {
	if len(pa.rounds) == 0 {
		return nil
	}
	return pa.rounds[len(pa.rounds)-1]
}

func (pa *playerAcc) startRound(roundNum, startTick int) {
	cr := &roundAcc{
		roundNum:     roundNum,
		startTick:    startTick,
		weaponCounts: make(map[string]int),
	}
	pa.rounds = append(pa.rounds, cr)
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
	sampleEvery := 64 // sample player positions every N ticks (64tick = 1Hz at 64tr)

	// Map name — extracted from server info, not hardcoded
	p.RegisterNetMessageHandler(func(m *msg.CSVCMsg_ServerInfo) {
		mapName = m.GetMapName()
	})

	// Round tracking: start a new round accumulator for every known player
	p.RegisterEventHandler(func(e events.RoundStart) {
		currentRound++
		roundStartTick = p.GameState().IngameTick()
		for _, acc := range players {
			acc.startRound(currentRound, roundStartTick)
		}
	})

	p.RegisterEventHandler(func(e events.RoundEnd) {
		roundEndTick := p.GameState().IngameTick()
		for _, acc := range players {
			if cr := acc.curRound(); cr != nil {
				cr.endTick = roundEndTick
			}
		}
	})

	// Player positions — sampled every sampleEvery ticks, deduped at 2 units
	p.RegisterEventHandler(func(e events.FrameDone) {
		tick := p.GameState().IngameTick()
		if tick%sampleEvery != 0 {
			return
		}
		for _, pl := range p.GameState().Participants().All() {
			if pl == nil || !pl.IsAlive() {
				continue
			}
			sid := pl.SteamID64
			if sid == 0 {
				continue
			}
			acc, ok := players[sid]
			if !ok {
				// First time seeing this player — seed their first round
				acc = &playerAcc{steamID: sid, name: pl.Name, team: pl.Team}
				acc.startRound(currentRound, roundStartTick)
				players[sid] = acc
			}
			cr := acc.curRound()
			if cr == nil {
				continue
			}
			pos := pl.Position()
			// Skip if within 2 units of the last recorded position in this round
			if len(cr.positions) > 0 {
				last := cr.positions[len(cr.positions)-1]
				dx, dy := pos.X-last.X, pos.Y-last.Y
				if dx*dx+dy*dy < 4 { // 2^2 = 4
					continue
				}
			}
			cr.positions = append(cr.positions, TickPos{
				Tick: tick, X: pos.X, Y: pos.Y,
			})
		}
	})

	// Weapon fires — record per weapon, update weapon_counts
	p.RegisterEventHandler(func(e events.WeaponFire) {
		if e.Shooter == nil {
			return
		}
		sid := e.Shooter.SteamID64
		acc, ok := players[sid]
		if !ok {
			return
		}
		cr := acc.curRound()
		if cr == nil {
			return
		}
		pos := e.Shooter.Position()
		weaponStr := e.Weapon.String()
		cr.fires = append(cr.fires, FireEvent{
			Tick:   p.GameState().IngameTick(),
			X:      pos.X,
			Y:      pos.Y,
			Weapon: weaponStr,
		})
		cr.weaponCounts[weaponStr]++
	})

	// Grenade throws
	p.RegisterEventHandler(func(e events.GrenadeProjectileThrow) {
		if e.Projectile.Thrower == nil {
			return
		}
		sid := e.Projectile.Thrower.SteamID64
		acc, ok := players[sid]
		if !ok {
			return
		}
		cr := acc.curRound()
		if cr == nil {
			return
		}
		tick := p.GameState().IngameTick()
		pos := e.Projectile.Thrower.Position()

		// Extract full trajectory from projectile (positions at each bounce)
		traj := make([]TickPos, len(e.Projectile.Trajectory))
		for i, te := range e.Projectile.Trajectory {
			traj[i] = TickPos{
				Tick: tick + i,
				X:    te.Position.X,
				Y:    te.Position.Y,
			}
		}

		switch e.Projectile.WeaponInstance.Type {
		case common.EqSmoke:
			lx, ly := pos.X, pos.Y
			if len(traj) > 0 {
				lx, ly = traj[len(traj)-1].X, traj[len(traj)-1].Y
			}
			cr.smokes = append(cr.smokes, SmokeEvent{
				Tick:       tick,
				ThrowX:     pos.X,
				ThrowY:     pos.Y,
				LandX:      lx,
				LandY:      ly,
				Trajectory: traj,
			})
		case common.EqFlash:
			cr.flashes = append(cr.flashes, NadeEvent{
				Tick:       tick,
				ThrowX:     pos.X,
				ThrowY:     pos.Y,
				Trajectory: traj,
			})
		case common.EqHE:
			cr.hes = append(cr.hes, NadeEvent{
				Tick:       tick,
				ThrowX:     pos.X,
				ThrowY:     pos.Y,
				Trajectory: traj,
			})
		}
	})

	// GrenadeProjectileDestroy - capture FULL trajectory at destroy time
	p.RegisterEventHandler(func(e events.GrenadeProjectileDestroy) {
		sid := e.Projectile.Thrower.SteamID64
		acc, ok := players[sid]
		if !ok { return }
		cr := acc.curRound()
		if cr == nil { return }
		tick := p.GameState().IngameTick()

		// Extract full trajectory (all bounces + destruction)
		traj := make([]TickPos, len(e.Projectile.Trajectory))
		for i, te := range e.Projectile.Trajectory {
			traj[i] = TickPos{Tick: tick, X: te.Position.X, Y: te.Position.Y}
		}

		pos := e.Projectile.Thrower.Position()
		switch e.Projectile.WeaponInstance.Type {
		case common.EqSmoke:
			lx, ly := pos.X, pos.Y
			if len(traj) > 0 { lx, ly = traj[len(traj)-1].X, traj[len(traj)-1].Y }
			cr.smokes = append(cr.smokes, SmokeEvent{
				Tick: tick, ThrowX: pos.X, ThrowY: pos.Y,
				LandX: lx, LandY: ly, Trajectory: traj,
			})
		case common.EqFlash:
			cr.flashes = append(cr.flashes, NadeEvent{
				Tick: tick, ThrowX: pos.X, ThrowY: pos.Y, Trajectory: traj,
			})
		case common.EqHE:
			cr.hes = append(cr.hes, NadeEvent{
				Tick: tick, ThrowX: pos.X, ThrowY: pos.Y, Trajectory: traj,
			})
		}
	})

	// Kills
	p.RegisterEventHandler(func(e events.Kill) {
		if e.Killer != nil {
			sid := e.Killer.SteamID64
			if acc, ok := players[sid]; ok {
				if cr := acc.curRound(); cr != nil {
					kpos := e.Killer.Position()
					vpos := e.Victim.Position()
					cr.kills = append(cr.kills, KillEvent{
						Tick:   p.GameState().IngameTick(),
						X:      kpos.X,
						Y:      kpos.Y,
						OtherX: vpos.X,
						OtherY: vpos.Y,
						Weapon: e.Weapon.String(),
					})
				}
			}
		}
		if e.Victim != nil {
			sid := e.Victim.SteamID64
			if acc, ok := players[sid]; ok {
				if cr := acc.curRound(); cr != nil {
					kpos := e.Killer.Position()
					vpos := e.Victim.Position()
					cr.deaths = append(cr.deaths, KillEvent{
						Tick:   p.GameState().IngameTick(),
						X:      vpos.X,
						Y:      vpos.Y,
						OtherX: kpos.X,
						OtherY: kpos.Y,
						Weapon: e.Weapon.String(),
					})
				}
			}
		}
	})

	fmt.Fprintf(os.Stderr, "  Parsing %s...\n", filepath.Base(path))
	err = p.ParseToEnd()
	tickRate = p.TickRate()
	totalTicks = p.GameState().IngameTick()
	return
}

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "Usage: go run main_multi.go <demo_dir_or_file> <output.json>")
		os.Exit(1)
	}
	inputPath := os.Args[1]
	outPath := os.Args[2]

	// Collect demo files
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

	fmt.Fprintf(os.Stderr, "Found %d demo(s)\n", len(demoFiles))

	// Aggregate across all demos
	globalPlayers := make(map[uint64]*PlayerScoutData)
	var globalMap string // first non-empty map name across demos

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

			// Build per-round data from the per-round accumulators
			var rounds []RoundData
			for _, cr := range acc.rounds {
				rd := RoundData{
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
				}
				rounds = append(rounds, rd)
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

	// Build report
	report := ScoutReport{Map: globalMap}

	for _, pd := range globalPlayers {
		// Sort matches by most recent first
		sort.Slice(pd.Matches, func(i, j int) bool {
			return pd.Matches[i].DemoFile > pd.Matches[j].DemoFile
		})
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

	// Write
	w, _ := os.Create(outPath)
	defer w.Close()
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.Encode(report)

	fmt.Fprintf(os.Stderr, "Wrote %d players to %s\n", len(report.Players), outPath)
}

// Normalize ticks relative to round start
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
		// Normalize trajectory ticks
		for j := range out[i].Trajectory {
			out[i].Trajectory[j].Tick -= startTick
		}
	}
	return out
}
func normalizeNades(evts []NadeEvent, startTick int) []NadeEvent {
	out := make([]NadeEvent, len(evts))
	for i, e := range evts {
		out[i] = e
		out[i].Tick -= startTick
		// Normalize trajectory ticks
		for j := range out[i].Trajectory {
			out[i].Trajectory[j].Tick -= startTick
		}
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
