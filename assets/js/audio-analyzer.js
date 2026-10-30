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

  /*
   * Chrome 中同时传成功/失败回调会走传统解码路径，对部分修复后的 FLAC
   * 会错误拒绝；纯 Promise 形式则正常。因此先探测支持情况，二选一。
   */
  const TINY_WAV = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x28, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x40, 0x1f, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00,
    0x64, 0x61, 0x74, 0x61, 0x04, 0x00, 0x00, 0x00, 0x80, 0x80, 0x80, 0x80
  ]);
  let promiseDecodeSupported = null;

  async function detectPromiseDecode(AudioContextCtor) {
    if (promiseDecodeSupported !== null) return promiseDecodeSupported;
    const probe = new AudioContextCtor();
    try {
      await probe.decodeAudioData(TINY_WAV.slice(0).buffer);
      promiseDecodeSupported = true;
    } catch (error) {
      promiseDecodeSupported = false;
    }
    probe.close().catch(() => {});
    return promiseDecodeSupported;
  }

  async function decodeBuffer(AudioContextCtor, ctx, bytes) {
    if (await detectPromiseDecode(AudioContextCtor)) {
      return ctx.decodeAudioData(bytes);
    }
    // 旧版 WebKit（Safari < 15）只支持回调形式
    return new Promise((resolve, reject) => {
      ctx.decodeAudioData(bytes, resolve, reject);
    });
  }

  function isSafariEngine() {
    const ua = navigator.userAgent;
    return /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/Edg\//.test(ua);
  }

  /*
   * 解码文件；失败时若是 FLAC，尝试自动修复（ID3 前缀 / 非标准内嵌图片块）后重试。
   * 返回 { buffer, repaired }。
   */
  async function decodeFile(file) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const bytes = await file.arrayBuffer();
    // decodeAudioData 会分离（detach）传入的 ArrayBuffer，保留副本供修复路径使用
    const bytesCopy = bytes.slice(0);
    let ctx = new AudioContextCtor();
    try {
      const buffer = await decodeBuffer(AudioContextCtor, ctx, bytes);
      return { buffer, repaired: false };
    } catch (firstError) {
      // 某些浏览器在同一 AudioContext 解码失败后会拒绝后续解码，重试用新上下文
      ctx.close().catch(() => {});
      let repaired = null;
      try {
        repaired = core.repairFlacContainer(new Uint8Array(bytesCopy));
      } catch (repairError) {
        console.error("FLAC 修复失败", repairError);
      }
      if (!repaired) throw firstError;
      ctx = new AudioContextCtor();
      const buffer = await decodeBuffer(AudioContextCtor, ctx, repaired.slice(0).buffer);
      return { buffer, repaired: true };
    } finally {
      ctx.close().catch(() => {});
    }
  }

  // 读取文件头识别实际封装，用于解码失败时给出可操作的诊断
  async function sniffContainer(file) {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const ascii = (from, len) => String.fromCharCode(...head.slice(from, from + len));
    if (ascii(0, 4) === "fLaC") return "FLAC";
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "WAV";
    if (ascii(0, 4) === "OggS") return "Ogg";
    if (ascii(0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "MP3";
    if (ascii(4, 4) === "ftyp") return "MP4/M4A";
    return "未知";
  }

  async function decodeGuidance(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    let sniffed = "未知";
    try {
      sniffed = await sniffContainer(file);
    } catch (error) {
      console.error("文件头嗅探失败", error);
    }
    const safariNote = isSafariEngine()
      ? "当前是 Safari/WebKit 内核：不支持 FLAC、Ogg/Vorbis、Opus，请改用 WAV、MP3 或 AAC（m4a）。"
      : "Chrome/Edge 支持 WAV、FLAC、MP3、AAC、Ogg；罕见格式（WMA、ALAC、DSD 等）请先转换为 WAV 或 FLAC。";
    const mismatch = sniffed !== "未知" && sniffed.toLowerCase() !== ext && ext !== "m4a"
      ? `注意：扩展名是 .${ext}，但文件头实际为 ${sniffed}——文件可能损坏、被改名，或带有加密封装（如某些平台下载的 .mflac/.ncm）。`
      : "";
    return `无法解码 ${file.name}（检测到文件头：${sniffed}）。${mismatch}${safariNote}`;
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
    const { buffer, repaired } = await decodeFile(file);
    const result = await analyzeBuffer(buffer, onProgress);
    return { result, repaired };
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
        const { result, repaired } = await analyzeFile(file, (fraction, phase) => {
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
        status.textContent = repaired
          ? "分析完成。已自动修复 FLAC 元数据（移除前置标签或损坏的内嵌图片块）后成功解码。"
          : "分析完成。";
        progressFill.style.width = "100%";
        requestAnimationFrame(() => drawChart(chart, result));
      } catch (error) {
        console.error(error);
        const isDecodeFailure = /decode/i.test(String(error && error.message));
        showError(isDecodeFailure ? await decodeGuidance(file) : `分析失败：${error.message || "未知错误"}`);
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
