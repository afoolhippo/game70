(() => {
  "use strict";

  // =========================================================
  // 動物園閉園だよ！ - prototype
  // 画像ファイル:
  // title.png / result.png / zoo_bg.png
  // staff_up.png / staff_down.png / staff_left.png / staff_right.png
  // visitor_01.png ～ visitor_05.png
  // =========================================================

  const GAME_TIME = 30;
  const W = 540;
  const H = 960;

  const titleScreen = document.getElementById("titleScreen");
  const gameScreen = document.getElementById("gameScreen");
  const resultScreen = document.getElementById("resultScreen");

  const startBtn = document.getElementById("startBtn");
  const retryBtn = document.getElementById("retryBtn");
  const titleBtn = document.getElementById("titleBtn");

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const timeText = document.getElementById("timeText");
  const scoreText = document.getElementById("scoreText");
  const resultScore = document.getElementById("resultScore");
  const resultComment = document.getElementById("resultComment");
  const startOverlay = document.getElementById("startOverlay");
  const floatingLayer = document.getElementById("floatingLayer");
  const pushBtn = document.getElementById("pushBtn");

  const bg = loadImage("zoo_bg.png");
  const staffImages = {
    up: loadImage("staff_up.png"),
    down: loadImage("staff_down.png"),
    left: loadImage("staff_left.png"),
    right: loadImage("staff_right.png")
  };

  const visitorImages = Array.from({ length: 5 }, (_, i) =>
    loadImage(`visitor_0${i + 1}.png`)
  );

  const VISITOR_TYPES = [
    // 速度 / 押されやすさ / ランダム方向転換頻度
    { speed: 22, push: 1.00, turn: 1.6 }, // 普通
    { speed: 18, push: 0.95, turn: 1.0 }, // カメラ
    { speed: 34, push: 1.18, turn: 0.75 }, // 子ども
    { speed: 21, push: 1.00, turn: 0.85 }, // ウロウロ
    { speed: 13, push: 0.58, turn: 1.9 }  // 頑固
  ];

  // 背景画像の左上にある「出口ゲート」に合わせた判定。
  // 画像を差し替えたときはここだけ微調整すればOK。
  const EXIT = {
    x: 0,
    y: 145,
    w: 118,
    h: 250
  };

  // キャラクターが歩ける範囲
  const PLAY = {
    left: 38,
    right: 512,
    top: 240,
    bottom: 885
  };

  let state = "title";
  let rafId = 0;
  let lastTime = 0;
  let timeLeft = GAME_TIME;
  let score = 0;
  let secondAccumulator = 0;
  let gameStartedAt = 0;
  let audioCtx = null;

  const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    push: false
  };

  const player = {
    x: 335,
    y: 610,
    w: 72,
    h: 92,
    speed: 175,
    dir: "left",
    pushing: false,
    bob: 0
  };

  let visitors = [];

  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  function switchScreen(name) {
    titleScreen.classList.toggle("active", name === "title");
    gameScreen.classList.toggle("active", name === "game");
    resultScreen.classList.toggle("active", name === "result");
    state = name;
  }

  function resetGame() {
    cancelAnimationFrame(rafId);

    timeLeft = GAME_TIME;
    score = 0;
    secondAccumulator = 0;
    timeText.textContent = String(GAME_TIME);
    scoreText.textContent = "0人";
    floatingLayer.innerHTML = "";

    player.x = 335;
    player.y = 610;
    player.dir = "left";
    player.pushing = false;
    player.bob = 0;

    Object.keys(keys).forEach(k => keys[k] = false);
    document.querySelectorAll(".dir-btn").forEach(b => b.classList.remove("active"));
    pushBtn.classList.remove("active");

    visitors = [];
    // 最初は5人。同じ5種類を1人ずつ出す。
    for (let i = 0; i < 5; i++) {
      visitors.push(makeVisitor(i, true));
    }
  }

  function makeVisitor(typeIndex = Math.floor(Math.random() * 5), first = false) {
    let x, y;

    // 基本は園内の右側～中央に配置。
    // 開始直後にさすまたのすぐ横へ出ないようにする。
    let tries = 0;
    do {
      x = first
        ? 240 + Math.random() * 245
        : 330 + Math.random() * 155;
      y = 300 + Math.random() * 470;
      tries++;
    } while (
      tries < 20 &&
      Math.hypot(x - player.x, y - player.y) < 135
    );

    const angle = Math.random() * Math.PI * 2;

    return {
      type: typeIndex,
      img: visitorImages[typeIndex],
      x,
      y,
      w: typeIndex === 2 ? 54 : (typeIndex === 4 ? 72 : 62),
      h: typeIndex === 2 ? 68 : 78,
      vx: Math.cos(angle),
      vy: Math.sin(angle),
      dirTimer: .4 + Math.random() * 1.5,
      pauseTimer: 0,
      caught: false,
      wobble: Math.random() * Math.PI * 2,
      removed: false
    };
  }

  function startGame() {
    ensureAudio();
    resetGame();
    switchScreen("game");
    showStartMessage();

    // ほんの少し間を置いてから時間計測
    gameStartedAt = performance.now() + 650;
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function showStartMessage() {
    startOverlay.classList.remove("show");
    void startOverlay.offsetWidth;
    startOverlay.classList.add("show");
    beep(540, .08, "square", .035);
    setTimeout(() => beep(720, .10, "square", .035), 150);
  }

  function loop(now) {
    if (state !== "game") return;

    let dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = Math.min(dt, 0.033);

    if (now >= gameStartedAt) {
      update(dt);
    }

    draw();
    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    updateTimer(dt);
    if (state !== "game") return;

    updatePlayer(dt);
    updateVisitors(dt);
    resolvePush(dt);
  }

  function updateTimer(dt) {
    secondAccumulator += dt;

    while (secondAccumulator >= 1) {
      secondAccumulator -= 1;
      timeLeft -= 1;
      timeText.textContent = String(Math.max(0, timeLeft));

      if (timeLeft <= 5 && timeLeft > 0) {
        beep(430, .04, "square", .025);
      }

      if (timeLeft <= 0) {
        endGame();
        return;
      }
    }
  }

  function updatePlayer(dt) {
    let mx = 0;
    let my = 0;

    if (keys.left) mx -= 1;
    if (keys.right) mx += 1;
    if (keys.up) my -= 1;
    if (keys.down) my += 1;

    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;

      // 最後に強く入力された方向を完全に追う方式ではなく、
      // 現在の入力ベクトルの主成分で向きを決める。
      if (Math.abs(mx) > Math.abs(my)) {
        player.dir = mx < 0 ? "left" : "right";
      } else {
        player.dir = my < 0 ? "up" : "down";
      }

      const moveMul = keys.push ? 0.83 : 1;
      player.x += mx * player.speed * moveMul * dt;
      player.y += my * player.speed * moveMul * dt;
      player.bob += dt * 12;
    }

    player.pushing = keys.push;

    const halfW = player.w * .35;
    const halfH = player.h * .28;

    player.x = clamp(player.x, PLAY.left + halfW, PLAY.right - halfW);
    player.y = clamp(player.y, PLAY.top + halfH, PLAY.bottom - halfH);
  }

  function updateVisitors(dt) {
    for (const v of visitors) {
      if (v.removed) continue;

      v.wobble += dt * 6;

      if (v.caught) {
        // 押している間は通常移動を停止
        continue;
      }

      const type = VISITOR_TYPES[v.type];

      // カメラ客だけ、たまに立ち止まる
      if (v.type === 1 && v.pauseTimer <= 0 && Math.random() < dt * .18) {
        v.pauseTimer = .7 + Math.random() * .9;
      }

      if (v.pauseTimer > 0) {
        v.pauseTimer -= dt;
        continue;
      }

      v.dirTimer -= dt;
      if (v.dirTimer <= 0) {
        // visitor_04 は特に方向転換多め
        const angle = Math.random() * Math.PI * 2;
        v.vx = Math.cos(angle);
        v.vy = Math.sin(angle);
        v.dirTimer = type.turn * (.55 + Math.random() * 1.1);
      }

      v.x += v.vx * type.speed * dt;
      v.y += v.vy * type.speed * dt;

      // 出口に勝手に入ってしまわないよう、左側では押し戻す
      const minX = 125;
      if (v.x < minX) {
        v.x = minX;
        v.vx = Math.abs(v.vx);
      }
      if (v.x > PLAY.right - 20) {
        v.x = PLAY.right - 20;
        v.vx = -Math.abs(v.vx);
      }
      if (v.y < PLAY.top + 25) {
        v.y = PLAY.top + 25;
        v.vy = Math.abs(v.vy);
      }
      if (v.y > PLAY.bottom - 25) {
        v.y = PLAY.bottom - 25;
        v.vy = -Math.abs(v.vy);
      }
    }
  }

  function resolvePush(dt) {
    visitors.forEach(v => v.caught = false);
    if (!player.pushing) return;

    const hit = getPushHitbox();
    const pushVec = dirVector(player.dir);

    let pushedAny = false;

    for (const v of visitors) {
      if (v.removed) continue;

      const radius = Math.min(v.w, v.h) * .33;
      if (!circleRect(v.x, v.y, radius, hit)) continue;

      v.caught = true;
      pushedAny = true;

      const pushPower = 128 * VISITOR_TYPES[v.type].push;
      v.x += pushVec.x * pushPower * dt;
      v.y += pushVec.y * pushPower * dt;

      // さすまたの先端から極端にズレないよう軽く中央へ寄せる
      const target = pushTargetPoint();
      v.x += (target.x - v.x) * Math.min(1, dt * 4.2);
      v.y += (target.y - v.y) * Math.min(1, dt * 4.2);

      // 移動可能域はキープ。ただし出口方向だけは左へ抜けられる
      v.y = clamp(v.y, PLAY.top + 15, PLAY.bottom - 15);
      v.x = Math.min(v.x, PLAY.right - 10);

      if (isInExit(v)) {
        retireVisitor(v);
      }
    }

    if (pushedAny && Math.random() < dt * 8) {
      // 押している間の軽い「ググッ」音
      scrapeSound();
    }
  }

  function getPushHitbox() {
    const reach = 72;
    const thick = 56;

    switch (player.dir) {
      case "left":
        return { x: player.x - 92, y: player.y - thick / 2, w: reach, h: thick };
      case "right":
        return { x: player.x + 20, y: player.y - thick / 2, w: reach, h: thick };
      case "up":
        return { x: player.x - thick / 2, y: player.y - 96, w: thick, h: reach };
      default:
        return { x: player.x - thick / 2, y: player.y + 22, w: thick, h: reach };
    }
  }

  function pushTargetPoint() {
    switch (player.dir) {
      case "left": return { x: player.x - 72, y: player.y };
      case "right": return { x: player.x + 72, y: player.y };
      case "up": return { x: player.x, y: player.y - 76 };
      default: return { x: player.x, y: player.y + 76 };
    }
  }

  function dirVector(dir) {
    if (dir === "left") return { x: -1, y: 0 };
    if (dir === "right") return { x: 1, y: 0 };
    if (dir === "up") return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }

  function isInExit(v) {
    // このゲームでは「さすまたで押されている状態」でのみ退園成立。
    if (!v.caught) return false;

    return (
      v.x < EXIT.x + EXIT.w &&
      v.y > EXIT.y &&
      v.y < EXIT.y + EXIT.h
    );
  }

  function retireVisitor(v) {
    if (v.removed) return;

    v.removed = true;
    score++;
    scoreText.textContent = `${score}人`;

    floatText("退園！ +1", v.x / W * 100, v.y / H * 100);
    exitSound();
    vibrate(30);

    // 常に園内にお客さんがいる状態を保つ
    setTimeout(() => {
      if (state !== "game") return;
      const idx = visitors.indexOf(v);
      const replacement = makeVisitor(Math.floor(Math.random() * 5), false);
      if (idx >= 0) visitors[idx] = replacement;
    }, 420);
  }

  function endGame() {
    cancelAnimationFrame(rafId);
    timeLeft = 0;
    timeText.textContent = "0";

    beep(260, .11, "square", .04);
    setTimeout(() => beep(190, .16, "square", .045), 120);

    setTimeout(() => {
      resultScore.textContent = `退園 ${score}人`;
      resultComment.textContent = getResultComment(score);
      switchScreen("result");
    }, 450);
  }

  function getResultComment(n) {
    if (n >= 18) return "完璧な閉園！園内、静かです。";
    if (n >= 13) return "かなり帰ってもらいました。おつかれさまです。";
    if (n >= 8) return "閉園らしくなってきました。";
    if (n >= 4) return "まだまだ園内に人影が……。";
    return "本当に閉園できますか？";
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // 背景
    if (bg.complete && bg.naturalWidth) {
      ctx.drawImage(bg, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#0b1730";
      ctx.fillRect(0, 0, W, H);
    }

    // 退園エリアをほんのり示す（背景の出口位置に合わせる）
    ctx.save();
    ctx.globalAlpha = .13;
    ctx.fillStyle = "#ffe46b";
    ctx.fillRect(EXIT.x, EXIT.y, EXIT.w, EXIT.h);
    ctx.restore();

    // Y座標で並べると、上下移動した時に自然な前後関係になる
    const drawables = [];

    for (const v of visitors) {
      if (!v.removed) drawables.push({ kind: "visitor", y: v.y, ref: v });
    }
    drawables.push({ kind: "player", y: player.y, ref: player });
    drawables.sort((a, b) => a.y - b.y);

    for (const item of drawables) {
      if (item.kind === "visitor") drawVisitor(item.ref);
      else drawPlayer();
    }

    // さすまた判定をデバッグしたいときは true にする
    const DEBUG_HITBOX = false;
    if (DEBUG_HITBOX && player.pushing) {
      const h = getPushHitbox();
      ctx.save();
      ctx.fillStyle = "rgba(255,70,70,.35)";
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.restore();
    }
  }

  function drawPlayer() {
    const img = staffImages[player.dir];
    const bobY = (keys.up || keys.down || keys.left || keys.right)
      ? Math.sin(player.bob) * 2
      : 0;

    let scaleX = 1;
    let scaleY = 1;

    if (player.pushing) {
      // 押している感じを少しだけ出す
      if (player.dir === "left" || player.dir === "right") scaleX = 1.035;
      else scaleY = 1.035;
    }

    const dw = player.w * scaleX;
    const dh = player.h * scaleY;

    if (img.complete && img.naturalWidth) {
      ctx.drawImage(
        img,
        player.x - dw / 2,
        player.y - dh * .72 + bobY,
        dw,
        dh
      );
    } else {
      fallbackCharacter(player.x, player.y, "#61a56a", "員");
    }
  }

  function drawVisitor(v) {
    const wobble = v.caught ? Math.sin(v.wobble * 2.4) * 5 : 0;
    const bob = v.caught ? 0 : Math.sin(v.wobble) * 1.5;

    ctx.save();
    ctx.translate(v.x, v.y + bob);
    ctx.rotate(wobble * Math.PI / 180);

    if (v.img.complete && v.img.naturalWidth) {
      ctx.drawImage(v.img, -v.w / 2, -v.h * .72, v.w, v.h);
    } else {
      const fallback = ["#ddd", "#cfa56e", "#e7d467", "#ca8db8", "#9db1d7"];
      fallbackCharacter(0, 0, fallback[v.type], String(v.type + 1));
    }

    ctx.restore();
  }

  function fallbackCharacter(x, y, color, text) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.fillRect(-22, -50, 44, 52);
    ctx.fillStyle = "#222";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, 0, -18);
    ctx.restore();
  }

  function floatText(text, xPct, yPct) {
    const el = document.createElement("div");
    el.className = "float-score";
    el.textContent = text;
    el.style.left = `${xPct}%`;
    el.style.top = `${yPct}%`;
    floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function circleRect(cx, cy, r, rect) {
    const nx = clamp(cx, rect.x, rect.x + rect.w);
    const ny = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  }

  // -------------------------
  // 操作
  // -------------------------
  document.querySelectorAll(".dir-btn").forEach(btn => {
    const dir = btn.dataset.dir;

    const on = e => {
      e.preventDefault();
      keys[dir] = true;
      player.dir = dir;
      btn.classList.add("active");
    };

    const off = e => {
      e.preventDefault();
      keys[dir] = false;
      btn.classList.remove("active");
    };

    btn.addEventListener("pointerdown", e => {
      btn.setPointerCapture?.(e.pointerId);
      on(e);
    });
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointercancel", off);
    btn.addEventListener("lostpointercapture", off);
  });

  const pushOn = e => {
    e.preventDefault();
    ensureAudio();
    keys.push = true;
    pushBtn.classList.add("active");
    bumpSound();
  };

  const pushOff = e => {
    e.preventDefault();
    keys.push = false;
    pushBtn.classList.remove("active");
  };

  pushBtn.addEventListener("pointerdown", e => {
    pushBtn.setPointerCapture?.(e.pointerId);
    pushOn(e);
  });
  pushBtn.addEventListener("pointerup", pushOff);
  pushBtn.addEventListener("pointercancel", pushOff);
  pushBtn.addEventListener("lostpointercapture", pushOff);

  window.addEventListener("keydown", e => {
    if (state !== "game") {
      if ((e.key === "Enter" || e.key === " ") && state === "title") startGame();
      return;
    }

    const k = e.key.toLowerCase();

    if (e.key === "ArrowUp" || k === "w") {
      keys.up = true; player.dir = "up"; e.preventDefault();
    }
    if (e.key === "ArrowDown" || k === "s") {
      keys.down = true; player.dir = "down"; e.preventDefault();
    }
    if (e.key === "ArrowLeft" || k === "a") {
      keys.left = true; player.dir = "left"; e.preventDefault();
    }
    if (e.key === "ArrowRight" || k === "d") {
      keys.right = true; player.dir = "right"; e.preventDefault();
    }
    if (e.key === " " || e.key === "Enter" || k === "z") {
      if (!keys.push) bumpSound();
      keys.push = true;
      pushBtn.classList.add("active");
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", e => {
    const k = e.key.toLowerCase();
    if (e.key === "ArrowUp" || k === "w") keys.up = false;
    if (e.key === "ArrowDown" || k === "s") keys.down = false;
    if (e.key === "ArrowLeft" || k === "a") keys.left = false;
    if (e.key === "ArrowRight" || k === "d") keys.right = false;
    if (e.key === " " || e.key === "Enter" || k === "z") {
      keys.push = false;
      pushBtn.classList.remove("active");
    }
  });

  window.addEventListener("blur", () => {
    Object.keys(keys).forEach(k => keys[k] = false);
    document.querySelectorAll(".dir-btn").forEach(b => b.classList.remove("active"));
    pushBtn.classList.remove("active");
  });

  // -------------------------
  // Web Audio API：簡易SE
  // -------------------------
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function beep(freq, duration = .08, type = "square", volume = .03) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function bumpSound() {
    ensureAudio();
    beep(120, .045, "square", .018);
  }

  let lastScrape = 0;
  function scrapeSound() {
    if (!audioCtx) return;
    const now = performance.now();
    if (now - lastScrape < 120) return;
    lastScrape = now;
    beep(95 + Math.random() * 20, .03, "square", .012);
  }

  function exitSound() {
    ensureAudio();
    beep(620, .07, "square", .032);
    setTimeout(() => beep(850, .09, "square", .035), 70);
  }

  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // -------------------------
  // 画面ボタン
  // -------------------------
  startBtn.addEventListener("click", startGame);
  retryBtn.addEventListener("click", startGame);
  titleBtn.addEventListener("click", () => {
    cancelAnimationFrame(rafId);
    switchScreen("title");
  });

  // 初期表示
  switchScreen("title");
})();
