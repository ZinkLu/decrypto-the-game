package word_providers

type Provider interface {
	Provide() [4]string
}

func GetDefaultProvider() Provider {
	return NewLocalProvider()
}
