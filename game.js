(() => {
  "use strict";
  const GAME_ID = "game70";
  const GAME_TITLE = "動物園閉園だよ！";
  const GAME_URL = "https://afoolhippo.github.io/game70/";
  const ARCADE_URL = "https://afoolhippo.github.io/home/?skipTitle=1";
  const SUPABASE_URL = "https://gmncxnybsovlallxgnkd.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_ly3h5OhL8HDSHhYdmJq_Fw_9pG3mhla";
  const kabaDb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  let scoreRegistered = false;
  let resultButtonsTimer = 0;

  // =========================================================
  // 動物園閉園だよ！ - prototype
  // 画像ファイル:
  // title.png / result.png / zoo_bg.png
  // staff_up.png / staff_down.png / staff_left.png / staff_right.png
  // visitor_01.png ～ visitor_05.png
  // =========================================================

  const GAME_TIME = 60;
  const W = 540;
  const H = 960;

  const titleScreen = document.getElementById("titleScreen");
  const gameScreen = document.getElementById("gameScreen");
  const resultScreen = document.getElementById("resultScreen");

  const startBtn = document.getElementById("startBtn");
  const retryBtn = document.getElementById("retryBtn");
  const titleBtn = document.getElementById("titleBtn");
  const gameTitleBtn = document.getElementById("gameTitleBtn");

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const timeText = document.getElementById("timeText");
  const scoreText = document.getElementById("scoreText");
  const resultScore = document.getElementById("resultScore");
  const resultComment = document.getElementById("resultComment");
  const startOverlay = document.getElementById("startOverlay");
  const floatingLayer = document.getElementById("floatingLayer");
  const resultButtons = document.getElementById("resultButtons");
  const shareButton = document.getElementById("shareButton");
  const registerButton = document.getElementById("registerButton");
  const retryButton = document.getElementById("retryButton");
  const arcadeButton = document.getElementById("arcadeButton");
  const joystick = document.getElementById("joystick");
  const joystickKnob = document.getElementById("joystickKnob");
  const bgm = document.getElementById("bgm");
  const BGM_TARGET_VOLUME = 0.20;
  const BGM_FADE_IN = 1.0;
  const BGM_FADE_OUT = 1.0;
  let bgmFadeRaf = 0;
  let bgmLoopArmed = false;
  bgm.volume = 0;

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

  // 画面上部全体が退園エリア。
  // お客さんをこのラインより上へ押し出せば退園成立。
  const EXIT_Y = 145;

  // 押し出しアニメーション
  const PUSH_DISTANCE = 78;
  const PUSH_DURATION = 0.24;
  const PUSH_COOLDOWN = 0.30;

  // キャラクターが歩ける範囲
  const PLAY = {
    left: 38,
    right: 512,
    top: 150,
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
    right: false
  };

  const player = {
    x: 335,
    y: 610,
    w: 72,
    h: 92,
    speed: 175,
    dir: "left",
    pushing: false,
    pushCooldown: 0,
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
    scoreRegistered = false;
    if (resultButtonsTimer) clearTimeout(resultButtonsTimer);
    if (resultButtons) resultButtons.classList.add("hidden");
    if (registerButton) {
      registerButton.disabled = false;
      registerButton.textContent = "記録を登録";
    }
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
    player.pushCooldown = 0;
    player.bob = 0;

    Object.keys(keys).forEach(k => keys[k] = false);
    document.querySelectorAll(".dir-btn").forEach(b => b.classList.remove("active"));

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
      pushAnimating: false,
      pushElapsed: 0,
      pushFromX: x,
      pushFromY: y,
      pushToX: x,
      pushToY: y,
      wobble: Math.random() * Math.PI * 2,
      removed: false
    };
  }

  function startGame() {
    ensureAudio();
  
  if (shareButton) shareButton.addEventListener("click", shareResult);
  if (registerButton) registerButton.addEventListener("click", registerScore);
  if (retryButton) retryButton.addEventListener("click", returnToTitle);
  if (arcadeButton) arcadeButton.addEventListener("click", () => {
    window.location.href = ARCADE_URL;
  });

  resetGame();
    switchScreen("game");
    showStartMessage();

    startBgm();

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

      player.x += mx * player.speed * dt;
      player.y += my * player.speed * dt;
      player.bob += dt * 12;
    }

    player.pushing = false;
    if (player.pushCooldown > 0) player.pushCooldown -= dt;

    const halfW = player.w * .35;
    const halfH = player.h * .28;

    player.x = clamp(player.x, PLAY.left + halfW, PLAY.right - halfW);
    player.y = clamp(player.y, PLAY.top + halfH, PLAY.bottom - halfH);
  }

  function updateVisitors(dt) {
    for (const v of visitors) {
      if (v.removed) continue;

      v.wobble += dt * (v.pushAnimating ? 10 : 6);

      if (v.pushAnimating) {
        v.pushElapsed += dt;

        const t = clamp(v.pushElapsed / PUSH_DURATION, 0, 1);
        // easeOutCubic：最初は勢いよく、最後は滑らかに減速
        const eased = 1 - Math.pow(1 - t, 3);

        v.x = v.pushFromX + (v.pushToX - v.pushFromX) * eased;
        v.y = v.pushFromY + (v.pushToY - v.pushFromY) * eased;
        v.caught = true;

        if (t >= 1) {
          v.pushAnimating = false;
          v.caught = false;

          if (isInExit(v)) {
            retireVisitor(v);
            continue;
          }
        }

        // 押し出し中は通常の徘徊移動を止める
        continue;
      }

      v.caught = false;

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

      // お客さんが勝手に退園しないよう、通常移動時は退園ラインより下に留める
      if (v.y < EXIT_Y + 32) {
        v.y = EXIT_Y + 32;
        v.vy = Math.abs(v.vy);
      }
      if (v.x > PLAY.right - 20) {
        v.x = PLAY.right - 20;
        v.vx = -Math.abs(v.vx);
      }
      if (v.y > PLAY.bottom - 25) {
        v.y = PLAY.bottom - 25;
        v.vy = -Math.abs(v.vy);
      }
    }
  }

  function resolvePush(dt) {
    player.pushing = false;

    if (player.pushCooldown > 0) return;

    const hit = getPushHitbox();

    for (const v of visitors) {
      if (v.removed || v.pushAnimating) continue;

      const radius = Math.min(v.w, v.h) * .33;
      if (!circleRect(v.x, v.y, radius, hit)) continue;

      const pushVec = dirVector(player.dir);
      const pushDistance = PUSH_DISTANCE * VISITOR_TYPES[v.type].push;

      v.pushAnimating = true;
      v.caught = true;
      v.pushElapsed = 0;
      v.pushFromX = v.x;
      v.pushFromY = v.y;

      let targetX = v.x + pushVec.x * pushDistance;
      let targetY = v.y + pushVec.y * pushDistance;

      targetX = clamp(targetX, PLAY.left + 12, PLAY.right - 12);

      if (pushVec.y >= 0) {
        targetY = clamp(targetY, EXIT_Y + 24, PLAY.bottom - 15);
      } else {
        // 上方向だけは退園ラインを越えて押し出せる
        targetY = Math.max(targetY, 70);
      }

      v.pushToX = targetX;
      v.pushToY = targetY;

      player.pushing = true;
      player.pushCooldown = PUSH_COOLDOWN;

      hitPushSound();
      vibrate(24);

      // 1回の接触につき1人
      break;
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
    return v.y < EXIT_Y;
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
    stopBgmWithFade(.55);
    timeLeft = 0;
    timeText.textContent = "0";

    beep(260, .11, "square", .04);
    setTimeout(() => beep(190, .16, "square", .045), 120);

    setTimeout(() => {
      resultScore.textContent = `${score}人退園！`;
      switchScreen("result");
    }, 450);    showResultButtonsLater();
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

    // 画面上部全体の退園エリアをほんのり示す
    ctx.save();
    ctx.globalAlpha = .10;
    ctx.fillStyle = "#ffe46b";
    ctx.fillRect(0, 0, W, EXIT_Y);
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
    if (DEBUG_HITBOX) {
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
    const wobble = v.pushAnimating ? Math.sin(v.wobble * 2.1) * 2.5 : 0;
    const bob = v.pushAnimating ? 0 : Math.sin(v.wobble) * 1.5;

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



  const joystickState = { x: 0, y: 0, active: false, pointerId: null };

  function updateJoystickFromPointer(e) {
    if (!joystick || !joystickKnob) return;

    const r = joystick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;

    const max = r.width * 0.31;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = dx / len * max;
      dy = dy / len * max;
    }

    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joystickState.x = dx / max;
    joystickState.y = dy / max;

    const dead = 0.14;
    if (Math.hypot(joystickState.x, joystickState.y) < dead) {
      joystickState.x = 0;
      joystickState.y = 0;
    }
  }

  function resetJoystick() {
    joystickState.x = 0;
    joystickState.y = 0;
    joystickState.active = false;
    joystickState.pointerId = null;
    if (joystickKnob) joystickKnob.style.transform = "translate(0, 0)";
  }

  if (joystick) {
    joystick.addEventListener("pointerdown", e => {
      joystickState.active = true;
      joystickState.pointerId = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      updateJoystickFromPointer(e);
      ensureAudio();
      e.preventDefault();
    });

    joystick.addEventListener("pointermove", e => {
      if (!joystickState.active || e.pointerId !== joystickState.pointerId) return;
      updateJoystickFromPointer(e);
      e.preventDefault();
    });

    const releaseJoystick = e => {
      if (joystickState.pointerId !== null && e.pointerId !== joystickState.pointerId) return;
      resetJoystick();
      e.preventDefault();
    };

    joystick.addEventListener("pointerup", releaseJoystick);
    joystick.addEventListener("pointercancel", releaseJoystick);
    joystick.addEventListener("lostpointercapture", resetJoystick);
  }

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
  });

  window.addEventListener("keyup", e => {
    const k = e.key.toLowerCase();
    if (e.key === "ArrowUp" || k === "w") keys.up = false;
    if (e.key === "ArrowDown" || k === "s") keys.down = false;
    if (e.key === "ArrowLeft" || k === "a") keys.left = false;
    if (e.key === "ArrowRight" || k === "d") keys.right = false;
  });

  window.addEventListener("blur", () => {
    Object.keys(keys).forEach(k => keys[k] = false);
    document.querySelectorAll(".dir-btn").forEach(b => b.classList.remove("active"));
  });



  function showResultButtonsLater() {
    if (!resultButtons) return;
    if (resultButtonsTimer) clearTimeout(resultButtonsTimer);
    resultButtons.classList.add("hidden");
    resultButtonsTimer = setTimeout(() => {
      resultButtons.classList.remove("hidden");
    }, 1500);
  }

  function shareResult() {
    const text =
      `閉園です！お帰りくださーい！🌙🦛\n` +
      `${score}人退園！\n` +
      `無料ブラウザゲーム「${GAME_TITLE}」\n` +
      `${GAME_URL}\n` +
      `#動物園閉園だよ\n#カバゲーセン`;

    const url = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function registerScore() {
    if (scoreRegistered) {
      alert("この記録は登録済みです");
      return;
    }
    if (!kabaDb) {
      alert("記録登録の準備に失敗しました");
      return;
    }

    const nickname = prompt("ニックネームを入力してね", "匿名カバ");
    if (!nickname) return;

    registerButton.disabled = true;
    registerButton.textContent = "登録中...";

    const { error } = await kabaDb
      .from("kaba_scores")
      .insert({
        game_id: GAME_ID,
        game_title: GAME_TITLE,
        nickname: nickname.trim(),
        rank_title: "",
        score: score
      });

    if (error) {
      console.error(error);
      registerButton.disabled = false;
      registerButton.textContent = "記録を登録";
      alert("登録に失敗しました");
      return;
    }

    scoreRegistered = true;
    registerButton.textContent = "登録済み";
    registerButton.disabled = true;
    alert("記録を登録しました！");
  }

  // -------------------------
  // BGM：フェードイン／フェードアウト付きループ
  // -------------------------
  function cancelBgmFade() {
    if (bgmFadeRaf) {
      cancelAnimationFrame(bgmFadeRaf);
      bgmFadeRaf = 0;
    }
  }

  function fadeBgm(from, to, duration, onDone = null) {
    cancelBgmFade();

    const start = performance.now();
    bgm.volume = clamp(from, 0, 1);

    const step = now => {
      const t = clamp((now - start) / (duration * 1000), 0, 1);
      // smoothstep
      const eased = t * t * (3 - 2 * t);
      bgm.volume = from + (to - from) * eased;

      if (t < 1) {
        bgmFadeRaf = requestAnimationFrame(step);
      } else {
        bgmFadeRaf = 0;
        if (onDone) onDone();
      }
    };

    bgmFadeRaf = requestAnimationFrame(step);
  }

  function armBgmLoopWatcher() {
    if (bgmLoopArmed) return;
    bgmLoopArmed = true;

    bgm.addEventListener("timeupdate", () => {
      if (state !== "game") return;
      if (!Number.isFinite(bgm.duration) || bgm.duration <= 0) return;

      const remain = bgm.duration - bgm.currentTime;

      // 曲末1秒前からフェードアウト
      if (remain <= BGM_FADE_OUT && remain > 0 && !bgm.dataset.fadingOut) {
        bgm.dataset.fadingOut = "1";
        fadeBgm(bgm.volume, 0, Math.max(.2, remain));
      }
    });

    bgm.addEventListener("ended", () => {
      if (state !== "game") return;

      delete bgm.dataset.fadingOut;
      bgm.currentTime = 0;
      bgm.volume = 0;

      bgm.play().then(() => {
        fadeBgm(0, BGM_TARGET_VOLUME, BGM_FADE_IN);
      }).catch(() => {});
    });
  }

  function startBgm() {
    armBgmLoopWatcher();
    cancelBgmFade();
    delete bgm.dataset.fadingOut;

    bgm.pause();
    bgm.currentTime = 0;
    bgm.volume = 0;

    bgm.play().then(() => {
      fadeBgm(0, BGM_TARGET_VOLUME, BGM_FADE_IN);
    }).catch(() => {});
  }

  function stopBgmWithFade(duration = .5) {
    delete bgm.dataset.fadingOut;

    if (bgm.paused) {
      cancelBgmFade();
      bgm.volume = 0;
      bgm.currentTime = 0;
      return;
    }

    const from = bgm.volume;
    fadeBgm(from, 0, duration, () => {
      bgm.pause();
      bgm.currentTime = 0;
      bgm.volume = 0;
    });
  }

  // -------------------------
  // Web Audio API：簡易SE
  // -------------------------
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
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

  function noiseBurst(duration = .06, volume = .018) {
    if (!audioCtx) return;

    const length = Math.floor(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);

    source.connect(gain);
    gain.connect(audioCtx.destination);
    source.start();
  }

  function hitPushSound() {
    ensureAudio();

    // 「ガシッ！」
    beep(145, .055, "square", .035);
    noiseBurst(.045, .015);

    // 少し遅れて「ズザッ！」
    setTimeout(() => {
      beep(105, .085, "sawtooth", .018);
      noiseBurst(.075, .010);
    }, 45);
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
  function returnToTitle() {
    resetJoystick();
    cancelAnimationFrame(rafId);
    stopBgmWithFade(.45);
    Object.keys(keys).forEach(k => keys[k] = false);
    document.querySelectorAll(".dir-btn").forEach(b => b.classList.remove("active"));
    switchScreen("title");
  }

  startBtn.addEventListener("click", startGame);
  retryBtn.addEventListener("click", startGame);
  titleBtn.addEventListener("click", returnToTitle);
  gameTitleBtn.addEventListener("click", returnToTitle);

  // 初期表示
  switchScreen("title");
})();
