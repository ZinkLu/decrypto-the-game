package message

const GENERAL_WRONG_PLAYER_MESSAGE = `当前应该由 %v 给出信息，其他人请勿 @ 我`

// IN GAME MESSAGE
const REPLY_WRONG_WORDS_FORMAT_MESSAGE = `请输入三组文字，以空格分割。比如
空气 夏天 红色`

const REPLY_WRONG_DIGITS_FORMAT_MESSAGE = `请输入三个数字作为拦截的密码（1-4之间），以空格分割。比如
1 2 3`

const START_ENCRYPT_MESSAGE = `📠 开始加密，请 %s 玩家开始进行加密~

（加密者私信我并回复 <` + SECRET_CODES + `> 来获取本轮要加密的数字）
（其他人可以回复 <` + PLAIN_WORDS + `> 来查看本局的词语）`
const START_INTERCEPT_MESSAGE = `🛑 开始拦截，请 %v 中的任意玩家 @ 我并给出拦截的密码，以空格分割`
const START_DECRYPT_MESSAGE = `🔐 开始解密，请 %v 中的任意玩家 @ 我并给出解密的密码，以空格分割`
const SKIP_INTERCEPT_MESSAGE = `第一轮跳过拦截阶段`

const READY_TO_ENCRYPT_MESSAGE = `📞 本轮中:
	🔢 你需要加密的数字为 %s
	🖨️ 对应的密文为 %s
现在，将加密后的密文发送到公屏中（记得先 @ 我再发送）
`

const NO_ENCRYPTING_MESSAGE = `您本轮不负责加密`

const ENCRYPT_SUCCESS_MESSAGE = `🔒 加密成功
当前的密文为:
	%s %s %s
`

const INTERCEPT_DONE_MESSAGE = `🛑 收到拦截密码
拦截的密码为: %s %s %s`

const DECRYPT_DONE_MESSAGE = `🔑 收到解密密码
解密的密码为: %s %s %s`

const INTERCEPT_SUCCESS_MESSAGE = `🔍 密码破解成功！！跳过解密环节！`
const INTERCEPT_FAIL_MESSAGE = `💾 密码破解失败！请进行解密！`

const DECRYPT_SUCCESS_MESSAGE = `🔓 解密成功！！`
const DECRYPT_FAIL_MESSAGE = `❌ 解密失败！！`

const ROUND_OVER_MESSAGE = `本轮结束！本轮数据如下：`
const GAME_OVER_MESSAGE = `本局结束，恭喜 %s 获得了胜利
对局详情如下：`

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
