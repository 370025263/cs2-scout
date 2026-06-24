package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	demoinfocs "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs"
	common "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"
	events "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/events"
	msg "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/msg"
)

type Output struct {
	Map            string           `json:"map"`
	TotalTicks     int              `json:"total_ticks"`
	TickRate       float64          `json:"tick_rate"`
	DurationSec    float64          `json:"duration_sec"`
	Players        []PlayerData     `json:"players"`
	Nades          []NadeData       `json:"nades"`
	Kills          []KillData       `json:"kills"`
}

type PlayerData struct {
	Name      string       `json:"name"`
	SteamID   uint64       `json:"steam_id"`
	Team      string       `json:"team"`
	Positions []PosSample  `json:"positions"`
}

type PosSample struct {
	Tick int     `json:"tick"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

type NadeData struct {
	Type      string      `json:"type"`
	Team      string      `json:"team"`
	ThrowTick int         `json:"throw_tick"`
	Path      []PosSample `json:"path"`
}

type KillData struct {
	Tick     int     `json:"tick"`
	KillerX  float64 `json:"killer_x"`
	KillerY  float64 `json:"killer_y"`
	VictimX  float64 `json:"victim_x"`
	VictimY  float64 `json:"victim_y"`
	Weapon   string  `json:"weapon"`
}

func teamStr(t common.Team) string {
	switch t {
	case common.TeamCounterTerrorists: return "CT"
	case common.TeamTerrorists: return "T"
	default: return "SPEC"
	}
}

func nadeTypeStr(t common.EquipmentType) string {
	switch t {
	case common.EqHE: return "HE"
	case common.EqFlash: return "Flash"
	case common.EqSmoke: return "Smoke"
	case common.EqMolotov, common.EqIncendiary: return "Fire"
	case common.EqDecoy: return "Decoy"
	default: return "Unknown"
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: go run main.go <demo.dem> [output.json]")
		os.Exit(1)
	}
	demoPath := os.Args[1]
	outPath := "trajectory_data.json"
	if len(os.Args) > 2 {
		outPath = os.Args[2]
	}

	f, err := os.Open(demoPath)
	if err != nil { panic(err) }
	defer f.Close()

	p := demoinfocs.NewParser(f)
	defer p.Close()

	out := Output{Map: "unknown"}
	sampleEvery := 32 // sample player positions every N ticks (64/32 = 2Hz)

	// Track player positions
	playerPositions := make(map[uint64][]PosSample)
	playerNames := make(map[uint64]string)
	playerTeams := make(map[uint64]common.Team)

	// Track nades
	var nades []NadeData

	// Track kills
	var kills []KillData

	// Get map name from ServerInfo net message
	var mapName string
	p.RegisterNetMessageHandler(func(msg *msg.CSVCMsg_ServerInfo) {
		mapName = msg.GetMapName()
	})

	// Register frame parsing for player positions
	p.RegisterEventHandler(func(e events.FrameDone) {
		tick := p.GameState().IngameTick()
		if tick%sampleEvery != 0 { return }

		for _, pl := range p.GameState().Participants().All() {
			if pl == nil || !pl.IsAlive() { continue }
			steamID := pl.SteamID64
			if steamID == 0 { continue }
			pos := pl.Position()
			playerPositions[steamID] = append(playerPositions[steamID], PosSample{
				Tick: tick, X: pos.X, Y: pos.Y,
			})
			if _, ok := playerNames[steamID]; !ok {
				playerNames[steamID] = pl.Name
			}
			playerTeams[steamID] = pl.Team
		}
	})

	// Grenade trajectories
	p.RegisterEventHandler(func(e events.GrenadeProjectileDestroy) {
		proj := e.Projectile
		if proj == nil || len(proj.Trajectory) == 0 { return }

		var path []PosSample
		for _, entry := range proj.Trajectory {
			path = append(path, PosSample{
				Tick: p.GameState().IngameTick(),
				X: entry.Position.X, Y: entry.Position.Y,
			})
		}

		team := common.TeamSpectators
		if proj.Thrower != nil { team = proj.Thrower.Team }

		nades = append(nades, NadeData{
			Type:      nadeTypeStr(proj.WeaponInstance.Type),
			Team:      teamStr(team),
			ThrowTick: p.GameState().IngameTick(),
			Path:      path,
		})
	})

	// Kills
	p.RegisterEventHandler(func(e events.Kill) {
		if e.Killer == nil || e.Victim == nil { return }
		kills = append(kills, KillData{
			Tick: p.GameState().IngameTick(),
			KillerX: e.Killer.Position().X, KillerY: e.Killer.Position().Y,
			VictimX: e.Victim.Position().X, VictimY: e.Victim.Position().Y,
			Weapon: e.Weapon.String(),
		})
	})

	fmt.Fprintln(os.Stderr, "Parsing demo...")
	err = p.ParseToEnd()
	if err != nil { panic(err) }

	out.TotalTicks = p.GameState().IngameTick()
	out.TickRate = p.TickRate()
	out.Map = mapName
	if out.TickRate > 0 { out.DurationSec = float64(out.TotalTicks) / out.TickRate }

	// Build player output
	for steamID, positions := range playerPositions {
		if len(positions) < 2 { continue }
		out.Players = append(out.Players, PlayerData{
			Name:      playerNames[steamID],
			SteamID:   steamID,
			Team:      teamStr(playerTeams[steamID]),
			Positions: positions,
		})
	}

	// Sort players by team then name
	sort.Slice(out.Players, func(i, j int) bool {
		if out.Players[i].Team != out.Players[j].Team {
			return out.Players[i].Team < out.Players[j].Team
		}
		return out.Players[i].Name < out.Players[j].Name
	})

	out.Nades = nades
	out.Kills = kills

	fmt.Fprintf(os.Stderr, "Ticks: %d, Duration: %.1fs, Players: %d, Nades: %d, Kills: %d\n",
		out.TotalTicks, out.DurationSec, len(out.Players), len(out.Nades), len(out.Kills))

	// Write JSON
	w, err := os.Create(outPath)
	if err != nil { panic(err) }
	defer w.Close()

	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	err = enc.Encode(out)
	if err != nil { panic(err) }

	fmt.Fprintf(os.Stderr, "Wrote %s\n", outPath)
}
