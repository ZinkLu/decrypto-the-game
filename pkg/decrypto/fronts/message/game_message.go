package message

import (
	"bytes"
	"strings"
	"text/template"
)

// formattableTemplate is a wrapper around a template.Template that allows for formatting with data
type formattableTemplate struct {
	*template.Template
}

// FormatTemplate formats a template with data
func (t *formattableTemplate) FormatTemplate(data any) string {
	var tpl bytes.Buffer
	t.Execute(&tpl, data)
	return tpl.String()
}

var funMap = template.FuncMap{
	"GetEmojiDigits": GetEmojiDigits,
	"not":            func(b bool) bool { return !b },
}

// loadTemplate parses a template from a string
func loadTemplate(name, templateStr string) *formattableTemplate {
	return &formattableTemplate{template.Must(template.New(name).Funcs(funMap).Parse(templateStr))}
}

// ============= Define tempalte function for better type hints ===========

var generalWrongPlayerMessageTemplate = loadTemplate("generalWrongPlayer", generalWrongPlayerMessageTemplateString)

func GetGeneralWrongPlayerMessage(player string) string {
	return generalWrongPlayerMessageTemplate.FormatTemplate(
		map[string]string{
			"Player": player,
		},
	)
}

var replyWrongWordsFormatMessageTemplate = loadTemplate("replyWrongWordsFormat", replyWrongWordsFormatMessageTemplateString)

func GetReplyWrongWordsFormatMessage() string {
	return replyWrongWordsFormatMessageTemplate.FormatTemplate(nil)
}

var replyWrongDigitsFormatMessageTemplate = loadTemplate("replyWrongDigitsFormat", replyWrongDigitsFormatMessageTemplateString)

func GetReplyWrongDigitsFormatMessage() string {
	return replyWrongDigitsFormatMessageTemplate.FormatTemplate(nil)
}

var startEncryptMessageTemplate = loadTemplate("startEncrypt", startEncryptMessageTemplateString)

func GetStartEncryptMessage(player string) string {
	return startEncryptMessageTemplate.FormatTemplate(
		map[string]string{
			"Player":     player,
			"SecretCode": SECRET_CODES,
			"PlainWords": PLAIN_WORDS,
		},
	)
}

var readyToEncryptMessageTemplate = loadTemplate("readyToEncrypt", readyToEncryptMessageTemplateString)

func GetReadyToEncryptMeesage(digits [3]int, words [3]string, botName string) string {
	// Convert the [3]int to []string
	digitsStr := make([]string, 3)
	for i, d := range digits {
		digitsStr[i] = GetEmojiDigits(d)
	}

	return readyToEncryptMessageTemplate.FormatTemplate(
		map[string]string{
			"Digits":  strings.Join(digitsStr, " "),
			"Words":   strings.Join(words[:], " "),
			"BotName": botName,
		},
	)
}

var encryptSuccessMessageTemplate = loadTemplate("encryptSuccess", encryptSuccessMessageTemplateString)

func GetEncryptSuccessMessage(words [3]string) string {
	return encryptSuccessMessageTemplate.FormatTemplate(
		map[string]string{
			"Wrod1": words[0],
			"Wrod2": words[1],
			"Wrod3": words[2],
		},
	)
}

var startInterceptTemplate = loadTemplate("startIntercept", startInterceptTemplateString)

func GetStartIterceptMessage(team, botName string) string {
	return startInterceptTemplate.FormatTemplate(
		map[string]string{
			"Team":    team,
			"BotName": botName,
		},
	)
}

var startDecryptMessageTemplate = loadTemplate("startDecrypt", startDecryptMessageTemplateString)

func GetStartDecryptMessage(team, botName string) string {
	return startDecryptMessageTemplate.FormatTemplate(
		map[string]string{
			"Team":    team,
			"BotName": botName,
		},
	)
}

var decryptDoneMessageTemplate = loadTemplate("decryptDoneMessage", decryptDoneMessageTemplateString)

func GetDecryptDoneMessage(digits [3]int) string {
	return decryptDoneMessageTemplate.FormatTemplate(
		map[string]string{
			"Digit1": GetEmojiDigits(digits[0]),
			"Digit2": GetEmojiDigits(digits[1]),
			"Digit3": GetEmojiDigits(digits[2]),
		},
	)
}

var decryptFailMessageTemplate = loadTemplate("decryptFailMessage", decryptFailMessageTemplateString)

func GetDecryptFailMessage() string {
	return decryptFailMessageTemplate.FormatTemplate(nil)
}

var decryptSuccessMessageTemplate = loadTemplate("decryptSuccessMessage", decryptSuccessMessageTemplateString)

func GetDecryptSuccessMessage() string {
	return decryptSuccessMessageTemplate.FormatTemplate(nil)
}

var gameOverMessageTemplate = loadTemplate("gameOver", gameOverMessageTemplateString)

func GetGameOverMessage(winner string) string {
	return gameOverMessageTemplate.FormatTemplate(
		map[string]string{
			"Winner": winner,
		},
	)
}

var maxRoundReachedMessageTemplate = loadTemplate("maxRoundReached", maxRoundReachedMessageTemplateString)

func GetMaxRoundReachedMessage() string {
	return maxRoundReachedMessageTemplate.FormatTemplate(nil)
}

var helpMessageTemplate = loadTemplate("help", helpMessageTemplateString)

func GetHelpMessage(botName string) string {
	return helpMessageTemplate.FormatTemplate(
		map[string]string{
			"BotName": botName,
		},
	)
}

var gameTitleTemplate = loadTemplate("gameName", gameNameMessageTemplateString)

func GetGameTitle(emoji, hostName string) string {
	return gameTitleTemplate.FormatTemplate(
		map[string]string{
			"Emoji":    emoji,
			"hostName": hostName,
		},
	)
}

var gameStartMessageTemplate = loadTemplate("gameStart", gameStartMessageTemplateString)

func GetGameStartMessage(teamANames, teamBNames string) string {
	return gameStartMessageTemplate.FormatTemplate(
		map[string]string{
			"BlueTeam": teamANames,
			"RedTeam":  teamBNames,
		},
	)
}

var gameEndMessageTemplate = loadTemplate("gameEnd", gameEndMessageTemplateString)

func GetGameEndMessage() string {
	return gameEndMessageTemplate.FormatTemplate(nil)
}

var closeRoomMessageTemplate = loadTemplate("closeRoom", closeRoomMessageTemplateString)

func GetCloseRoomMessage() string {
	return closeRoomMessageTemplate.FormatTemplate(nil)
}

var gameRoomsLinkMessageTemplate = loadTemplate("gameRoomsLink", gameRoomsLinkMessageTemplateString)

func GetGameRoomsLinkMessage(roomID string) string {
	return gameRoomsLinkMessageTemplate.FormatTemplate(
		map[string]string{
			"RoomID": roomID,
		},
	)
}

var noEncryptingMessageTemplate = loadTemplate("noEncryptingMessage", noEncryptingMessageTemplateString)

func GetNoEncryptingMessage() string {
	return noEncryptingMessageTemplate.FormatTemplate(nil)
}

var teamStatusMessageTemplate = loadTemplate("teamStatus", teamStatusMessageTemplateString)

func GetTeamStatusMessage(words [4]string, interceptedCounts, decryptWrongCounts uint8) string {
	return teamStatusMessageTemplate.FormatTemplate(
		map[string]any{
			"Words":              words,
			"InterceptedCounts":  interceptedCounts,
			"DecryptWrongCounts": decryptWrongCounts,
		},
	)
}

var gameRoundInfoMessageTempalte = loadTemplate("gameRoundInfo", gameRoundInfoMessageTempalteString)

func GetGameRoundInfoMessage(
	numberOfRounds uint8,
	encryptPlayer string,
	encryptedMessage [3]string,
	secretDigits [3]int,
	interceptSecret [3]int,
	decryptSecret [3]int,
	isInterceptSuccess,
	isDecryptedCorrect bool,
) string {
	return gameRoundInfoMessageTempalte.FormatTemplate(
		map[string]any{
			"NumberOfRounds":     numberOfRounds,
			"EncryptPlayer":      encryptPlayer,
			"EncryptedMessage":   encryptedMessage,
			"SecretDigits":       secretDigits,
			"InterceptSecret":    interceptSecret,
			"DecryptSecret":      decryptSecret,
			"IsInterceptSuccess": isInterceptSuccess,
			"IsDecryptedCorrect": isDecryptedCorrect,
		},
	)
}

var skipInterceptMessageTemplate = loadTemplate("skipIntercept", skipInterceptMessageTemplateString)

func GetSkipInterceptMessage() string {
	return skipInterceptMessageTemplate.FormatTemplate(nil)
}

var interceptSuccessMessageTemplate = loadTemplate("interceptSuccess", interceptSuccessMessageTemplateString)

func GetInterceptSuccessMessage() string {
	return interceptSuccessMessageTemplate.FormatTemplate(nil)
}

var interceptFailMessageTemplate = loadTemplate("interceptFail", interceptFailMessageTemplateString)

func GetInterceptFailMessage() string {
	return interceptFailMessageTemplate.FormatTemplate(nil)
}

var interceptDoneMessageTemplate = loadTemplate("interceptDone", interceptDoneMessageTemplateString)

func GetInterceptDoneMessage(words [3]int) string {
	return interceptDoneMessageTemplate.FormatTemplate(
		map[string]string{
			"Word1": GetEmojiDigits(words[0]),
			"Word2": GetEmojiDigits(words[1]),
			"Word3": GetEmojiDigits(words[2]),
		},
	)
}
