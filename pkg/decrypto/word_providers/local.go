package word_providers

import (
	"crypto/rand"
	"io"
	"math/big"
	"os"
	"strings"
)

type LocalProvider struct {
	wordList []string
}

func (lp *LocalProvider) Provide() [4]string {
	// 生成四个不一样的随机数

	max := int64(len(lp.wordList))

	if max <= 8 {
		panic("word list is too short")
	}

	randIndexes := [4]int64{-1, -1, -1, -1}

	for i := 0; i < len(randIndexes); i++ {
		var rn *big.Int

		for {
			rn, _ = rand.Int(rand.Reader, big.NewInt(max))

			for _, v := range randIndexes {
				if v == rn.Int64() {
					continue
				}
			}
			break
		}

		randIndexes[i] = rn.Int64()

	}

	return [4]string{
		lp.wordList[randIndexes[0]],
		lp.wordList[randIndexes[1]],
		lp.wordList[randIndexes[2]],
		lp.wordList[randIndexes[3]],
	}
}

func NewLocalProvider() *LocalProvider {
	if file, err := os.Open("words.txt"); err == nil {
		if content, err := io.ReadAll(file); err == nil {
			wordList := strings.Split(string(content), "\n")

			if len(wordList) < 8 {
				panic("word list is too short")
			}

			return &LocalProvider{
				wordList: wordList,
			}

		}
		panic("read file error")
	}
	panic("words.txt is not exists")
}
