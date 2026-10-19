// =============================================================
// 신페리오 계산만 하는 파일. 화면은 모른다.
//
// 신페리오 방식
//   1. 18홀 중 전반 6 + 후반 6 = 12홀을 몰래 고른다 (12홀 파 합이 보통 48)
//   2. 핸디캡 = (숨김 12홀 타수 합 × 1.5 − 코스 파) × 0.8
//   3. 네트 = 18홀 총타수 − 핸디캡, 네트가 낮은 순으로 순위
//
// 클럽마다 다른 세부 규칙(더블파 상한, 핸디 상한, 반올림, 동타)은 opts 로 받는다.
// =============================================================

const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];

const DEFAULT_OPTS = {
  doubleParCap: false,     // 숨김 홀 타수를 더블파까지만 셈
  hcMax: null,             // 핸디캡 상한 (null 이면 없음)
  rounding: "integer",     // "integer": 사사오입해 정수 (가장 흔함) / "decimal": 소수 첫째 자리
  tie: "lowerHc",          // "lowerHc": 핸디 낮은 사람이 위 / "shared": 공동 순위
  composition: "standard", // "standard": 파4 8·파3 2·파5 2 (가장 흔함) / "any": 파 합만 맞으면 됨
};

// 가장 흔한 숨김 홀 구성
const STANDARD_MIX = { 3: 2, 4: 8, 5: 2 };

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// 0.1 단위 계산에서 생기는 13.200000001 같은 오차를 없앤다
const round1 = (x) => Math.round(x * 10) / 10;

function coursePar(pars) {
  return sum(pars);
}

// 숨김 홀로 맞춰야 할 파 합. 파 72 코스면 48.
// 파 71 코스처럼 2/3 이 딱 떨어지지 않으면 가까운 정수로. (클럽이 다르게 정하면 화면에서 바꾼다)
function hiddenParTarget(pars) {
  return Math.round((coursePar(pars) * 2) / 3);
}

// 숨김 홀 선택이 규칙에 맞는지 확인한다
// 고른 홀에 파3·파4·파5 가 몇 개씩인지
function parMix(pars, hidden) {
  const mix = { 3: 0, 4: 0, 5: 0 };
  pars.forEach((p, i) => hidden[i] && p in mix && mix[p]++);
  return mix;
}

const isStandardMix = (mix) => mix[3] === STANDARD_MIX[3] && mix[4] === STANDARD_MIX[4] && mix[5] === STANDARD_MIX[5];

function checkHidden(pars, hidden, target = hiddenParTarget(pars), composition = "any") {
  const front = hidden.slice(0, 9).filter(Boolean).length;
  const back = hidden.slice(9).filter(Boolean).length;
  const parSum = sum(pars.filter((_, i) => hidden[i]));
  const mix = parMix(pars, hidden);
  const mixOk = composition !== "standard" || isStandardMix(mix);
  return {
    front,
    back,
    parSum,
    target,
    mix,
    mixOk,
    ok: front === 6 && back === 6 && parSum === target && mixOk,
  };
}

// 전반 6, 후반 6 을 무작위로 뽑되 파 합이 target 이 되게 한다.
// composition 이 "standard" 면 파4 8·파3 2·파5 2 구성도 맞춘다.
// 경우의 수가 84 × 84 라 그냥 여러 번 뽑아 보면 금방 맞는다.
function pickHidden(pars, target = hiddenParTarget(pars), random = Math.random, composition = "any") {
  const pick6 = (offset) => {
    const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, 6).map((i) => i + offset);
  };
  for (let tries = 0; tries < 5000; tries++) {
    const chosen = [...pick6(0), ...pick6(9)];
    if (sum(chosen.map((i) => pars[i])) !== target) continue;
    const hidden = Array(18).fill(false);
    chosen.forEach((i) => (hidden[i] = true));
    if (composition === "standard" && !isStandardMix(parMix(pars, hidden))) continue;
    return hidden;
  }
  return null; // 이 코스 파 구성으로는 맞출 수 없음
}

// 선수 한 명의 결과. 타수가 하나라도 비어 있으면 null.
function scorePlayer(pars, hidden, scores, opts) {
  if (scores.some((s) => !Number.isFinite(s) || s <= 0)) return null;

  const gross = sum(scores);
  const hiddenScores = scores
    .map((s, i) => (opts.doubleParCap ? Math.min(s, pars[i] * 2) : s))
    .filter((_, i) => hidden[i]);
  const hiddenSum = sum(hiddenScores);

  let hc = (hiddenSum * 1.5 - coursePar(pars)) * 0.8;
  if (opts.hcMax != null) hc = Math.min(hc, opts.hcMax);
  hc = opts.rounding === "integer" ? Math.round(hc) : round1(hc);

  return { gross, hiddenSum, hc, net: round1(gross - hc) };
}

// 모든 선수의 순위표. 타수가 덜 들어간 선수는 incomplete 로 따로 돌려준다.
function rankPlayers(pars, hidden, players, opts) {
  const done = [];
  const incomplete = [];
  for (const p of players) {
    const r = scorePlayer(pars, hidden, p.scores, opts);
    if (r) done.push({ ...p, ...r });
    else incomplete.push(p);
  }

  done.sort((a, b) => a.net - b.net || (opts.tie === "lowerHc" ? a.hc - b.hc : 0));

  // 순위 매기기: 앞 사람과 완전히 같으면 같은 순위
  done.forEach((p, i) => {
    const prev = done[i - 1];
    const same = prev && prev.net === p.net && (opts.tie === "shared" || prev.hc === p.hc);
    p.rank = same ? prev.rank : i + 1;
  });

  // 메달리스트: 핸디 없이 실제 타수가 가장 적은 사람(들)
  const minGross = done.length ? Math.min(...done.map((p) => p.gross)) : null;
  const medalists = done.filter((p) => p.gross === minGross);

  return { ranked: done, incomplete, medalists };
}
