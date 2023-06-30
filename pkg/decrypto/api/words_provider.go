package api

type Provider interface {
	Provider() [2][4]string
}

type LocalProvider struct {
}

func (lp *LocalProvider) Provider() [2][4]string {
	return [2][4]string{
		{
			"", "", "", "",
		},
		{
			"", "", "", "",
		},
	}
}
