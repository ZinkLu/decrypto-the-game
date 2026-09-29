import { translate } from './i18n';
import { dotGrid, dotText, dotType, dotWordLayout } from './dotMatrix';
import { consoleHardware, diskInscription, teamPalette, word, archiveRows, scopeModes, scopeWaveBlend, scopeTimebase, scopeRatio, scopeSweepHz, scopeAxisAngle, scopeFigures } from './model';
import type { LocalState, StationState } from './model';
import { paperHeadReserve, paperTextureLength, paperLengthForRecords, paperTextureHeight } from './mechanics';
import { guideSteps } from './guide';
import type { Frame } from './paint';
import { CREAM, FONT, INK, fitLabel, keyword, line, plateWear, printWear, round, segmentDigit, text, type Painter } from './paintKit';

const guidePages = guideSteps.length;

/**
 * The phase clock is the only surface that changes every second, so it is also
 * painted on its own: a countdown then repaints and uploads one small texture.
 */
export function paintClock(s: StationState, u: LocalState): Frame {
    const h = consoleHardware(u, s);
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    const canvas = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = 218;
    const cl = canvas.getContext('2d')!;
    cl.fillStyle = '#16140f';
    round(cl, 0, 0, 520, 218, 12);
    cl.fill();
    const running = h.online && !['home', 'room', 'round_result', 'game_over'].includes(s.phase);
    const seconds = Math.max(0, Math.floor(u.seconds));
    const timer = running ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}${String(seconds % 60).padStart(2, '0')}` : '----';
    const glow = h.powered ? running ? seconds <= 15 ? '#ed8960' : '#efb663' : '#65563a' : '#2a2620';
    [34, 141, 288, 395].forEach((x, i) => segmentDigit(cl, timer[i], x, 25, glow));
    cl.fillStyle = glow;
    cl.fillRect(257, 61, 10, 10); cl.fillRect(257, 111, 10, 10);
    line(cl, 34, 174, 446, '#3e3a30');
    text(cl, running ? t("阶段余时 · 约") : t("等待行动"), 34, 199, 22, h.powered ? '#a39b79' : '#4b483a');
    return { canvas, width: 520, height: 218 };
}
export function knobLabel(id: string, u: LocalState) {
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    if (id === 'scope-tune') return t('信号频率 {0} Hz · Y:X {1}', [scopeFigures(scopeRatio(u.scopeFreq) * scopeSweepHz(u.scopeRate)), scopeRatio(u.scopeFreq).toFixed(3)]);
    if (id === 'scope-wave') {
        const blend = scopeWaveBlend(u.scopeWave);
        return blend.mix ? t('波形 · {0} → {1} {2}%', [t(scopeModes[blend.from]), t(scopeModes[blend.to]), Math.round(blend.mix * 100)]) : t('波形 · {0}', [t(scopeModes[blend.from])]);
    }
    if (id === 'scope-rate') return t('扫描时基 {0} ms/格', [scopeFigures(scopeTimebase(u.scopeRate) * 1000)]);
    if (id === 'scope-xy') {
        const turned = Math.round(scopeAxisAngle(u.scopeAxis) * 180 / Math.PI);
        return turned <= 0 ? t('水平偏转 · 时基扫描') : turned >= 90 ? t('水平偏转 · X-Y') : t('水平偏转 · 转向 X-Y {0}°', [turned]);
    }
    const instrumentLabels = {
        original: [t("调整 VU 表摆动幅度"), t("调整 VU 表摆动频率")],
        signal: [u.instrumentDemo ? t("转动调谐旋钮，切回手动调谐") : t("调谐模拟频道，刻度 {0} / 100", [Number((u.meterAmplitude * 2.5).toFixed(1))]), t("调整接收增益")],
        tuning: [t("调整调谐频率，中央为第五档"), t("微调中央归零表")],
        status: [t("切换机械状态，{0}", [[t("READY 就绪"), t("SEND 发送"), t("WAIT 等待")][u.meterAmplitude]]), t("调整转鼓演示停留时间")],
    }[u.instrumentVariant];
    const amplitude = id === 'meter-amplitude';
    const label = instrumentLabels[amplitude ? 0 : 1];
    return u.instrumentVariant === 'signal' && amplitude ? label : `${label} · ${(amplitude ? u.meterAmplitude : u.meterRate).toFixed(2)}`;
}

/** The four keyword windows, as LED modules or as small tubes. Returns whether they are LED modules. */
export function paintWords(p: Painter) {
    const { s, u, h, t, colors, hasGame, frame, target } = p;
    // One source texel per LED; a stroke's antialiased coverage becomes that lamp's duty cycle.
    const dotWords = u.wordDisplay !== 'crt';
    const measureCanvas = document.createElement('canvas').getContext('2d')!;
    const measureDotWord = (value: string, size: number) => {
        measureCanvas.font = `500 ${size}px ${FONT}`;
        return measureCanvas.measureText(value).width;
    };
    for (let i = 0; dotWords && i < 4; i++) {
        const shown = hasGame && !u.hiddenWords ? word(s.myWords[i], u.locale) || '' : '';
        const value = !h.online ? t('离线') : !hasGame ? s.phase === 'room' ? t('待开局') : t('待接入') :
            u.hiddenWords ? '••••' : shown || t('待载入');
        const layout = dotWordLayout(value, measureDotWord);
        const strip = Math.max(dotGrid.cols, layout.width + 2 * dotGrid.inset);
        const g = frame('word' + i, strip, dotGrid.rows, '#000');
        const plot = (x: number, y: number, w: number, h: number) => g.fillRect(x, y, w, h);
        const left = dotGrid.inset, right = dotGrid.cols - left, legend = dotType.legend;
        // A channel's brightness is its die's duty cycle: full for type, half for rules.
        g.fillStyle = '#0f0';
        g.fillRect(left, 4, 17, 13);
        g.fillStyle = '#000';
        dotText(String(i + 1).padStart(2, '0'), left + 3, 7, plot);
        g.fillStyle = '#007a00';
        for (let x = left + 21; x < 58; x += 3) g.fillRect(x, 10, 1, 1);
        g.textAlign = 'right';
        fitLabel(g, !h.online ? t('等待连接') : s.myTeam ? t('我方 / {0}', [s.myTeam]) : t('设备待命'), right, 10.5, legend, '#0f0', 400, 52);
        g.textAlign = 'left';
        const middle = (dotGrid.bandTop + dotGrid.bandBottom + 1) / 2;
        layout.lines.forEach((line, n) => text(g, line, left,
            middle + (n - (layout.lines.length - 1) / 2) * dotType.leading, layout.size, h.online ? '#f00' : '#00f', 500));
        g.fillStyle = '#007a00'; g.fillRect(left, 53, right - left, 1);
        const footer = !h.online ? t('连接后恢复') : !hasGame ? t('密钥待分配') :
            u.hiddenWords ? t('已遮住') : t('仅我方可见');
        const statusInk = h.online ? '#0f0' : '#00f';
        g.fillStyle = statusInk; g.fillRect(left, 59, 3, 5);
        fitLabel(g, footer, left + 7, 61.5, legend, statusInk, 400, right - left - 7);
        target('word' + i, 'words', !h.online ? t('离线') : u.hiddenWords ? t('显示秘密词') : t('遮住秘密词'), 0, 0, strip, dotGrid.rows, { disabled: !h.online || !hasGame });
    }
    for (let i = 0; !dotWords && i < 4; i++) {
        const g = frame('word' + i, 480, 284, colors.crt.background);
        const grad = g.createLinearGradient(0, 0, 0, 284);
        grad.addColorStop(0, colors.crt.rim + '3d');
        grad.addColorStop(.6, colors.crt.background + '00');
        grad.addColorStop(1, colors.crt.rim + '30');
        g.fillStyle = grad;
        g.fillRect(0, 0, 480, 284);
        g.strokeStyle = colors.crt.rim + '66';
        g.lineWidth = 1;
        for (let x = 20; x < 480; x += 40) {
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, 284);
            g.stroke();
        }
        for (let y = 15; y < 284; y += 40)
            line(g, 0, y, 480, colors.crt.rim + '66');
        text(g, t("密钥 / 0{0}", [i + 1]), 26, 31, 17, colors.crt.light, 500);
        line(g, 26, 55, 426, colors.crt.rim);
        text(g, String(i + 1), 27, 127, 83, colors.crt.light, 600);
        keyword(g, !h.online ? t('离线') : !hasGame ? s.phase === 'room' ? t("待开局") : t("待接入") : u.hiddenWords ? '••••' : word(s.myWords[i], u.locale) || t("待载入"), 119, 128, 330, colors.crt.light);
        text(g, !h.online ? t('等待连接') : hasGame ? t("仅我方可见") : t("开局后分配秘密词"), 123, 201, 20, colors.crt.light);
        line(g, 26, 237, 426, colors.crt.rim);
        text(g, !h.online ? t('连接后恢复') : !hasGame ? t("编号固定 / 每局重新分配") : u.hiddenWords ? t("● 已遮住 · 点击显示") : t("● 私密词窗 · 点击遮住"), 123, 259, 16, colors.crt.light);
        target('word' + i, 'words', !h.online ? t('离线') : u.hiddenWords ? t("显示秘密词") : t("遮住秘密词"), 0, 0, 480, 284, { disabled: !h.online || !hasGame });
    }
    return dotWords;
}

/** The key to the original game, the duty roster with its cards and plaques, and the copy key. */
export function paintRoster(p: Painter) {
    const { s, u, h, t, teams, frames, frame, target } = p;
    const b = frame('badge', 660, 150);
    b.textAlign = 'center';
    text(b, 'ORIGINAL GAME', 388, 76, 42, '#e7dfc9', 600);
    b.strokeStyle = '#c6bea6'; b.lineWidth = 4;
    b.beginPath();
    b.moveTo(68, 53); b.lineTo(91, 48); b.lineTo(113, 53); b.lineTo(136, 48);
    b.lineTo(136, 97); b.lineTo(113, 102); b.lineTo(91, 97); b.lineTo(68, 102); b.closePath();
    b.moveTo(113, 53); b.lineTo(113, 102); b.stroke();
    // The hit area follows the complete keycap around the smaller ivory inset.
    target('badge', 'about', u.about ? t('返回操作') : t('原版桌游与购买'), -43, -47, 746, 244);
    // Only ink lives in these textures. Blender owns each card, channel and clip.
    const ro = frame('roster', 800, 1630);
    ro.scale(2, 2);
    frames.roster.width = 400; frames.roster.height = 815;
    text(ro, 'DUTY ROSTER', 24, 32, 22, CREAM, 600);
    line(ro, 22, 55, 356, '#6e685c');
    teams.forEach(team => {
        const palette = teamPalette(team.team, s.myTeam, u.theme);
        const accent = palette.ink;
        const plaque = frame('roster' + team.team, 728, 96);
        // Transparent silkscreen leaves the modeled enamel and bevel visible.
        plateWear(plaque, 728, 96);
        plaque.scale(2, 2);
        if (palette.plate !== palette.ink) {
            plaque.strokeStyle = palette.ink; plaque.lineWidth = 1.5;
            plaque.strokeRect(2, 2, 360, 44);
        }
        text(plaque, t("{0} 队{1}", [team.team, team.own ? t(" / 我方") : '']), 14, 25, 27, palette.onPlate, 600);
        text(plaque, `${team.count} / 4`, 279, 25, 23, palette.onPlate, 500);
        printWear(plaque, 364, 48);
        team.seats.forEach((seat, i) => {
            const p = seat.player;
            const card = frame('roster' + team.team + i, 708, 118);
            card.scale(2, 2);
            const well = frame('rosterWell' + team.team + i, 708, 118);
            well.scale(2, 2);
            if (p) {
                text(card, p.nickname, 20, 19, 28, INK, 600, seat.self || seat.encryptor ? 258 : 318);
                if (seat.self || seat.encryptor) {
                    card.fillStyle = accent; card.fillRect(294, 7, 50, 25);
                    fitLabel(card, seat.self ? t("你") : t("发报"), 299, 20, 17, CREAM, 600, 40);
                }
                text(card, `${seat.code} · ${p.is_ai ? 'AI' : t("真人")}${seat.owner ? t(" · 房主") : ''}`, 20, 45, 17, '#4f4637', 500, 228);
                // Status shrinks to fit rather than being elided (ENCODING, LISTENING).
                fitLabel(card, t(seat.status), 263, 45, 17, accent, seat.acting ? 600 : 400, 81);
                if (seat.progress) {
                    for (let step = 0; step < 3; step++) {
                        card.fillStyle = step < seat.progress.step / seat.progress.total * 3 ? accent : '#b3a78d';
                        card.fillRect(267 + step * 24, 55, 18, 3);
                    }
                }
            } else {
                // The card is absent; the instruction is stamped into the empty
                // well floor: a dark cut with a faint lower lip of light.
                for (const [dy, color] of [[1.2, '#3d382e'], [0, '#989075']] as const) {
                    text(well, '+', 20, 19 + dy, 27, color);
                    text(well, 'OPEN SEAT', 44, 19 + dy, 26, color, 500);
                    text(well, `${seat.code} / INSERT ID CARD`, 20, 45 + dy, 16, color, 400, 298);
                }
            }
        });
    });
    frame('channel', 600, 240); // Live room digits are modeled wire cathodes.
    const copy = frame('channelCopy', 240, 160);
    copy.textAlign = 'center';
    text(copy, 'COPY', 120, 80, 62, INK, 600);
    target('channelCopy', 'copy-code', t("复制房间码"), 0, 0, 240, 160, { disabled: !h.online || !s.roomCode });
}

/** The score register. Returns which of its flags show. */
export function paintScore(p: Painter) {
    const { s, frames, frame } = p;
    const scoreFlags: Record<string, boolean> = {};
    // Printed at twice the plate's layout resolution so close views stay sharp.
    const sc = frame('score', 1200, 714);
    sc.scale(2, 2);
    frames.score.width = 600; frames.score.height = 357;
    text(sc, "INTERCEPT", 155, 65, 24, '#57534b', 600);
    text(sc, "ERROR", 397, 65, 24, '#57534b', 600);
    line(sc, 26, 99, 548, '#857f74');
    ['A', 'B'].forEach((team, i) => {
        const score = team === 'A' ? s.scoreA : s.scoreB;
        const yy = 153 + i * 103;
        text(sc, team, 43, yy, 38, '#45413a', 600);
        [score.interceptions, score.decrypt_failures].forEach((n, j) => {
            for (let k = 0; k < 2; k++) {
                scoreFlags[`${team}_${j ? 'failure' : 'intercept'}_${k}`] = k < n;
            }
        });
        if (i === 0) line(sc, 28, 204, 546, '#999387');
    });
    line(sc, 26, 304, 548, '#857f74');
    text(sc, "2 INTERCEPTS TO WIN / 2 ERRORS TO LOSE", 68, 334, 19, '#3b3731');
    printWear(sc, 600, 357);
    plateWear(sc, 600, 357);
    return scoreFlags;
}

/** The receipt, as long as the rounds on record. Returns how many it carries. */
export function paintPaper(p: Painter) {
    const { s, t, frame, target } = p;
    const leader = frame('paper', 840, paperTextureHeight, '#eadfc5');
    const records = archiveRows(s, 'all');
    const pixelsPerUnit = paperTextureHeight / paperTextureLength;
    const printedHeight = pixelsPerUnit * paperLengthForRecords(records.length);
    const printedTop = paperTextureHeight - printedHeight;
    leader.textAlign = 'center';
    text(leader, t("{0} 条记录", [String(records.length).padStart(2, '0')]), 420, paperTextureHeight - 84, 18, '#87765b');
    text(leader, t("ENCRYPTO / 密报记录"), 420, printedTop + 43, 29, '#4e493b', 600);
    text(leader, t("频道 {0}   ·   {1} 条记录", [s.roomCode || '----', String(records.length).padStart(2, '0')]), 420, printedTop + 79, 21, '#786b52');
    line(leader, 52, printedTop + 103, 736, '#887b6266');
    leader.textAlign = 'left';
    // At rest the tear bar crosses the stock paperRestLength above the free end;
    // no print may sit under it, or glyph halves peek out below the teeth.
    if (records.length) {
        const rowPitch = (printedHeight - 330) / Math.max(1, records.length - 1);
        records.forEach((row, index) => {
            const y = printedTop + 132 + index * rowPitch;
            text(leader, t("{0}  {1} 队", [String(row.round).padStart(2, '0'), row.team]), 54, y, 29, '#574c38', 600);
            text(leader, row.clues.join(' / '), 218, y, 32, '#403c31', 500, 568);
            text(leader, t("截获 {0}   解码 {1}   密码 {2}", [row.intercept?.join('—') || '———', row.decrypt?.join('—') || '———', row.secret?.join('—') || t("未公开")]), 218, y + 36, 21, '#7c6c52', 400, 568);
            if (index < records.length - 1) line(leader, 52, y + 57, 736, '#a4967866');
        });
    } else {
        text(leader, t("等待第一份密报"), 228, printedTop + 128, 30, '#62583f', 500);
        text(leader, t("回合结束后自动打印公开记录"), 180, printedTop + 166, 24, '#87765b');
    }
    leader.textAlign = 'center';
    text(leader, t("下拉阅读"), 420, paperTextureHeight - 45, 22, '#766349', 500);
    // Above this sheet's header the roll already carries the start of the next
    // sheet: the same leader that will emerge after tearing.
    const reserve = Math.round(pixelsPerUnit * paperHeadReserve);
    leader.drawImage(leader.canvas, 0, paperTextureHeight - reserve, 840, reserve, 0, printedTop - reserve, 840, reserve);
    target('paper', 'archive-toggle', t("下拉纸带查看密报记录，关闭后撕下"), 0, 0, 840, paperTextureHeight);
    return records.length;
}

/** The drive, the dials, the keypad, the phase panel and ACTION. Returns whether ACTION would send something. */
export function paintFront(p: Painter) {
    const { s, u, h, r, t, signal, ownsDisk, diskCurrent, guidePage, frames, frame, target } = p;
    frame('disk', 400, 200);
    target('disk', 'disk-toggle', u.keyDisk.phase === 'ejected' ? t('按住露出的软盘继续拖出，或点击插回') : u.diskOut ? t("插入软盘，或按住向内推回") : t("按住向外拖出软盘，或点击弹出"), 0, 0, 400, 200,
        { disabled: !diskCurrent || !['ready', 'reading', 'ejected', 'removed', 'pulling'].includes(u.keyDisk.phase) });
    frame('diskEjectControl', 100, 100);
    target('diskEjectControl', 'disk-eject', t('弹出软盘'), 0, 0, 100, 100, { disabled: !diskCurrent || !['ready', 'reading'].includes(u.keyDisk.phase) });
    frame('scopeKnob', 100, 100);
    target('scopeKnob', 'scope-tune', knobLabel('scope-tune', u), 0, 0, 100, 100);
    frame('scopeWaveKnob', 100, 100);
    target('scopeWaveKnob', 'scope-wave', knobLabel('scope-wave', u), 0, 0, 100, 100);
    frame('scopeRateKnob', 100, 100);
    target('scopeRateKnob', 'scope-rate', knobLabel('scope-rate', u), 0, 0, 100, 100);
    frame('scopePersistenceKnob', 100, 100);
    target('scopePersistenceKnob', 'scope-xy', knobLabel('scope-xy', u), 0, 0, 100, 100);
    frames.clock = paintClock(s, u);
    for (let i = 0; i < 5; i++) {
        const k = frame('key' + i, 180, 200);
        // While the guide is up, the keypad turns its pages: 1–4 go to a page, ← goes back.
        const guide = u.manual && h.powered;
        const enabled = guide ? i < guidePages || guidePage > 0 : r.guess && r.active && h.online && !s.recovering && !u.about;
        text(k, i === 4 ? '←' : String(i + 1), i === 4 ? 27 : 53, 101, 96, enabled ? CREAM : '#8e897f', 500);
        target('key' + i, 'key-' + i, guide ? i === 4 ? t('上一页') : t('翻到第 {0} 页', [i + 1]) : i === 4 ? t("删除上一位") : t("输入数字 {0}", [i + 1]),
            0, 0, 180, 200, { disabled: !enabled });
    }
    // Three steps at a 132 px pitch; the modeled dividers sit at 129 and 261.
    const ph = frame('phase', 411, 214);
    [t("加密"), t("拦截"), t("解码")].forEach((label, i) => {
        const active = h.online && s.phase === ['encrypting', 'intercept', 'decrypt'][i];
        const x = 17 + i * 132;
        text(ph, `0${i + 1}`, x, 28, 18, h.powered ? '#a9a497' : '#4d4a43', 500);
        fitLabel(ph, label, x, 79, 23, active ? signal.color : h.powered ? '#a9a497' : '#4d4a43', 400, 88);
        ph.fillStyle = active ? signal.color : '#2b2824';
        round(ph, x + 2, 129, 78, 17, 8);
        ph.fill();
        if (i < 2) text(ph, '›', 114 + i * 132, 78, 28, h.powered ? '#857f75' : '#403c36');
    });
    text(ph, s.phase === 'home' || s.phase === 'room' ? t("等待行动开始") : t("第 {0} / 16 回合", [s.round]), 18, 190, 21, h.powered ? '#c1bcad' : '#4d4a43');
    const tr = frame('transmitLabel', 600, 164);
    const homeReady = s.phase === 'home' && !!u.name.trim() && (u.mode === 'create' || u.code.length === 4) && s.connected;
    const lobbyReady = s.phase === 'room' && s.canStart && s.ownerID === s.myPlayerID && s.connected;
    const ready = !!(r.ready || homeReady || lobbyReady || s.phase === 'game_over') && h.online && !u.manual && !u.about;
    const transmitText = s.phase === 'home' ? u.mode === 'create' ? t("建立频道") : t("加入频道") : s.phase === 'room' ? t("开始行动") : s.phase === 'game_over' ? t("回到房间") : u.submitted ? t("已发送") : t("发报 · 确认");
    const command = 'ACTION';
    tr.textAlign = 'center';
    tr.letterSpacing = '7px';
    text(tr, command, 304, 60, command.length > 6 ? 78 : 91, '#e9ddc2', 700);
    tr.letterSpacing = '3px';
    text(tr, 'PRESS TO CONFIRM', 302, 135, 25, '#e9ddc2', 500);
    frame('transmitControl', 600, 260);
    target('transmitControl', 'transmit', transmitText, 0, 0, 600, 260, { disabled: !ready });
    const dl = frame('disklabel', 900, 300);
    dl.scale(3, 3);
    const handwriting = diskInscription(u.keyDisk.id);
    dl.save();
    dl.translate(150 + handwriting.x, 43 + handwriting.y);
    dl.rotate(handwriting.tilt);
    dl.font = '700 52px "Disk Hand", "Bradley Hand", cursive';
    const handSize = Math.min(52, 52 * 260 / Math.max(1, dl.measureText(handwriting.text).width));
    dl.font = `700 ${handSize}px "Disk Hand", "Bradley Hand", cursive`;
    dl.textBaseline = 'middle';
    dl.fillStyle = handwriting.ink;
    const handWidth = dl.measureText(handwriting.text).width;
    let penSeed = handwriting.seed;
    [...handwriting.text].forEach((letter, index) => {
        penSeed = (Math.imul(penSeed, 1664525) + 1013904223) >>> 0;
        dl.save();
        dl.translate(-handWidth / 2 + dl.measureText(handwriting.text.slice(0, index)).width, ((penSeed >>> 16) % 7 - 3) * .28);
        dl.rotate(((penSeed >>> 24) % 7 - 3) * .007);
        dl.globalAlpha = .86 + (penSeed % 15) / 100;
        dl.fillText(letter, 0, 0);
        dl.restore();
    });
    if (handwriting.seed & 1) {
        dl.strokeStyle = handwriting.ink;
        dl.lineWidth = 1.2;
        dl.lineCap = 'round';
        dl.globalAlpha = .7;
        dl.beginPath();
        dl.moveTo(-handWidth / 2 - 2, 22);
        dl.quadraticCurveTo(4, 19 + handwriting.y, handWidth / 2 + 3, 23);
        dl.stroke();
    }
    dl.restore();
    text(dl, `KEY / ${String(s.round || 0).padStart(2, '0')}`, 16, 87, 13, '#817c70', 500);
    fitLabel(dl, ownsDisk ? t('{0} 队 · 仅你可见', [s.myTeam]) : 'ENCRYPTO', 116, 87, 13, '#817c70', 500, 168);
    frame('powerControl', 320, 180);
    target('powerControl', 'power-toggle', u.powerOn ? t("关闭终端电源") : t("开启终端电源"), 0, 0, 320, 180);
    const ft = frame('footer', 1100, 65);
    text(ft, 'NETWORK', 350, 32, 29, '#3e3a33');
    text(ft, 'UNOFFICIAL EDITION', 770, 32, 18, '#817c70');
    return ready;
}

/** The service side, and the instrument controls. Returns the controls that belong to the rear face. */
export function paintRear(p: Painter) {
    const { u, h, t, frame, target } = p;
    frame('batteryControl', 100, 100);
    target('batteryControl', 'battery-toggle', u.batteryOpen ? t("合上电池仓盖") : t("掀开电池仓盖，查看四节电池"), 0, 0, 100, 100);
    frame('soundControl', 100, 100);
    target('soundControl', 'sound-toggle', u.soundOn ? t("关闭音效") : t("开启音效"), 0, 0, 100, 100);
    frame('musicControl', 100, 100);
    target('musicControl', 'music-toggle', u.musicOn ? t('关闭背景音乐') : t('开启背景音乐'), 0, 0, 100, 100);
    frame('testControl', 100, 100);
    target('testControl', 'lamp-test', t("本机灯光自检，不改变对局连接"), 0, 0, 100, 100, { disabled: !h.powered });
    const rearControls = new Set(['battery-toggle', 'sound-toggle', 'music-toggle', 'lamp-test']);
    for (let i = 0; i < 4; i++) {
        const name = `batteryCell${i}Control`, id = `battery-cell-${i}`;
        frame(name, 100, 300);
        if (u.batteryOpen) target(name, id, t("{0}第 {1} 节电池", [u.removedBatteries & (1 << i) ? t("装回") : t("取出"), i + 1]), 0, 0, 100, 300);
        rearControls.add(id);
    }
    ['RJ45', 'Serial', 'DC'].forEach((name, i) => {
        const surface = `${name}PlugControl`, id = `cable-plug-${i}`;
        frame(surface, 180, 100);
        target(surface, id, u.unpluggedCables & (1 << i) ? `${t("插回")}${[t("网线"), t("串口线"), t("电源线")][i]}` : t(['拔出网线 · 终端将脱机', '拔出串口线 · SIGNAL 将失去输入', '拔出电源线 · 尝试由电池接管'][i]), 0, 0, 180, 100);
        rearControls.add(id);
    });
    for (const [name, id] of [['MeterAmplitude', 'meter-amplitude'], ['MeterRate', 'meter-rate']]) {
        frame(name + 'Control', 100, 100);
        target(name + 'Control', id, knobLabel(id, u), 0, 0, 100, 100);
    }
    frame('receiverSweepControl', 100, 100);
    if (u.instrumentVariant === 'signal') {
        target('receiverSweepControl', 'receiver-sweep',
            u.instrumentDemo ? t("关闭自动摆动，恢复手动调谐") : t("开启自动信号摆动"), 0, 0, 100, 100);
    }
    return rearControls;
}
