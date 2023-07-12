package word_providers

type LocalProvider struct {
}

func (lp *LocalProvider) Provide() [2][4]string {
	return [2][4]string{
		{
			"", "", "", "",
		},
		{
			"", "", "", "",
		},
	}
}
