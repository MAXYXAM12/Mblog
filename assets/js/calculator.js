(function () {
  "use strict";

  const VALID_MODES = new Set(["manual", "roon", "analysis"]);

  function assertFinite(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${label}请输入有效数字。`);
    }
  }

  function assertFiniteResult(values) {
    for (const [label, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) {
        throw new Error(`${label}超出可计算范围，请检查输入数量级。`);
      }
    }
  }

  function fixed(value, digits) {
    const threshold = 0.5 * 10 ** -digits;
    return (Math.abs(value) < threshold ? 0 : value).toFixed(digits);
  }

  function signedDb(value) {
    const normalized = Math.abs(value) < 0.05 ? 0 : value;
    return `${normalized > 0 ? "+" : ""}${normalized.toFixed(1)}`;
  }

  function hiddenTruePeakState(sourceTruePeak, postDigitalTruePeak) {
    return {
      visible: false,
      isResolved: false,
      canApply: false,
      sourceTruePeak,
      postDigitalTruePeak,
      message: ""
    };
  }

  function getTruePeakState(mode, sourceTruePeak, digitalAttenuation) {
    if (mode === "manual") {
      return hiddenTruePeakState(null, null);
    }

    if (!Number.isFinite(sourceTruePeak) || !Number.isFinite(digitalAttenuation)) {
      return hiddenTruePeakState(sourceTruePeak, NaN);
    }

    const postDigitalTruePeak = sourceTruePeak + digitalAttenuation;
    if (!Number.isFinite(postDigitalTruePeak) || sourceTruePeak <= 0) {
      return hiddenTruePeakState(sourceTruePeak, postDigitalTruePeak);
    }

    const isResolved = postDigitalTruePeak <= 0;
    const alreadyApplied = Math.abs(digitalAttenuation + 3) < 1e-9;
    const sourceText = signedDb(sourceTruePeak);
    const postText = signedDb(postDigitalTruePeak);
    let message;

    if (isResolved) {
      message = `源 True Peak 为 ${sourceText} dBTP，存在数字／重建过载风险；当前数字衰减后估算为 ${postText} dBTP，已不超过 0 dBTP。−3 dB 不是通用安全线，仍需检查 DAC 与重建滤波器的实际余量；模拟衰减不能消除上游削波。`;
    } else if (alreadyApplied) {
      message = `源 True Peak 为 ${sourceText} dBTP，存在数字／重建过载风险。已应用 −3 dB 数字衰减，但衰减后估算仍为 ${postText} dBTP；请继续降低数字增益。−3 dB 只是初始建议，模拟衰减不能消除上游削波。`;
    } else {
      message = `源 True Peak 为 ${sourceText} dBTP，存在数字／重建过载风险，建议先将数字衰减设为 −3 dB。当前衰减后估算为 ${postText} dBTP；若应用后仍大于 0 dBTP，需进一步降低数字增益。模拟衰减不能消除上游削波。`;
    }

    return {
      visible: true,
      isResolved,
      canApply: !isResolved && !alreadyApplied,
      sourceTruePeak,
      postDigitalTruePeak,
      message
    };
  }

  function calculate(inputs) {
    const mode = inputs.mode;
    if (!VALID_MODES.has(mode)) {
      throw new Error("未知的计算模式。");
    }

    const targetSpl = inputs.targetSpl;
    const impedance = inputs.impedance;
    const sensitivity = inputs.sensitivity;
    const outputImpedance = inputs.outputImpedance;
    const dacFullScale = inputs.dacFullScale;
    const digitalAttenuation = inputs.digitalAttenuation;
    const analogAttenuation = inputs.analogAttenuation;

    assertFinite(targetSpl, "目标平均 SPL");
    assertFinite(impedance, "耳机阻抗");
    assertFinite(sensitivity, "耳机灵敏度");
    assertFinite(outputImpedance, "耳放输出阻抗");
    assertFinite(dacFullScale, "DAC 满幅输出");
    assertFinite(digitalAttenuation, "数字衰减");
    assertFinite(analogAttenuation, "模拟衰减");

    if (targetSpl < 0) throw new Error("目标平均 SPL 不能为负值。");
    if (impedance <= 0) throw new Error("耳机阻抗必须大于 0 Ω。");
    if (outputImpedance < 0) throw new Error("耳放输出阻抗不能为负值。");
    if (dacFullScale <= 0) throw new Error("DAC 满幅输出必须大于 0 Vrms。");
    if (digitalAttenuation > 0 || analogAttenuation > 0) {
      throw new Error("数字衰减和模拟衰减均不能大于 0 dB；如需增益，请使用计算结果中的耳放增益。");
    }
    if (inputs.sensitivityUnit !== "dbv" && inputs.sensitivityUnit !== "dbmw") {
      throw new Error("未知的灵敏度单位。");
    }

    let integratedLufs = null;
    let headroom;
    let sourceTruePeak = 0;

    if (mode === "manual") {
      headroom = inputs.headroom;
      assertFinite(headroom, "动态余量");
    } else if (mode === "roon") {
      assertFinite(inputs.roonGain, "Roon Track Gain");
      assertFinite(inputs.roonTarget, "Roon 目标响度");
      assertFinite(inputs.sourceTruePeak, "源 True Peak");
      integratedLufs = inputs.roonTarget - inputs.roonGain;
      sourceTruePeak = inputs.sourceTruePeak;
      headroom = sourceTruePeak - integratedLufs;
    } else {
      assertFinite(inputs.analysisLufs, "Integrated LUFS");
      assertFinite(inputs.sourceTruePeak, "源 True Peak");
      integratedLufs = inputs.analysisLufs;
      sourceTruePeak = inputs.sourceTruePeak;
      headroom = sourceTruePeak - integratedLufs;
    }

    if (headroom < 0) {
      throw new Error("动态余量不能为负值，请检查响度与 True Peak 输入。");
    }

    const totalAttenuation = digitalAttenuation + analogAttenuation;
    const postDigitalTruePeak = sourceTruePeak + digitalAttenuation;
    const peakSpl = targetSpl + headroom;

    assertFiniteResult({
      "Integrated LUFS": integratedLufs === null ? 0 : integratedLufs,
      "动态余量": headroom,
      "系统总衰减": totalAttenuation,
      "数字衰减后 True Peak": postDigitalTruePeak,
      "所需峰值 SPL": peakSpl
    });

    let loadVoltage;
    if (inputs.sensitivityUnit === "dbv") {
      loadVoltage = 10 ** ((peakSpl - sensitivity) / 20);
    } else {
      const powerMw = 10 ** ((peakSpl - sensitivity) / 10);
      loadVoltage = Math.sqrt((powerMw / 1000) * impedance);
    }

    const loadCurrent = loadVoltage / impedance;
    const loadPowerMw = (loadVoltage ** 2 / impedance) * 1000;
    const ampVoltage = loadVoltage * (impedance + outputImpedance) / impedance;
    const dacPeakBeforeAnalog = dacFullScale * 10 ** (postDigitalTruePeak / 20);
    const sourceAfterAnalog = dacPeakBeforeAnalog * 10 ** (analogAttenuation / 20);

    assertFiniteResult({
      "耳机所需电压": loadVoltage,
      "耳机所需电流": loadCurrent,
      "耳机所需功率": loadPowerMw,
      "耳放电压": ampVoltage,
      "DAC 峰值电压": dacPeakBeforeAnalog,
      "衰减后源电压": sourceAfterAnalog
    });

    if (sourceAfterAnalog <= 0) {
      throw new Error("系统总衰减过大，源电压已低于可计算范围，请减小衰减。");
    }

    const requiredGain = 20 * Math.log10(ampVoltage / sourceAfterAnalog);
    assertFiniteResult({ "理论所需耳放增益": requiredGain });

    return {
      mode,
      integratedLufs,
      headroom,
      peakSpl,
      loadVoltage,
      loadCurrentMa: loadCurrent * 1000,
      loadPowerMw,
      ampVoltage,
      dacPeakBeforeAnalog,
      sourceAfterAnalog,
      requiredGain,
      totalAttenuation,
      postDigitalTruePeak: mode === "manual" ? null : postDigitalTruePeak,
      truePeakState: getTruePeakState(mode, sourceTruePeak, digitalAttenuation)
    };
  }

  function initCalculator(root) {
    if (root.dataset.ampCalculatorInitialized === "true") return;
    root.dataset.ampCalculatorInitialized = "true";

    const query = (selector) => root.querySelector(selector);
    const panels = Array.from(root.querySelectorAll("[data-panel]"));
    const modeButtons = Array.from(root.querySelectorAll("[data-mode]"));
    const applyButton = query("[data-apply-digital-attenuation]");
    const warning = query("[data-peak-warning]");
    const warningText = query("[data-peak-warning-text]");
    const status = query("[data-status]");
    let mode = "manual";

    const resultSelectors = [
      "[data-result-headroom]",
      "[data-peak-spl]",
      "[data-post-digital-true-peak]",
      "[data-total-attenuation]",
      "[data-load-voltage]",
      "[data-load-current]",
      "[data-load-power]",
      "[data-amp-voltage]",
      "[data-required-gain]"
    ];

    function numberValue(selector) {
      const raw = query(selector).value.trim();
      return raw === "" ? NaN : Number(raw);
    }

    function readInputs() {
      return {
        mode,
        headroom: numberValue("[data-headroom]"),
        roonGain: numberValue("[data-roon-gain]"),
        roonTarget: numberValue("[data-roon-target]"),
        analysisLufs: numberValue("[data-analysis-lufs]"),
        sourceTruePeak: mode === "roon"
          ? numberValue("[data-roon-true-peak]")
          : mode === "analysis"
            ? numberValue("[data-analysis-true-peak]")
            : 0,
        targetSpl: numberValue("[data-target-spl]"),
        impedance: numberValue("[data-impedance]"),
        sensitivity: numberValue("[data-sensitivity]"),
        sensitivityUnit: query("[data-sensitivity-unit]").value,
        outputImpedance: numberValue("[data-output-impedance]"),
        dacFullScale: numberValue("[data-dac-full-scale]"),
        digitalAttenuation: numberValue("[data-digital-attenuation]"),
        analogAttenuation: numberValue("[data-analog-attenuation]")
      };
    }

    function setText(selector, value) {
      query(selector).textContent = value;
    }

    function clearResults() {
      for (const selector of resultSelectors) setText(selector, "—");
      setText("[data-roon-lufs]", "—");
      setText("[data-roon-headroom]", "—");
    }

    function renderTruePeakWarning(state) {
      warning.hidden = !state.visible;
      warning.classList.toggle("is-resolved", state.isResolved);
      warningText.textContent = state.message;
      applyButton.hidden = !state.canApply;
    }

    function render() {
      const inputs = readInputs();
      renderTruePeakWarning(
        getTruePeakState(mode, inputs.sourceTruePeak, inputs.digitalAttenuation)
      );

      try {
        const result = calculate(inputs);
        setText("[data-result-headroom]", fixed(result.headroom, 1));
        setText("[data-peak-spl]", fixed(result.peakSpl, 1));
        setText(
          "[data-post-digital-true-peak]",
          result.postDigitalTruePeak === null ? "—" : signedDb(result.postDigitalTruePeak)
        );
        setText("[data-total-attenuation]", fixed(result.totalAttenuation, 1));
        setText("[data-load-voltage]", fixed(result.loadVoltage, 3));
        setText("[data-load-current]", fixed(result.loadCurrentMa, 2));
        setText("[data-load-power]", fixed(result.loadPowerMw, 2));
        setText("[data-amp-voltage]", fixed(result.ampVoltage, 3));
        setText("[data-required-gain]", fixed(result.requiredGain, 2));

        if (mode === "roon") {
          setText("[data-roon-lufs]", `${fixed(result.integratedLufs, 1)} LUFS`);
          setText("[data-roon-headroom]", `${fixed(result.headroom, 1)} dB`);
        } else {
          setText("[data-roon-lufs]", "—");
          setText("[data-roon-headroom]", "—");
        }

        status.textContent = result.requiredGain < 0
          ? "按当前 DAC 满幅输出、源峰值与系统衰减，理论上无需额外电压增益即可达到目标峰值；实际仍需检查耳放的最大输出能力。"
          : "理论所需增益仅反映电压关系；实际选型还需同时满足峰值电压、电流和功率能力。";
      } catch (error) {
        clearResults();
        status.textContent = error instanceof Error ? error.message : "请输入有效参数。";
      }
    }

    function setMode(nextMode) {
      if (!VALID_MODES.has(nextMode)) return;
      mode = nextMode;
      for (const panel of panels) panel.hidden = panel.dataset.panel !== mode;
      for (const button of modeButtons) {
        const active = button.dataset.mode === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      }
      render();
    }

    for (const button of modeButtons) {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    }

    applyButton.addEventListener("click", () => {
      query("[data-digital-attenuation]").value = "-3";
      render();
    });

    root.addEventListener("input", render);
    root.addEventListener("change", render);
    render();
  }

  function initAll() {
    document.querySelectorAll("[data-amp-calculator]").forEach(initCalculator);
  }

  const api = { calculate, getTruePeakState, initCalculator };

  if (typeof window !== "undefined") {
    window.AmpCalculator = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initAll, { once: true });
    } else {
      initAll();
    }
  }
})();
