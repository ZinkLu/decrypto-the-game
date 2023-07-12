package word_providers

type Provider interface {
	Provide() [2][4]string
}

func GetDefaultProvider() Provider {
	return &LocalProvider{}
}
