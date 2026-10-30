/*
 * 本地音频响度分析核心（纯 JS，Node 与浏览器通用）
 *
 * 依据：
 * - ITU-R BS.1770-4/5：K 加权、400 ms 块、75% 重叠、双门限积分响度
 * - EBU Tech 3341/3342：Short-term（3 s）、LRA（绝对门限 −70 LUFS、
 *   相对门限 −20 LU、10%/95% 百分位线性插值）
 * - True Peak：4× 过采样 sinc 插值（等效 BS.1770 过采样测量）
 *
 * 测量采样率固定为 48 kHz（BS.1770 规定的测量速率，使用标准公布的
 * K 加权系数）。调用方负责把音频重采样到 48 kHz 后传入
 * loudnessChannels；True Peak 在原始采样率下过采样测量。
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AudioAnalyzerCore = factory();
  }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const MEASUREMENT_RATE = 48000;

  // ITU-R BS.1770-4 附录（48 kHz）K 加权系数：级联
  // 高搁架（stage 1）+ 高通（stage 2），直接 II 型转置。
  const K_STAGE1 = {
    b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
    a: [1.0, -1.69065929318241, 0.73248077421585]
  };
  const K_STAGE2 = {
    b: [1.0, -2.0, 1.0],
    a: [1.0, -1.99004745483398, 0.99007225036621]
  };

  const ABSOLUTE_GATE_LUFS = -70;
  const RELATIVE_GATE_LU = -10;
  const LRA_ABSOLUTE_GATE_LUFS = -70;
  const LRA_RELATIVE_GATE_LU = -20;
  const LRA_PERCENTILE_LOW = 10;
  const LRA_PERCENTILE_HIGH = 95;

  const MOMENTARY_MS = 400;
  const SHORT_TERM_MS = 3000;
  const HOP_MS = 100;

  // BS.1770 声道权重：L, R, C, LFE, Ls, Rs
  const CHANNEL_WEIGHTS = [1.0, 1.0, 1.0, 0.0, 1.41, 1.41];

  function channelWeight(index, total) {
    if (total <= 2) return 1.0;
    if (index < CHANNEL_WEIGHTS.length) return CHANNEL_WEIGHTS[index];
    return 0.0;
  }

  function assertSampleRate48k(sampleRate) {
    if (sampleRate !== MEASUREMENT_RATE) {
      throw new Error(`响度测量采样率必须为 ${MEASUREMENT_RATE} Hz，当前为 ${sampleRate} Hz。`);
    }
  }

  function assertChannels(channels) {
    if (!Array.isArray(channels) || channels.length === 0) {
      throw new Error("至少需要一路声道数据。");
    }
    const length = channels[0].length;
    for (const channel of channels) {
      if (!(channel instanceof Float32Array)) {
        throw new Error("声道数据必须为 Float32Array。");
      }
      if (channel.length !== length) {
        throw new Error("各声道长度不一致。");
      }
    }
    return length;
  }

  // z（能量）→ LUFS
  function loudnessFromEnergy(energy) {
    return -0.691 + 10 * Math.log10(energy);
  }

  function createBiquadState() {
    return { x1: 0, x2: 0, y1: 0, y2: 0 };
  }

  function biquadStep(coeff, state, x) {
    const y = coeff.b[0] * x + coeff.b[1] * state.x1 + coeff.b[2] * state.x2
      - coeff.a[1] * state.y1 - coeff.a[2] * state.y2;
    state.x2 = state.x1;
    state.x1 = x;
    state.y2 = state.y1;
    state.y1 = y;
    return y;
  }

  // K 加权滤波一个声道（原地输出到新数组）
  function kWeightChannel(samples) {
    const out = new Float32Array(samples.length);
    const s1 = createBiquadState();
    const s2 = createBiquadState();
    for (let i = 0; i < samples.length; i += 1) {
      out[i] = biquadStep(K_STAGE2, s2, biquadStep(K_STAGE1, s1, samples[i]));
    }
    return out;
  }

  /*
   * 计算滑动窗口能量序列：每帧为窗口内“各声道加权和的均值”。
   * 返回 { times, energies }（Float64Array），窗口不足时取部分窗口。
   */
  function computeEnergies(filteredChannels, sampleRate, windowMs, hopMs) {
    assertSampleRate48k(sampleRate);
    const length = assertChannels(filteredChannels);
    const windowSize = Math.round((windowMs / 1000) * sampleRate);
    const hopSize = Math.round((hopMs / 1000) * sampleRate);
    if (hopSize <= 0) throw new Error("帧移必须大于 0。");

    const weighted = filteredChannels.map((channel, index) => {
      const weight = channelWeight(index, filteredChannels.length);
      return weight === 1.0 ? channel : null; // 权重非 1 的声道另行加权
    });

    const blockCount = Math.max(1, Math.ceil((length - windowSize) / hopSize) + 1);
    const times = new Float64Array(blockCount);
    const energies = new Float64Array(blockCount);

    // 逐声道前缀和，滑动窗口 O(N)
    for (let ch = 0; ch < filteredChannels.length; ch += 1) {
      const channel = filteredChannels[ch];
      const weight = channelWeight(ch, filteredChannels.length);
      if (weight === 0.0) continue;
      const prefix = new Float64Array(length + 1);
      let acc = 0;
      for (let i = 0; i < length; i += 1) {
        acc += channel[i] * channel[i];
        prefix[i + 1] = acc;
      }
      const w2 = weight * weight;
      for (let b = 0; b < blockCount; b += 1) {
        const start = b * hopSize;
        const end = Math.min(length, start + windowSize);
        if (start >= length) break;
        energies[b] += w2 * (prefix[end] - prefix[start]) / (end - start);
      }
    }
    for (let b = 0; b < blockCount; b += 1) {
      times[b] = (b * hopSize) / sampleRate;
    }
    return { times, energies };
  }

  /*
   * 双门限积分响度（BS.1770-4 第 4 节）。
   * 返回 −Infinity 表示没有任何帧通过绝对门限。
   */
  function integratedLoudness(energies) {
    const loudness = new Float64Array(energies.length);
    let count = 0;
    for (let i = 0; i < energies.length; i += 1) {
      loudness[i] = loudnessFromEnergy(energies[i]);
      if (loudness[i] >= ABSOLUTE_GATE_LUFS) count += 1;
    }
    if (count === 0) return -Infinity;

    let sum = 0;
    for (let i = 0; i < energies.length; i += 1) {
      if (loudness[i] >= ABSOLUTE_GATE_LUFS) sum += energies[i];
    }
    const preliminary = loudnessFromEnergy(sum / count);
    const relativeGate = preliminary + RELATIVE_GATE_LU;

    sum = 0;
    count = 0;
    for (let i = 0; i < energies.length; i += 1) {
      if (loudness[i] >= relativeGate) {
        sum += energies[i];
        count += 1;
      }
    }
    if (count === 0) return -Infinity;
    return loudnessFromEnergy(sum / count);
  }

  function maxLoudness(energies) {
    if (energies.length === 0) return -Infinity;
    let max = -Infinity;
    for (let i = 0; i < energies.length; i += 1) {
      const l = loudnessFromEnergy(energies[i]);
      if (l > max) max = l;
    }
    return max;
  }

  // 线性插值百分位
  function percentile(sorted, p) {
    if (sorted.length === 0) return -Infinity;
    if (sorted.length === 1) return sorted[0];
    const rank = (p / 100) * (sorted.length - 1);
    const low = Math.floor(rank);
    const frac = rank - low;
    if (low + 1 >= sorted.length) return sorted[sorted.length - 1];
    return sorted[low] + frac * (sorted[low + 1] - sorted[low]);
  }

  /*
   * 响度范围 LRA（EBU Tech 3342）。
   * shortTermEnergies：3 s 帧能量序列。返回 LU。
   */
  function loudnessRange(shortTermEnergies) {
    const values = [];
    for (let i = 0; i < shortTermEnergies.length; i += 1) {
      const l = loudnessFromEnergy(shortTermEnergies[i]);
      if (l >= LRA_ABSOLUTE_GATE_LUFS) values.push(l);
    }
    if (values.length < 2) return 0;

    const meanLoudness = values.reduce((a, b) => a + b, 0) / values.length;
    const relativeGate = meanLoudness + LRA_RELATIVE_GATE_LU;
    const gated = values.filter((l) => l >= relativeGate).sort((a, b) => a - b);
    if (gated.length < 2) return 0;

    return percentile(gated, LRA_PERCENTILE_HIGH) - percentile(gated, LRA_PERCENTILE_LOW);
  }

  /*
   * True Peak（dBTP）：4× 过采样 sinc 插值后取绝对峰值。
   * 半样本线性相位 FIR（128 抽头，Blackman 窗，截至输出奈奎斯特）。
   * 支持分块处理并通过 onProgress / yieldEvery 保持界面响应。
   */
  const TP_OVERSAMPLE = 4;
  const TP_TAPS_PER_BRANCH = 32;

  function truePeakKernel() {
    const total = TP_TAPS_PER_BRANCH * TP_OVERSAMPLE; // 128
    const center = (total - 1) / 2;
    const h = new Float64Array(total);
    for (let j = 0; j < total; j += 1) {
      const n = j - center;
      const sinc = n === 0 ? 1 : Math.sin(Math.PI * n / TP_OVERSAMPLE) / (Math.PI * n / TP_OVERSAMPLE);
      const window = 0.42
        - 0.5 * Math.cos((2 * Math.PI * j) / (total - 1))
        + 0.08 * Math.cos((4 * Math.PI * j) / (total - 1));
      // 4× 插值核：各多相分支和 ≈ 1，整体直流增益 = 4
      h[j] = sinc * window;
    }
    return h;
  }

  let cachedKernel = null;

  async function truePeakDbAsync(channels, sampleRate, onProgress, yieldEvery) {
    assertChannels(channels);
    const kernel = cachedKernel || (cachedKernel = truePeakKernel());
    const branchTaps = TP_TAPS_PER_BRANCH;
    let peak = 0;

    for (let ch = 0; ch < channels.length; ch += 1) {
      const x = channels[ch];
      const length = x.length;
      for (let n = 0; n < length; n += 1) {
        for (let p = 0; p < TP_OVERSAMPLE; p += 1) {
          let acc = 0;
          for (let k = 0; k < branchTaps; k += 1) {
            const xi = n - k;
            if (xi < 0) break;
            acc += kernel[p + k * TP_OVERSAMPLE] * x[xi];
          }
          const v = acc < 0 ? -acc : acc;
          if (v > peak) peak = v;
        }
        if (yieldEvery && n % yieldEvery === yieldEvery - 1) {
          if (onProgress) onProgress(channels.length === 0 ? 1 : (ch + (n + 1) / length) / channels.length);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }
    if (onProgress) onProgress(1);
    if (peak === 0) return -Infinity;
    return 20 * Math.log10(peak);
  }

  /*
   * 完整分析（async）。
   * loudnessChannels：48 kHz、已含所需声道的 Float32Array 列表
   * peakChannels / peakRate：原始采样率声道，用于 True Peak
   * onProgress(0..1, phase) 与 yieldEvery 用于界面进度与让出主线程。
   */
  async function analyzeChannels({
    loudnessChannels,
    peakChannels = loudnessChannels,
    peakRate = MEASUREMENT_RATE,
    duration = null,
    onProgress = null,
    yieldEvery = 1 << 20
  } = {}) {
    assertSampleRate48k(MEASUREMENT_RATE);
    const length = assertChannels(loudnessChannels);
    const actualDuration = duration == null ? length / MEASUREMENT_RATE : duration;
    if (onProgress) onProgress(0, "k-weighting");

    // 1) K 加权（分块让出主线程）
    const filtered = [];
    for (let ch = 0; ch < loudnessChannels.length; ch += 1) {
      filtered.push(kWeightChannel(loudnessChannels[ch]));
      if (onProgress) onProgress(0.05 + 0.15 * ((ch + 1) / loudnessChannels.length), "k-weighting");
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // 2) 能量序列
    const momentary = computeEnergies(filtered, MEASUREMENT_RATE, MOMENTARY_MS, HOP_MS);
    const shortTerm = computeEnergies(filtered, MEASUREMENT_RATE, SHORT_TERM_MS, HOP_MS);
    if (onProgress) onProgress(0.3, "gating");

    const integrated = integratedLoudness(momentary.energies);
    const momentaryMax = maxLoudness(momentary.energies);
    const shortTermMax = maxLoudness(shortTerm.energies);
    const lra = loudnessRange(shortTerm.energies);
    if (onProgress) onProgress(0.35, "true-peak");

    // 3) True Peak
    const truePeak = await truePeakDbAsync(peakChannels, peakRate, (f) => {
      if (onProgress) onProgress(0.35 + 0.65 * f, "true-peak");
    }, yieldEvery);

    const plr = Number.isFinite(truePeak) && Number.isFinite(integrated)
      ? truePeak - integrated
      : NaN;

    return {
      integratedLufs: integrated,
      momentaryMaxLufs: momentaryMax,
      shortTermMaxLufs: shortTermMax,
      lraLU: lra,
      truePeakDbtp: truePeak,
      plrDb: plr,
      durationSeconds: actualDuration,
      channels: loudnessChannels.length,
      sampleRate: peakRate,
      momentaryTimes: momentary.times,
      momentaryLufs: (() => {
        const out = new Float64Array(momentary.energies.length);
        for (let i = 0; i < out.length; i += 1) out[i] = loudnessFromEnergy(momentary.energies[i]);
        return out;
      })()
    };
  }

  return {
    MEASUREMENT_RATE,
    loudnessFromEnergy,
    kWeightChannel,
    computeEnergies,
    integratedLoudness,
    maxLoudness,
    percentile,
    loudnessRange,
    truePeakDbAsync,
    analyzeChannels,
    MOMENTARY_MS,
    SHORT_TERM_MS,
    HOP_MS
  };
});
