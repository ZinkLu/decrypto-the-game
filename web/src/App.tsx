import { lazy, Suspense, useEffect, useState } from "react";
import { useGameStore } from "./store/gameStore";
import type { PlayerInfo } from "./store/gameStore";
const DecoderScene = lazy(() => import("./components/tabletop/DecoderScene"));

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        D<span>∕</span>
      </span>
      <div>
        DECRYPTO<small>谍报风云 · 通信局</small>
      </div>
    </div>
  );
}
function Scene({ compact = false }: { compact?: boolean }) {
  return (
    <Suspense
      fallback={
        <div className="decoder-scene scene-loading">正在接通密码终端…</div>
      }
    >
      <DecoderScene compact={compact} />
    </Suspense>
  );
}
function Miniature() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 801px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 801px)');
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return desktop ? <div className="miniature"><Scene compact /><span>双频密码终端 · 通信中</span></div> : null;
}
function Rules() {
  return (
    <details className="rules">
      <summary>
        行动手册 <span>↗</span>
      </summary>
      <div className="rules-content">
        <h3>让队友听懂，让对手迷失。</h3>
        <p>
          每队拥有四个秘密词。加密者根据三位密码给出三条线索，队友猜出词语对应的编号，对手则从历史线索中尝试拦截。
        </p>
        <ol>
          <li>每队 2–4 人，可以添加 AI 补位。</li>
          <li>加密者有 90 秒写线索，猜码有 60 秒。</li>
          <li>前两回合不拦截；第三回合开始，先拦截再解密。</li>
          <li>成功拦截两次，或对方解密失误两次，即获胜。</li>
        </ol>
        <small>
          本线上版共最多 16 个交替回合；拦截成功会直接结束当前回合。
        </small>
      </div>
    </details>
  );
}
function Home() {
  const s = useGameStore();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <>
      <section className="home-stage">
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> THE ART OF MISCOMMUNICATION
          </div>
          <h1>
            心照不宣。
            <br />
            <em>暗中交锋。</em>
          </h1>
          <p>
            同样的线索，不同的秘密。
            <br />
            接通你的队友，瞒过另一端的耳朵。
          </p>
          <div className="edition">
            <b>01—04</b>
            <span>
              四个秘密词
              <br />
              一场无声的较量
            </span>
          </div>
        </div>
        <div className="hero-object">
          <div className="object-orbit" />
          <span className="object-caption">双频密码终端 / DUPLEX DECODER</span>
          <Scene />
          <div className="object-foot">
            <span>白方发报站</span>
            <span className="red-line" />
            <span>黑方监听站</span>
          </div>
        </div>
      </section>
      <section className="entry-strip">
        <div className="entry-heading">
          <span className="eyebrow">ESTABLISH CONNECTION</span>
          <h2>你的代号是？</h2>
          <p>找几个朋友，或者让 AI 加入行动。</p>
        </div>
        <form
          className="entry-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              s.connected &&
              name.trim() &&
              (mode === "create" || code.length === 4)
            ) {
              s.clearError();
              mode === "create"
                ? s.createRoom(name.trim())
                : s.joinRoom(code, name.trim());
            }
          }}
        >
          <div className="form-tabs">
            <button
              type="button"
              className={mode === "create" ? "active" : ""}
              onClick={() => setMode("create")}
            >
              发起行动
            </button>
            <button
              type="button"
              className={mode === "join" ? "active" : ""}
              onClick={() => setMode("join")}
            >
              加入行动
            </button>
          </div>
          <div className="entry-fields">
            <label>
              <span>特工代号</span>
              <input
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="输入你的昵称"
                required
              />
            </label>
            {mode === "join" && (
              <label className="code-field">
                <span>四位房间码</span>
                <input
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 4),
                    )
                  }
                  autoCapitalize="characters"
                  pattern="[A-Z0-9]{4}"
                  placeholder="A1B2"
                  required
                />
              </label>
            )}
            <button
              className="primary"
              disabled={
                !s.connected ||
                !name.trim() ||
                (mode === "join" && code.length !== 4)
              }
            >
              {mode === "create" ? "建立秘密频道" : "接入秘密频道"}{" "}
              <span>↗</span>
            </button>
          </div>
        </form>
      </section>
      <div className="home-bottom">
        <span>
          4–8 位特工 <i>·</i> 支持 AI 队友 <i>·</i> 实时联机
        </span>
        <Rules />
      </div>
    </>
  );
}
function Team({ id, players }: { id: string; players: PlayerInfo[] }) {
  const s = useGameStore();
  const isOwner = s.ownerID === s.myPlayerID;
  const joined = players.some((p) => p.id === s.myPlayerID);
  return (
    <section className={`team-board team-${id}`}>
      <header>
        <div className="team-symbol">{id === "A" ? "◯" : "●"}</div>
        <div>
          <span className="eyebrow">CHANNEL {id === "A" ? "01" : "02"}</span>
          <h2>{id === "A" ? "白方" : "黑方"}通信组</h2>
        </div>
        <span className="team-count">{players.length} / 4</span>
      </header>
      <div className="roster">
        {Array.from({ length: 4 }, (_, i) => {
          const p = players[i];
          return (
            <div className={`agent-slot ${p ? "occupied" : ""}`} key={i}>
              <span className="slot-number">0{i + 1}</span>
              {p ? (
                <>
                  <strong>
                    {p.nickname}
                    <small>
                      {p.id === s.myPlayerID
                        ? "你"
                        : p.is_ai
                          ? "AI 特工"
                          : "特工"}
                      {p.id === s.ownerID ? " · 房主" : ""}
                    </small>
                  </strong>
                  {p.is_ai && isOwner && (
                    <button
                      className="icon-button"
                      aria-label={`移除 ${p.nickname}`}
                      onClick={() => s.removeAI(id, i)}
                    >
                      ×
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span>等待特工入席</span>
                  {isOwner && (
                    <button
                      className="small-button"
                      onClick={() => s.addAI(id)}
                    >
                      + AI
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <button
        className="team-join"
        disabled={!s.connected || (!joined && players.length >= 4)}
        onClick={() => (joined ? s.leaveTeam() : s.selectTeam(id))}
      >
        {joined ? "已加入此队 · 离开座位" : "加入这支队伍"}{" "}
        <span>{joined ? "✓" : "↗"}</span>
      </button>
    </section>
  );
}
function Lobby() {
  const s = useGameStore();
  const [copied, setCopied] = useState(false);
  const owner = s.ownerID === s.myPlayerID;
  return (
    <div className="lobby">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BRIEFING ROOM</span>
          <h1>各就各位。</h1>
          <p>选择你的通信组。每队至少两位特工，准备好后开始行动。</p>
        </div>
        <button
          className="room-code"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(s.roomCode ?? "");
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <span>{copied ? "已复制房间码" : "点击复制 · 邀请朋友"}</span>
          <strong>{s.roomCode}</strong>
        </button>
      </div>
      <div className="teams">
        <Team id="A" players={s.teamA} />
        <div className="versus">
          VS
          <span>
            保持联系
            <br />
            保持秘密
          </span>
        </div>
        <Team id="B" players={s.teamB} />
      </div>
      <div className="lobby-launch">
        <span>
          <b className="status-dot" />{" "}
          {s.canStart
            ? "双方人员就绪，等待行动指令"
            : "每队至少 2 人，房主可以添加 AI"}
        </span>
        <button
          className="primary"
          disabled={!owner || !s.canStart || !s.connected}
          onClick={s.startGame}
        >
          {owner ? "开始行动" : "等待房主开始"} <span>→</span>
        </button>
      </div>
      <Rules />
    </div>
  );
}
function Timer({ duration }: { duration: number }) {
  const [deadline] = useState(() => Date.now() + duration * 1000);
  const [left, setLeft] = useState(duration);
  useEffect(() => {
    const id = window.setInterval(
      () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      250,
    );
    return () => clearInterval(id);
  }, [deadline]);
  return (
    <div
      className={`timer ${left <= 15 ? "urgent" : ""}`}
      aria-label={`阶段剩余约 ${left} 秒`}
    >
      <span>阶段倒计时</span>
      <b>
        {String(Math.floor(left / 60)).padStart(2, "0")}
        <i>:</i>
        {String(left % 60).padStart(2, "0")}
      </b>
    </div>
  );
}
function Scoreboard() {
  const s = useGameStore();
  return (
    <div className="scoreboard">
      {(["A", "B"] as const).map((team) => {
        const score = team === "A" ? s.scoreA : s.scoreB;
        return (
          <div key={team}>
            <strong>
              {team === "A" ? "◯ 白方" : "● 黑方"}
              {s.myTeam === team ? " · 我方" : ""}
            </strong>
            <span>
              拦截 <b>{score.interceptions}/2</b>
            </span>
            <span>
              失误 <b>{score.decrypt_failures}/2</b>
            </span>
          </div>
        );
      })}
    </div>
  );
}
function WordRack() {
  const s = useGameStore();
  const [visible, setVisible] = useState(true);
  return (
    <section className="word-rack">
      <header>
        <span>
          我方密码终端 <b>{s.myTeam === "A" ? "WHITE" : "BLACK"}</b>
        </span>
        <button onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
          {visible ? "遮住秘密词" : "显示秘密词"}
        </button>
      </header>
      <div className="word-windows">
        {Array.from({ length: 4 }, (_, i) => (
          <div className="word-window" key={i}>
            <span title={visible ? s.myWords[i] : undefined}>{visible ? s.myWords[i]?.split("[")[0] || "—" : "••••"}</span>
            <b>{i + 1}</b>
          </div>
        ))}
      </div>
      <footer>
        <span>仅我方可见</span>
        <span>DECRYPTO / KEYWORD TERMINAL</span>
      </footer>
    </section>
  );
}
function History() {
  const s = useGameStore();
  const [team, setTeam] = useState("all");
  const rows = s.history.filter((r) => team === "all" || r.team === team);
  return (
    <section className="history">
      <header>
        <div>
          <span className="eyebrow">SIGNAL ARCHIVE</span>
          <h2>截获记录</h2>
        </div>
        <select
          aria-label="筛选记录队伍"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        >
          <option value="all">所有频道</option>
          <option value="A">白方频道</option>
          <option value="B">黑方频道</option>
        </select>
      </header>
      {rows.length ? (
        <div className="history-scroll">
          <table>
            <thead>
              <tr>
                <th>回合</th>
                <th>公开线索</th>
                <th>密码</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.round}>
                  <td>
                    <b>{String(r.round).padStart(2, "0")}</b>
                    <small>{r.team === "A" ? "白方" : "黑方"}</small>
                  </td>
                  <td>
                    {r.clues.map((c, i) => (
                      <span key={i}>
                        <small>{i + 1}</small> {c}
                      </span>
                    ))}
                  </td>
                  <td>{r.secret?.join(" · ") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-history">
          <span>∿</span>
          <p>频道暂时安静。</p>
          <small>
            已完成回合的线索和密码
            <br />
            将在下一回合开始时归档。
          </small>
        </div>
      )}
    </section>
  );
}
function ActionPanel() {
  const s = useGameStore();
  const [clues, setClues] = useState(["", "", ""]);
  const [guess, setGuess] = useState([0, 0, 0]);
  const [submitted, setSubmitted] = useState(false);
  const encrypting = s.phase === "encrypting" && s.myRole === "encryptor";
  const guessing =
    (s.phase === "intercept" && s.myRole === "opponent") ||
    (s.phase === "decrypt" && s.myRole === "teammate");
  const action = encrypting
    ? "encrypt"
    : s.phase === "intercept"
      ? "intercept"
      : "decrypt";
  useEffect(() => {
    if (s.error) setSubmitted(false);
  }, [s.error]);
  const title = encrypting
    ? "把秘密，藏进线索。"
    : guessing
      ? s.phase === "intercept"
        ? "听懂对手的言外之意。"
        : "接收队友的秘密。"
      : s.phase === "encrypting"
        ? "有人正在组织语言。"
        : s.phase === "intercept"
          ? "对方正在监听。"
          : "等待解密结果。";
  function progress(values: string[] | number[], focus = 0) {
    s.sendProgress(action, values.filter(Boolean).length, {
      state: "editing",
      focus,
      ...(guessing ? { guesses: values as number[] } : {}),
    });
  }
  function submit() {
    if (!s.connected || submitted) return;
    s.clearError();
    setSubmitted(true);
    s.sendProgress(action, 3, {
      state: "submitted",
      guesses: guessing ? guess : undefined,
    });
    if (encrypting)
      s.submitClues(clues.map((c) => c.trim()) as [string, string, string]);
    else if (s.phase === "intercept")
      s.submitIntercept(guess as [number, number, number]);
    else s.submitDecrypt(guess as [number, number, number]);
  }
  return (
    <section className="action-panel">
      <header>
        <div>
          <span className="eyebrow">
            {encrypting
              ? "ENCRYPT & TRANSMIT"
              : guessing
                ? "DECODE THE SIGNAL"
                : "LIVE TRANSMISSION"}
          </span>
          <h2>{title}</h2>
        </div>
        <Timer duration={s.phase === "encrypting" ? 90 : 60} />
      </header>
      {encrypting ? (
        <p className="action-description">
          按密码顺序各写一条线索，让队友猜出对应编号。别直接说出秘密词。
        </p>
      ) : guessing ? (
        <p className="action-description">
          依次选择三条线索对应的编号。三个数字不能重复。
        </p>
      ) : (
        <p className="action-description">
          {s.encryptor ? `本回合加密者：${s.encryptor}。` : ""}
          留意公开线索，也可以翻阅截获记录。
        </p>
      )}
      <div className="clue-slots">
        {[0, 1, 2].map((i) => (
          <div className="clue-slot" key={i}>
            <div className="clue-slot-head">
              <span>线索 0{i + 1}</span>
              {encrypting && <b>密码 {s.secretDigits[i] ?? "—"}</b>}
            </div>
            {encrypting ? (
              <>
                <strong className="secret-word">
                  {s.secretWords[i]?.split("[")[0] ?? "等待密码"}
                </strong>
                <input
                  aria-label={`第 ${i + 1} 条线索`}
                  placeholder="写下关联线索…"
                  maxLength={40}
                  value={clues[i]}
                  disabled={submitted}
                  onFocus={() => progress(clues, i + 1)}
                  onChange={(e) => {
                    const next = [...clues];
                    next[i] = e.target.value;
                    setClues(next);
                    progress(next, i + 1);
                  }}
                />
              </>
            ) : (
              <>
                <strong className="public-clue">{s.clues[i] || "···"}</strong>
                {guessing ? (
                  <div
                    className="number-keys"
                    role="group"
                    aria-label={`第 ${i + 1} 条线索的编号`}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        aria-pressed={guess[i] === n}
                        disabled={
                          submitted || (guess.includes(n) && guess[i] !== n)
                        }
                        onClick={() => {
                          const next = [...guess];
                          next[i] = guess[i] === n ? 0 : n;
                          setGuess(next);
                          progress(next, i + 1);
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="signal-slot">
                    <span
                      className={
                        s.playerProgress && s.playerProgress.step > i
                          ? "complete"
                          : ""
                      }
                    />
                    {s.playerProgress && s.playerProgress.step > i
                      ? "已完成"
                      : "等待信号"}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {encrypting || guessing ? (
        <div className="submit-row">
          <span>
            {submitted
              ? "电报已发出，等待服务器确认…"
              : encrypting
                ? `已填写 ${clues.filter((c) => c.trim()).length} / 3 条线索`
                : `当前密码：${guess.map((n) => n || "—").join(" · ")}`}
          </span>
          <button
            className="primary"
            disabled={
              submitted ||
              !s.connected ||
              (encrypting
                ? !clues.every((c) => c.trim()) || s.secretDigits.length !== 3
                : guess.some((n) => n === 0))
            }
            onClick={submit}
          >
            {submitted ? "已发送 ✓" : encrypting ? "发送加密线索" : "提交密码"}{" "}
            <span>→</span>
          </button>
        </div>
      ) : (
        <div className="live-status" role="status">
          <span className="status-dot" />
          {s.aiStatus
            ? `${s.aiStatus.player} 正在思考第 ${s.aiStatus.step} 条${s.aiStatus.action === "encrypt" ? "线索" : "密码"}`
            : s.playerProgress
              ? `${s.playerProgress.player} ${s.playerProgress.state === "submitted" ? "已提交" : `已完成 ${s.playerProgress.step} / 3`}`
              : "通信进行中，请稍候…"}
        </div>
      )}
    </section>
  );
}
function Result() {
  const s = useGameStore();
  const final = s.phase === "game_over";
  const result = s.roundResult;
  const title = final
    ? s.gameOver?.winner
      ? `${s.gameOver.winner === "A" ? "白方" : "黑方"}赢得了这场暗战。`
      : "势均力敌，行动结束。"
    : result?.decrypt_success !== undefined
      ? result.decrypt_success
        ? "通信成功。"
        : "信号误读。"
      : result?.intercept_success
        ? "密码被截获。"
        : "拦截未成功。";
  return (
    <section className="result-panel">
      <span className="eyebrow">
        {final
          ? "OPERATION COMPLETE"
          : `TRANSMISSION ${String(s.round).padStart(2, "0")}`}
      </span>
      <div className="result-symbol">
        {final
          ? "◎"
          : result?.decrypt_success || result?.intercept_success
            ? "✓"
            : "∕"}
      </div>
      <h1>{title}</h1>
      <p>
        {final
          ? "每一句看似普通的话，都藏着一场交锋。"
          : result?.intercept_success === false &&
              result.decrypt_success === undefined
            ? "监听结束，即将转入本队解密。"
            : "结果已记录，等待下一轮通信。"}
      </p>
      <Scoreboard />
      {final && (
        <button
          className="primary"
          onClick={() => {
            s.reset();
            s.connect();
          }}
        >
          返回通信局 <span>↗</span>
        </button>
      )}
    </section>
  );
}
function Game() {
  const s = useGameStore();
  const result = s.phase === "round_result" || s.phase === "game_over";
  return (
    <div className="game">
      <div className="game-topline">
        <div>
          <span className="eyebrow">ROOM {s.roomCode}</span>
          <h1>
            第 {String(s.round).padStart(2, "0")} 回合 <span>/ 16</span>
          </h1>
        </div>
        <div className="phase-track">
          {["加密", "拦截", "解密"].map((p, i) => (
            <span
              key={p}
              className={
                ["encrypting", "intercept", "decrypt"][i] === s.phase
                  ? "active"
                  : ""
              }
            >
              0{i + 1} {p}
            </span>
          ))}
        </div>
        <span className="role-tag">
          {s.myTeam === "A" ? "白方" : "黑方"} /{" "}
          {s.myRole === "encryptor"
            ? "加密者"
            : s.myRole === "teammate"
              ? "解密员"
              : "监听员"}
        </span>
      </div>
      <div className="game-grid">
        <div className="game-main">
          {result ? (
            <Result />
          ) : (
            <>
              <WordRack />
              <ActionPanel key={`${s.round}-${s.phase}-${s.myRole}`} />
              <Scoreboard />
            </>
          )}
        </div>
        <aside className="game-aside">
          <History />
          <Miniature />
        </aside>
      </div>
    </div>
  );
}
export default function App() {
  const s = useGameStore();
  useEffect(() => {
    s.connect();
    return () => useGameStore.getState().disconnect();
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [s.phase]);
  return (
    <main className="app-shell">
      <header className="site-header">
        <Brand />
        <div className="header-right">
          <span className="header-edition">THE CODEBREAKING TABLE GAME</span>
          <span
            className={`connection ${s.connected ? "online" : ""}`}
            role="status"
          >
            <i />
            {s.connected ? "频道在线" : "正在连接"}
          </span>
        </div>
      </header>
      {s.error && (
        <div className="error-banner" role="alert">
          <span>{s.error}</span>
          <button onClick={s.clearError} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}
      {s.phase === "home" ? (
        <Home />
      ) : s.phase === "room" ? (
        <Lobby />
      ) : (
        <Game />
      )}
      <footer className="site-footer">
        <span>
          DECRYPTO <i>©</i> 谍报风云
        </span>
        <span>COMMUNICATE SAFELY.</span>
        <span>非官方线上演绎</span>
      </footer>
    </main>
  );
}
