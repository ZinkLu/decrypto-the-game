package message

const GENERAL_WRONG_PLAYER_MESSAGE = `当前应该由 %v 给出信息，其他人请勿 @ 我`

// IN GAME MESSAGE
const REPLY_WRONG_WORDS_FORMAT_MESSAGE = `请输入三组文字，以空格分割。比如
空气 夏天 红色`

const REPLY_WRONG_DIGITS_FORMAT_MESSAGE = `请输入三个数字作为拦截的密码（1-4之间），以空格分割。比如
1 2 3`

const START_ENCRYPT_MESSAGE = `🔒 开始加密，请 %s 玩家开始进行加密~
（加密者私信我并回复 ` + SECRET_CODES + ` 来获取本轮要加密的数字）
（其他人可以回复  ` + PLAIN_WORDS + ` 来查看本局的词语`

const READY_TO_ENCRYPT_MESSAGE = `📞 本轮中:
	🔢 你需要加密的数字为 %v
	🖨️ 对应的密文为 %v
	现在，将加密后的密文发送到公屏中（记得先 @ 我再发送）
`

const NO_ENCRYPTING_MESSAGE = `您本轮不负责加密`

const ENCRYPT_SUCCESS_MESSAGE = `🔐 加密成功
当前的密文为:
	1️⃣: %s 
	2️⃣: %s
	3️⃣: %s
`

const INSPECT_DONE_MESSAGE = `🛑 收到拦截密码
拦截的密码为: %s %s %s`

const INSPECT_SUCCESS_MESSAGE = `🔍 密码破解成功！！跳过解密环节！`
const INSPECT_FAIL_MESSAGE = `🔐 密码破解失败！请进行解密！`

const SPLITTER = " "

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
