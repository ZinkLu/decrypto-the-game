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
	if r.Snapshot().OwnerID != peer.ID {
		t.Fatal("owner not transferred")
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
}
