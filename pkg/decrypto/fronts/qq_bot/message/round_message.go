package message

// IN GAME MESSAGE
const REPLY_FORMAT_MESSAGE = `请输入三组文字，以空格分割`

const START_ENCRYPT_MESSAGE = `🔒 开始加密，请 %s 玩家开始进行加密~
（请私信我并回复 **密码** 来获取本轮要加密的数字）
（其他人可以回复 **密文** 来查看本局的词语`

const READY_TO_ENCRYPT_MESSAGE = `📞 本轮中:
	🔢 你需要加密的数字为 %v
	🖨️ 对应的密文为 %v
	现在，将加密后的密文发送到公屏中
`

const NO_ENCRYPTING_MESSAGE = `您本轮不负责加密`

const ENCRYPT_SUCCESS_MESSAGE = `🔐 加密成功
当前的密文为:
	1️⃣: %s 
	2️⃣: %s
	3️⃣: %s
`
const SPLITTER = " "
