package word_providers

type LocalProvider struct {
}

func (lp *LocalProvider) Provide() [4]string {
	return [4]string{
		"", "", "", "",
	}
}
