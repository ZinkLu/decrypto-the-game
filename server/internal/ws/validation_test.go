package ws

import (
	"encoding/json"
	"testing"
)

func TestSubmittedArraysHaveExactlyThreeValues(t *testing.T) {
	for _, raw := range []string{`{"clues":[]}`, `{"clues":["a","b","c","d"]}`} {
		var d SubmitCluesData
		if json.Unmarshal([]byte(raw), &d) == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	for _, raw := range []string{`{"guess":[1,2]}`, `{"guess":[1,2,3,4]}`} {
		var d SubmitGuessData
		if json.Unmarshal([]byte(raw), &d) == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}
