/*
 * 本地音频响度分析器 UI 逻辑（浏览器端）。
 * 依赖 window.AudioAnalyzerCore（audio-analyzer-core.js）。
 * 分析全程在浏览器本地进行，文件不会被上传。
 */
(function () {
  "use strict";

  const core = window.AudioAnalyzerCore;
  if (!core) {
    console.error("AudioAnalyzerCore 未加载。");
    return;
  }

  const MEASUREMENT_RATE = core.MEASUREMENT_RATE;

  function formatDb(value, digits) {
    if (!Number.isFinite(value)) return "—";
    const normalized = Math.abs(value) < 0.05 ? 0 : value;
    return `${normalized > 0 ? "+" : ""}${normalized.toFixed(digits)}`;
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    const m = Math.floor(seconds / 60);
    const s = (seconds - m * 60).toFixed(1);
    return `${m}:${s.padStart(4, "0")}`;
  }

  async function decodeFile(file) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextCtor();
    try {
      const bytes = await file.arrayBuffer();
      return await ctx.decodeAudioData(bytes);
    } finally {
      ctx.close().catch(() => {});
    }
  }

  /*
   * 用 OfflineAudioContext 的高质量重采样把解码结果转换到 48 kHz。
   * 响度测量在 48 kHz 下进行（BS.1770 规定的测量速率）。
   */
  async function resampleToMeasurementRate(buffer) {
    if (buffer.sampleRate === MEASUREMENT_RATE) {
      return buffer;
    }
    const outputLength = Math.max(1, Math.ceil(buffer.duration * MEASUREMENT_RATE));
    const offline = new OfflineAudioContext(
      buffer.numberOfChannels,
      outputLength,
      MEASUREMENT_RATE
    );
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start(0);
    return offline.startRendering();
  }

  function bufferToChannels(buffer) {
    return Array.from({ length: buffer.numberOfChannels }, (_, ch) => {
      return buffer.getChannelData(ch).slice();
    });
  }

  /*
   * 分析一个已解码的 AudioBuffer（供 UI 与测试共用）。
   */
  async function analyzeBuffer(buffer, onProgress) {
    const loudnessBuffer = await resampleToMeasurementRate(buffer);
    const loudnessChannels = bufferToChannels(loudnessBuffer);
    const peakChannels = bufferToChannels(buffer);
    return core.analyzeChannels({
      loudnessChannels,
      peakChannels,
      peakRate: buffer.sampleRate,
      duration: buffer.duration,
      onProgress
    });
  }

  async function analyzeFile(file, onProgress) {
    const decoded = await decodeFile(file);
    return analyzeBuffer(decoded, onProgress);
  }

  function drawChart(canvas, result) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    const cssHeight = 180;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const times = result.momentaryTimes;
    const values = result.momentaryLufs;
    if (!times || !values || times.length === 0) return;

    const finite = Array.from(values).filter(Number.isFinite);
    if (finite.length === 0) return;

    let yMax = Math.max(0, ...finite) + 3;
    let yMin = Math.min(-70, ...finite) - 3;
    const xMax = Math.max(times[times.length - 1], 0.1);

    const padL = 44;
    const padR = 10;
    const padT = 8;
    const padB = 22;
    const plotW = cssWidth - padL - padR;
    const plotH = cssHeight - padT - padB;

    const x = (t) => padL + (t / xMax) * plotW;
    const y = (v) => padT + ((yMax - v) / (yMax - yMin)) * plotH;

    const styles = getComputedStyle(canvas);
    const axisColor = styles.color || "#888";
    const cssVar = (name, fallback) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const lineColor = cssVar("--primary", "#2563eb") || "#2563eb";

    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.strokeStyle = axisColor;
    ctx.fillStyle = axisColor;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1;

    // 横向参考线
    const step = yMax - yMin > 40 ? 20 : 10;
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
      ctx.beginPath();
      ctx.moveTo(padL, y(v));
      ctx.lineTo(cssWidth - padR, y(v));
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(String(v), padL - 6, y(v) + 3);
    }

    // 积分响度参考线
    if (Number.isFinite(result.integratedLufs)) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y(result.integratedLufs));
      ctx.lineTo(cssWidth - padR, y(result.integratedLufs));
      ctx.stroke();
      ctx.restore();
      ctx.textAlign = "left";
      ctx.fillText(`Integrated ${result.integratedLufs.toFixed(1)}`, padL + 4, y(result.integratedLufs) - 4);
    }

    // 响度曲线
    ctx.globalAlpha = 1;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < times.length; i += 1) {
      const v = values[i];
      if (!Number.isFinite(v)) continue;
      const px = x(times[i]);
      const py = y(Math.max(yMin, Math.min(yMax, v)));
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // 横轴标签
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = axisColor;
    ctx.textAlign = "center";
    const timeStep = xMax > 120 ? 60 : xMax > 30 ? 10 : 5;
    for (let t = 0; t <= xMax; t += timeStep) {
      ctx.fillText(`${t}s`, x(t), cssHeight - 6);
    }
  }

  function initAnalyzer(root) {
    const dropzone = root.querySelector("[data-dropzone]");
    const fileInput = root.querySelector("[data-file-input]");
    const progressWrap = root.querySelector("[data-progress-wrap]");
    const progressFill = root.querySelector("[data-progress-fill]");
    const status = root.querySelector("[data-status]");
    const results = root.querySelector("[data-results]");
    const errorBox = root.querySelector("[data-error]");
    const meta = root.querySelector("[data-meta]");
    const warning = root.querySelector("[data-peak-warning]");
    const chart = root.querySelector("[data-chart]");
    let busy = false;

    const showError = (message) => {
      errorBox.textContent = message;
      errorBox.hidden = false;
    };

    const setResult = (selector, text) => {
      root.querySelector(selector).textContent = text;
    };

    async function handleFile(file) {
      if (!file || busy) return;
      busy = true;
      errorBox.hidden = true;
      results.hidden = true;
      warning.hidden = true;
      progressWrap.hidden = false;
      progressFill.style.width = "0%";
      status.textContent = "正在解码音频…";

      try {
        const result = await analyzeFile(file, (fraction, phase) => {
          const percent = Math.round(fraction * 100);
          progressFill.style.width = `${percent}%`;
          status.textContent = phase === "true-peak"
            ? `正在测量 True Peak… ${percent}%`
            : `正在计算响度… ${percent}%`;
        });

        meta.textContent =
          `${file.name} · ${formatDuration(result.durationSeconds)} · ` +
          `${result.channels} 声道 · ${(result.sampleRate / 1000).toFixed(1)} kHz`;

        setResult("[data-result-integrated]", formatDb(result.integratedLufs, 1));
        setResult("[data-result-true-peak]", formatDb(result.truePeakDbtp, 2));
        setResult("[data-result-plr]", Number.isFinite(result.plrDb) ? result.plrDb.toFixed(1) : "—");
        setResult("[data-result-lra]", result.lraLU.toFixed(1));
        setResult("[data-result-momentary]", formatDb(result.momentaryMaxLufs, 1));
        setResult("[data-result-short-term]", formatDb(result.shortTermMaxLufs, 1));

        if (Number.isFinite(result.truePeakDbtp) && result.truePeakDbtp > 0) {
          warning.textContent =
            `True Peak 为 ${formatDb(result.truePeakDbtp, 2)} dBTP，超过 0 dBFS：` +
            `按当前数据直接回放，DAC 后模拟级将出现削波失真。`;
          warning.hidden = false;
        }

        results.hidden = false;
        status.textContent = "分析完成。";
        progressFill.style.width = "100%";
        requestAnimationFrame(() => drawChart(chart, result));
      } catch (error) {
        console.error(error);
        showError(`分析失败：${error.message || "无法解码该文件，请尝试 WAV / FLAC / MP3 格式。"}`);
        status.textContent = "";
      } finally {
        busy = false;
      }
    }

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
      }
    });
    fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));

    ["dragenter", "dragover"].forEach((name) =>
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.add("is-dragover");
      })
    );
    ["dragleave", "drop"].forEach((name) =>
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.remove("is-dragover");
      })
    );
    dropzone.addEventListener("drop", (event) => {
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      handleFile(file);
    });
  }

  function initAll() {
    document.querySelectorAll("[data-audio-analyzer]").forEach(initAnalyzer);
  }

  window.AudioAnalyzer = { analyzeFile, analyzeBuffer, MEASUREMENT_RATE };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
