package message

import (
	"bytes"
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

var GeneralWrongPlayer = loadTemplate("generalWrongPlayer", generalWrongPlayerTemplate)
var ReplyWrongWordsFormat = loadTemplate("replyWrongWordsFormat", replyWrongWordsFormatTemplate)
var ReplyWrongDigitsFormat = loadTemplate("replyWrongDigitsFormat", replyWrongDigitsFormatTemplate)
var StartEncrypt = loadTemplate("startEncrypt", startEncryptTemplate)
var ReadyToEncrypt = loadTemplate("readyToEncrypt", readyToEncryptTemplate)
var EncryptSuccess = loadTemplate("encryptSuccess", encryptSuccessTemplate)
var StartIntercept = loadTemplate("startIntercept", startInterceptTemplate)
var StartDecrypt = loadTemplate("startDecrypt", startDecryptTemplate)
var DecryptDoneMessage = loadTemplate("decryptDoneMessage", decryptDoneMessage)
var DecryptFailMessage = loadTemplate("decryptFailMessage", decryptFailMessage)
var DecryptSuccessMessage = loadTemplate("decryptSuccessMessage", decryptSuccessMessage)
var GameOver = loadTemplate("gameOver", gameOverTemplate)
var MaxRoundReached = loadTemplate("maxRoundReached", maxRoundReachedTemplate)
var HelpTemplate = loadTemplate("help", helpTemplate)
var GameNameTemplate = loadTemplate("gameName", gameNameTemplate)
var GameStartTemplate = loadTemplate("gameStart", gameStartTemplate)
var GameEndTemplate = loadTemplate("gameEnd", gameEndTemplate)
var CloseRoomTemplate = loadTemplate("closeRoom", closeRoomTemplate)
var GameRoomsLinkTemplate = loadTemplate("gameRoomsLink", gameRoomsLinkTemplate)
var ReadyToEncryptMessageTemplate = loadTemplate("readyToEncryptMessage", readyToEncryptMessageTemplate)
var NoEncryptingMessageTemplate = loadTemplate("noEncryptingMessage", noEncryptingMessageTemplate)
var TeamStatusTemplate = loadTemplate("teamStatus", teamStatusTemplate)
var GameRoundInfoTempalte = loadTemplate("gameRoundInfo", gameRoundInfoTempalte)
var SkipInterceptTemplate = loadTemplate("skipInterceptTemplate", skipInterceptTemplate)
var InterceptSuccessMessage = loadTemplate("interceptSuccessMessage", interceptSuccessMessage)
var InterceptFailMessage = loadTemplate("interceptFailMessage", interceptFailMessage)
var InterceptDoneMessage = loadTemplate("interceptDoneMessage", interceptDoneMessage)

// GetEmojiDigits 保持不变
func GetEmojiDigits(dig int) string {
	switch dig {
	case 1:
		return "1️⃣"
	case 2:
		return "2️⃣"
	case 3:
		return "3️⃣"
	case 4:
		return "4️⃣"
	default:
		return "0️⃣"
	}
}
