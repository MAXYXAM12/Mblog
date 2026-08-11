(function () {
  "use strict";

  function init(root) {
    const q = (s) => root.querySelector(s);
    const num = (s) => Number(q(s).value);

    let mode = "manual";

    const panels = root.querySelectorAll("[data-panel]");
    const tabs = root.querySelectorAll("[data-mode]");

    function setMode(next) {
      mode = next;
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.panel !== mode;
      });
      tabs.forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.mode === mode);
      });
      calculate();
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => setMode(tab.dataset.mode));
    });

    function getHeadroom() {
      if (mode === "manual") {
        return num("[data-headroom]");
      }

      if (mode === "roon") {
        const gain = num("[data-roon-gain]");
        const target = num("[data-roon-target]");
        const tp = num("[data-roon-true-peak]");

        // Roon's adjustment is the amount needed to reach the target.
        // Therefore estimated original loudness = target - gain.
        const estimatedLufs = target - gain;
        const estimatedHeadroom = tp - estimatedLufs;

        q("[data-roon-lufs]").textContent = estimatedLufs.toFixed(1) + " LUFS";
        q("[data-roon-headroom]").textContent = estimatedHeadroom.toFixed(1) + " dB";

        return estimatedHeadroom;
      }

      const lufs = num("[data-analysis-lufs]");
      const tp = num("[data-analysis-true-peak]");
      return tp - lufs;
    }

    function calculate() {
      const target = num("[data-target-spl]");
      const R = num("[data-impedance]");
      const S = num("[data-sensitivity]");
      const Rout = num("[data-output-impedance]");
      const Vfs = num("[data-dac-full-scale]");
      const systemAttenuation = num("[data-system-attenuation]");

      const values = [target, R, S, Rout, Vfs, systemAttenuation];
      if (values.some((x) => !Number.isFinite(x)) || R <= 0 || Rout < 0 || Vfs <= 0) {
        q("[data-status]").textContent = "请输入有效参数。";
        return;
      }

      const headroom = getHeadroom();

      if (!Number.isFinite(headroom) || headroom < 0) {
        q("[data-status]").textContent = "动态余量不能为负值。";
        return;
      }

      const peakSpl = target + headroom;

      let loadVoltage;
      if (q("[data-sensitivity-unit]").value === "dbv") {
        loadVoltage = Math.pow(10, (peakSpl - S) / 20);
      } else {
        const powerMw = Math.pow(10, (peakSpl - S) / 10);
        loadVoltage = Math.sqrt((powerMw / 1000) * R);
      }

      const loadCurrent = loadVoltage / R;
      const loadPowerMw = (loadVoltage * loadVoltage / R) * 1000;

      // Vload = Vamp * Rload / (Rout + Rload)
      const ampVoltage = loadVoltage * (Rout + R) / R;

      // The total system attenuation reduces the DAC voltage available to the amp.
      const effectiveDacVoltage = Vfs * Math.pow(10, systemAttenuation / 20);

      const requiredGain = 20 * Math.log10(ampVoltage / effectiveDacVoltage);

      q("[data-result-headroom]").textContent = headroom.toFixed(1);
      q("[data-peak-spl]").textContent = peakSpl.toFixed(1);
      q("[data-load-voltage]").textContent = loadVoltage.toFixed(3);
      q("[data-load-current]").textContent = (loadCurrent * 1000).toFixed(2);
      q("[data-load-power]").textContent = loadPowerMw.toFixed(2);
      q("[data-amp-voltage]").textContent = ampVoltage.toFixed(3);
      q("[data-required-gain]").textContent = requiredGain.toFixed(1);

      if (requiredGain < 0) {
        q("[data-status]").textContent =
          "当前 DAC 满幅输出与系统总音量衰减下，理论上无需额外电压增益即可达到目标峰值；实际还需检查耳放的最大输出能力。";
      } else {
        q("[data-status]").textContent =
          "理论所需增益仅反映电压关系；实际选型还需同时满足峰值电压、电流和功率能力。";
      }
    }

    root.addEventListener("input", calculate);
    root.addEventListener("change", calculate);
    setMode("manual");
  }

  document.querySelectorAll("[data-amp-calculator]").forEach(init);
})();
