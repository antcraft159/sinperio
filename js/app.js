// =============================================================
// 화면 조작과 저장. 계산은 perio.js 에 맡긴다.
// =============================================================

const STORE_KEY = "sinperio-v1";
const $ = (id) => document.getElementById(id);

// ---------- 상태 ----------
// 월례회 도중 폰이 꺼지거나 새로고침해도 날아가지 않게 바뀔 때마다 저장한다.
const state = load() || {
  pars: [...DEFAULT_PARS],
  hidden: Array(18).fill(false),
  players: [newPlayer(), newPlayer()],
  opts: { ...DEFAULT_OPTS },
  eventName: "",
  hiddenTarget: null, // 숨김 홀 파 합 목표. null 이면 코스 파의 2/3
};

function newPlayer(name = "") {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, scores: Array(18).fill(null) };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    // 예전 형식이거나 망가진 값이면 버리고 새로 시작
    if (s && Array.isArray(s.pars) && s.pars.length === 18 && Array.isArray(s.players)) {
      // 숨김 홀 구성 설정이 없던 첫 판에서는 반올림 기본값이 "소수 첫째 자리" 였다.
      // 그때 저장된 값은 사용자가 고른 게 아니라 기본값이라, 새 기본값(정수)으로 바꿔 준다.
      if (s.opts && !("composition" in s.opts)) delete s.opts.rounding;
      s.opts = { ...DEFAULT_OPTS, ...s.opts };
      return s;
    }
  } catch {}
  return null;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // 사생활 보호 모드 등에서 저장이 막혀도 계산은 그대로 된다
  }
}

// ---------- 탭 ----------
document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== `tab-${name}`));
  if (name === "result") renderResult();
  window.scrollTo(0, 0);
}

// ---------- 1. 코스 파 ----------
function renderPars() {
  $("parGrid").innerHTML = "";
  state.pars.forEach((par, i) => {
    const cell = document.createElement("label");
    cell.className = "par-cell";
    cell.textContent = `${i + 1}`;
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = 3;
    input.max = 6;
    input.value = par;
    input.addEventListener("change", () => {
      const v = parseInt(input.value, 10);
      if (v >= 3 && v <= 6) state.pars[i] = v;
      input.value = state.pars[i];
      save();
      renderParTotal();
      renderHoles();
    });
    cell.append(input);
    $("parGrid").append(cell);
  });
  renderParTotal();
}

function renderParTotal() {
  const front = sum(state.pars.slice(0, 9));
  const back = sum(state.pars.slice(9));
  $("parTotal").textContent = `전반 ${front} · 후반 ${back} · 합계 파 ${front + back}`;
}

// ---------- 1. 숨김 홀 ----------
function renderHoles() {
  $("optTarget").placeholder = `자동 (${hiddenParTarget(state.pars)})`;
  $("holeGrid").innerHTML = "";
  state.pars.forEach((par, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hole" + (state.hidden[i] ? " on" : "");
    b.innerHTML = `${i + 1}<small>파${par}</small>`;
    b.setAttribute("aria-pressed", state.hidden[i]);
    b.addEventListener("click", () => {
      state.hidden[i] = !state.hidden[i];
      save();
      renderHoles();
    });
    $("holeGrid").append(b);
  });

  const c = checkHidden(state.pars, state.hidden, hiddenTarget(), state.opts.composition);
  const el = $("hiddenStatus");
  const mixText = state.opts.composition === "standard"
    ? ` · 파3 ${c.mix[3]}/2 · 파4 ${c.mix[4]}/8 · 파5 ${c.mix[5]}/2`
    : "";
  el.textContent =
    `전반 ${c.front}/6 · 후반 ${c.back}/6 · 파 합계 ${c.parSum}/${c.target}${mixText}` + (c.ok ? " ✓ 준비 완료" : "");
  el.className = "status " + (c.ok ? "ok" : c.front + c.back === 12 ? "bad" : "");
}

$("pickBtn").addEventListener("click", () => {
  const picked = pickHidden(state.pars, hiddenTarget(), Math.random, state.opts.composition);
  if (!picked) {
    return toast(state.opts.composition === "standard"
      ? "이 코스로는 파4 8·파3 2·파5 2 조합이 안 나옵니다. 세부 규칙에서 숨김 홀 구성을 바꿔 주세요"
      : "이 파 합으로는 맞는 조합이 없습니다. 세부 규칙에서 목표를 바꾸거나 직접 골라 주세요");
  }
  state.hidden = picked;
  save();
  renderHoles();
  toast("숨김 홀을 뽑았습니다");
});

$("clearHiddenBtn").addEventListener("click", () => {
  state.hidden = Array(18).fill(false);
  save();
  renderHoles();
});

// ---------- 1. 세부 규칙 ----------
function renderOpts() {
  $("optDoublePar").checked = state.opts.doubleParCap;
  $("optHcMax").value = state.opts.hcMax ?? "";
  $("optRounding").value = state.opts.rounding;
  $("optTie").value = state.opts.tie;
  $("optTarget").value = state.hiddenTarget ?? "";
  $("optComposition").value = state.opts.composition;
}
$("optComposition").addEventListener("change", (e) => {
  state.opts.composition = e.target.value;
  save();
  renderHoles();
});
$("optDoublePar").addEventListener("change", (e) => { state.opts.doubleParCap = e.target.checked; save(); });
$("optHcMax").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  state.opts.hcMax = Number.isFinite(v) && v >= 0 ? v : null;
  e.target.value = state.opts.hcMax ?? "";
  save();
});
$("optRounding").addEventListener("change", (e) => { state.opts.rounding = e.target.value; save(); });
$("optTie").addEventListener("change", (e) => { state.opts.tie = e.target.value; save(); });
$("optTarget").addEventListener("change", (e) => {
  const v = parseInt(e.target.value, 10);
  state.hiddenTarget = v >= 36 && v <= 60 ? v : null;
  e.target.value = state.hiddenTarget ?? "";
  save();
  renderHoles();
});

// 클럽이 따로 정하지 않았으면 코스 파의 2/3 (파 72 → 48)
function hiddenTarget() {
  return state.hiddenTarget ?? hiddenParTarget(state.pars);
}

// ---------- 2. 타수 입력 ----------
function renderPlayers() {
  $("players").innerHTML = "";
  state.players.forEach((p, idx) => $("players").append(playerCard(p, idx)));
}

function playerCard(p, idx) {
  const card = document.createElement("div");
  card.className = "player";

  const head = document.createElement("div");
  head.className = "player-head";
  const name = document.createElement("input");
  name.placeholder = `선수 ${idx + 1} 이름`;
  name.value = p.name;
  name.maxLength = 12;
  name.addEventListener("input", () => { p.name = name.value; save(); });
  const total = document.createElement("span");
  total.className = "player-total";
  const del = document.createElement("button");
  del.type = "button";
  del.className = "icon-btn";
  del.textContent = "삭제";
  del.setAttribute("aria-label", "선수 삭제");
  del.addEventListener("click", () => {
    if (!confirm(`${p.name || `선수 ${idx + 1}`} 을(를) 지울까요?`)) return;
    state.players = state.players.filter((x) => x !== p);
    save();
    renderPlayers();
  });
  head.append(name, total, del);
  card.append(head);

  const updateTotal = () => {
    const filled = p.scores.filter((s) => s > 0);
    total.textContent = filled.length === 18 ? `합계 ${sum(filled)}` : `${filled.length}/18`;
  };

  const inputs = [];
  for (const half of [0, 9]) {
    const grid = document.createElement("div");
    grid.className = "score-grid";
    for (let i = half; i < half + 9; i++) {
      const cell = document.createElement("label");
      cell.className = "score-cell";
      cell.textContent = `${i + 1}`;
      const input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.min = 1;
      input.max = 20;
      input.value = p.scores[i] ?? "";
      input.setAttribute("aria-label", `${i + 1}번 홀 타수`);
      input.addEventListener("input", () => {
        const v = parseInt(input.value, 10);
        p.scores[i] = v > 0 && v <= 20 ? v : null;
        save();
        updateTotal();
        // 한 자리 숫자를 넣으면 다음 칸으로. "1" 은 10타 이상일 수 있어서 기다린다.
        if (input.value.length >= 2 || (input.value.length === 1 && input.value !== "1")) {
          inputs[i + 1]?.focus();
        }
      });
      // 칸에 들어가면 기존 값을 선택해서 바로 덮어쓸 수 있게
      input.addEventListener("focus", () => input.select());
      inputs[i] = input;
      cell.append(input);
      grid.append(cell);
    }
    card.append(grid);
  }
  updateTotal();
  return card;
}

$("addPlayerBtn").addEventListener("click", () => {
  state.players.push(newPlayer());
  save();
  renderPlayers();
  const cards = document.querySelectorAll(".player");
  cards[cards.length - 1].querySelector("input").focus();
});

// ---------- 3. 결과 ----------
function renderResult() {
  $("eventName").value = state.eventName;
  const c = checkHidden(state.pars, state.hidden, hiddenTarget(), state.opts.composition);
  const { ranked, incomplete, medalists } = rankPlayers(state.pars, state.hidden, state.players, state.opts);

  const warns = [];
  if (!c.ok) warns.push(`숨김 홀이 아직 규칙에 맞지 않습니다 (전반 ${c.front}/6 · 후반 ${c.back}/6 · 파 ${c.parSum}/${c.target}).`);
  if (incomplete.length) {
    warns.push(`타수가 덜 들어간 선수 ${incomplete.length}명은 빠졌습니다: ${incomplete.map((p) => p.name || "이름 없음").join(", ")}`);
  }
  $("resultWarn").textContent = warns.join(" ");

  $("resultBody").innerHTML = "";
  for (const p of ranked) {
    const tr = document.createElement("tr");
    if (p.rank === 1) tr.className = "top1";
    for (const [cls, text] of [
      ["", p.rank],
      ["name", p.name || "이름 없음"],
      ["", p.gross],
      ["", fmt(p.hc)],
      ["net", fmt(p.net)],
    ]) {
      const td = document.createElement("td");
      td.className = cls;
      td.textContent = text;
      tr.append(td);
    }
    $("resultBody").append(tr);
  }

  $("medalist").textContent = medalists.length
    ? `메달리스트: ${medalists.map((p) => p.name || "이름 없음").join(", ")} (${medalists[0].gross}타)`
    : "";
}

// 정수면 .0 을 붙이지 않는다
const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

$("eventName").addEventListener("input", (e) => { state.eventName = e.target.value; save(); });

$("copyBtn").addEventListener("click", () => {
  const { ranked, medalists } = rankPlayers(state.pars, state.hidden, state.players, state.opts);
  if (!ranked.length) return toast("아직 결과가 없습니다");
  const holes = state.hidden.map((on, i) => (on ? i + 1 : null)).filter(Boolean).join(", ");
  const lines = [
    `[${state.eventName || "월례회"} 신페리오 결과]`,
    `숨김 홀: ${holes}`,
    "",
    ...ranked.map((p) => `${p.rank}위 ${p.name || "이름 없음"}  네트 ${fmt(p.net)} (총 ${p.gross} / 핸디 ${fmt(p.hc)})`),
  ];
  if (medalists.length) lines.push("", `메달리스트: ${medalists.map((p) => p.name).join(", ")} (${medalists[0].gross}타)`);
  copy(lines.join("\n"));
});

$("newRoundBtn").addEventListener("click", () => {
  if (!confirm("타수와 숨김 홀을 지우고 새 월례회를 시작할까요? 선수 이름과 코스 파는 남습니다.")) return;
  state.players.forEach((p) => (p.scores = Array(18).fill(null)));
  state.hidden = Array(18).fill(false);
  state.eventName = "";
  save();
  renderAll();
  showTab("course");
});

// ---------- 공통 ----------
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 카톡 안 브라우저처럼 clipboard 를 막아 둔 곳을 위한 옛날 방식
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("복사했습니다. 카톡에 붙여넣으세요");
}

let toastTimer;
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2000);
}

function renderAll() {
  renderPars();
  renderHoles();
  renderOpts();
  renderPlayers();
}

renderAll();
// 주소 끝 #result 처럼 탭 이름이 붙어 있으면 그 탭으로 연다
if (["scores", "result"].includes(location.hash.slice(1))) showTab(location.hash.slice(1));
