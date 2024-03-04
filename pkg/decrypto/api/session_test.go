package api

import (
	"context"
	"crypto/rand"
	"math/big"

	"fmt"
	"testing"

	"github.com/google/uuid"
)

// var r = rand.New(rand.NewSource(time.Now().UnixMicro()))

func getRandomDig() int {
	n, _ := rand.Int(rand.Reader, big.NewInt(4))
	return int(n.Int64()) + 1
}

func i() {
	RegisterInitHandler(func(ctx context.Context, r *Round, ts TeamState) bool {
		fmt.Printf("第%d局开始，密码为 %v", r.RoundN, r.CurrentTeam.secret)
		fmt.Println()
		return false
	})
	RegisterEncryptHandler(func(ctx context.Context, r *Round, rt *RoundedTeam, p *Player, ts TeamState) ([3]string, bool) {
		return [3]string{}, false
	})
	RegisterInterceptHandler(func(ctx context.Context, r *Round, rt *RoundedTeam, ts TeamState) ([3]int, bool) {
		result := [3]int{getRandomDig(), getRandomDig(), getRandomDig()}
		fmt.Printf("给出的拦截密码为 %v \n", result)
		return result, false
	})
	RegisterInterceptSuccessHandler(func(ctx context.Context, r *Round, rt *RoundedTeam, ts TeamState) bool {
		fmt.Println("拦截成功")
		return false
	})
	RegisterInterceptFailHandler(func(ctx context.Context, r *Round, rt *RoundedTeam, ts TeamState) bool {
		fmt.Println("拦截失败")
		return false
	})
	RegisterDecryptHandler(func(ctx context.Context, r *Round, rt *RoundedTeam, ts TeamState) ([3]int, bool) {
		result := rt.secret
		fmt.Printf("给出的解密密码为 %v \n", result)
		return result, false
	})
	RegisterDecryptSuccessHandler(func(ctx context.Context, r *Round, rt *RoundedTeam, ts TeamState) bool {
		fmt.Println("解密成功")
		return false
	})
	RegisterDecryptFailHandler(func(ctx context.Context, r *Round, rt *RoundedTeam, ts TeamState) bool {
		fmt.Println("解密失败")
		return false
	})
	RegisterDoneHandler(func(ctx context.Context, r *Round, ts TeamState) bool {
		fmt.Println("对局结束")

		for _, t := range r.Teams {

			fmt.Printf(`	单词为: %v
	密码为: %v
	拦截: %v
	解密: %v
	isIntercepted: %v
	isDecrypted: %v
`,
				t.Words,
				t.secret,
				t.interceptedSecret,
				t.decryptSecret,
				t.IsInterceptSuccess(),
				t.IsDecryptedCorrect(),
			)

			fmt.Println()
		}

		return false
	})
	RegisterGameOverHandler(func(ctx context.Context, s *Session, t *Team) bool {

		fmt.Printf("获胜队伍为 %v \n", t)

		return true
	})
}

func getRandomPlayers() []*Player {
	var ps []*Player = make([]*Player, 0)
	for i := 0; i < 2; i++ {
		ps = append(ps, &Player{
			Uid:      uuid.NewString(),
			NickName: fmt.Sprintf("Player-%d", i),
		})
	}

	return ps

}

func TestSession_AutoForward(t *testing.T) {
	i()
	type fields struct {
		PlayersA []*Player
		PlayersB []*Player
	}
	type args struct {
		ctx context.Context
	}
	tests := []struct {
		name   string
		fields fields
		args   args
	}{
		{
			name: "testing1",
			fields: fields{
				PlayersA: getRandomPlayers(),
				PlayersB: getRandomPlayers(),
			},
			args: args{
				ctx: context.Background(),
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := NewWithTeams(uuid.NewString(), tt.fields.PlayersA, tt.fields.PlayersB)
			s.AutoForward(tt.args.ctx)
		})
	}
}

func Test_Test(t *testing.T) {
	for i := 0; i < 10; i++ {
		fmt.Println(getRandomDig())
	}

}
