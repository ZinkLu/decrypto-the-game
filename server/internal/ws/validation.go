package ws

import (
	"encoding/json"
	"fmt"
)

// JSON arrays must contain exactly three values; Go arrays otherwise silently truncate extras.
func (d *SubmitCluesData) UnmarshalJSON(data []byte) error {
	var v struct {
		Round int      `json:"round"`
		Clues []string `json:"clues"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	if len(v.Clues) != 3 {
		return fmt.Errorf("provide exactly three clues")
	}
	d.Round = v.Round
	copy(d.Clues[:], v.Clues)
	return nil
}

func (d *SubmitGuessData) UnmarshalJSON(data []byte) error {
	var v struct {
		Round int   `json:"round"`
		Guess []int `json:"guess"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	if len(v.Guess) != 3 {
		return fmt.Errorf("provide exactly three guesses")
	}
	d.Round = v.Round
	copy(d.Guess[:], v.Guess)
	return nil
}
