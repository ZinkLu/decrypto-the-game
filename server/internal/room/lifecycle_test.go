package room

import "testing"

func TestLifecycleRecoveryOwnershipAndAtomicSwitch(t *testing.T) {
	owner := &PlayerInfo{ID: "owner", Nickname: "owner"}
	r := NewRoom("1234", owner)
	peer := &PlayerInfo{ID: "peer", Nickname: "peer"}
	token, err := r.Join(peer)
	if err != nil {
		t.Fatal(err)
	}
	if err = r.AddToTeam(peer, "A"); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		if err = r.AddAI("B"); err != nil {
			t.Fatal(err)
		}
	}
	if r.AddToTeam(owner, "B") == nil {
		t.Fatal("full team accepted")
	}
	if len(r.Snapshot().TeamA) != 2 {
		t.Fatal("failed switch removed original seat")
	}
	r.Disconnect(owner.ID)
	if r.Snapshot().OwnerID != owner.ID || len(r.Snapshot().TeamA) != 2 {
		t.Fatal("a short disconnect gave up the seat or the host role")
	}
	if !r.Release(owner.ID) || r.Snapshot().OwnerID != peer.ID || len(r.Snapshot().TeamA) != 1 {
		t.Fatal("owner not transferred after release")
	}
	if _, err = r.Resume("wrong"); err == nil {
		t.Fatal("invalid token accepted")
	}
	if _, err = r.Resume(r.Token(owner.ID)); err != nil {
		t.Fatal(err)
	}
	if err = r.AddToTeam(owner, "A"); err != nil {
		t.Fatal(err)
	}
	if _, err = r.BeginGame(); err != nil {
		t.Fatal(err)
	}
	before := r.Snapshot()
	r.Disconnect(peer.ID)
	if !r.Snapshot().TeamA[0].Disconnected {
		t.Fatal("active disconnected seat not preserved")
	}
	p, err := r.Resume(token)
	if err != nil || p.ID != peer.ID {
		t.Fatal("wrong resumed identity")
	}
	after := r.Snapshot()
	if len(after.TeamA) != len(before.TeamA) || after.TeamA[0].Disconnected {
		t.Fatal("resume changed team")
	}
	if r.LeaveTeam(peer.ID) == nil {
		t.Fatal("active roster changed")
	}
	if _, err = r.BeginGame(); err == nil {
		t.Fatal("double start allowed")
	}
	r.Disconnect(peer.ID)
	if err = r.Reopen(); err != nil || r.Snapshot().Started {
		t.Fatal("finished room did not reopen")
	}
	if len(r.Snapshot().TeamA) != 1 {
		t.Fatal("a player who left kept a seat in the reopened lobby")
	}
}

func TestAutoSeatBalancesTeams(t *testing.T) {
	r := NewRoom("5678", &PlayerInfo{ID: "owner", Nickname: "owner"})
	for _, id := range []string{"b", "c"} {
		if _, err := r.Join(&PlayerInfo{ID: id, Nickname: id}); err != nil {
			t.Fatal(err)
		}
		r.AutoSeat(id)
	}
	s := r.Snapshot()
	if len(s.TeamA) != 2 || len(s.TeamB) != 1 || s.TeamB[0].ID != "b" {
		t.Fatalf("unbalanced seating: %d / %d", len(s.TeamA), len(s.TeamB))
	}
}
