(function () {
  "use strict";

  function numberValue(root, field) {
    const element = root.querySelector('[data-field="' + field + '"]');
    const value = element ? parseFloat(element.value) : NaN;
    return Number.isFinite(value) ? value : 0;
  }

  function calculate(root) {
    const lufs = numberValue(root, "lufs");
    const peak = numberValue(root, "peak");
    const track = numberValue(root, "track");
    const digital = numberValue(root, "digital");
    const dac = Math.max(numberValue(root, "dac"), 0);
    const gainDb = numberValue(root, "gain");
    const imp = Math.max(numberValue(root, "imp"), 0.001);
    const sens = numberValue(root, "sens");
    const spl = numberValue(root, "spl");
    const rout = Math.max(numberValue(root, "rout"), 0);
    const sensUnit = root.querySelector('[data-field="sensUnit"]').value;

    const gain = Math.pow(10, gainDb / 20);
    const vDac = dac * Math.pow(10, (digital + track) / 20);
    const vAmp = vDac * gain;

    let vHp;
    let iHp;
    let pHp;

    if (sensUnit === "V") {
      vHp = Math.pow(10, (spl - sens) / 20);
      iHp = vHp / imp;
      pHp = (vHp * vHp) / imp;
    } else {
      pHp = Math.pow(10, (spl - sens) / 10) / 1000;
      vHp = Math.sqrt(pHp * imp);
      iHp = Math.sqrt(pHp / imp);
    }

    // 这里沿用文章中的模型：输出阻抗导致耳放端所需电压增加。
    const vAmpRequired = vHp * (imp + rout) / imp;
    const iAmpRequired = vAmpRequired / (imp + rout);
    const pAmpRequired = vAmpRequired * iAmpRequired;

    const sufficient = vAmp >= vAmpRequired;
    const result = root.querySelector("[data-result]");

    result.innerHTML = `
      <strong>计算结果</strong>
      <div class="amp-calculator__result-group">
        <div>音乐平均响度：${lufs.toFixed(1)} LUFS</div>
        <div>True Peak：${peak.toFixed(1)} dBTP</div>
        <div>Track Gain：${track.toFixed(1)} dB</div>
      </div>

      <div class="amp-calculator__result-group">
        <div>DAC 当前输出：${vDac.toFixed(4)} Vrms</div>
        <div>耳放当前理论输出：${vAmp.toFixed(4)} Vrms</div>
      </div>

      <div class="amp-calculator__result-group">
        <div>耳机端所需电压：${vHp.toFixed(4)} Vrms</div>
        <div>耳机端所需电流：${(iHp * 1000).toFixed(3)} mArms</div>
        <div>耳机端所需功率：${(pHp * 1000).toFixed(3)} mW</div>
      </div>

      <div class="amp-calculator__result-group">
        <div>考虑输出阻抗后耳放所需电压：${vAmpRequired.toFixed(4)} Vrms</div>
        <div>考虑输出阻抗后耳放所需电流：${(iAmpRequired * 1000).toFixed(3)} mArms</div>
        <div>考虑输出阻抗后耳放所需功率：${(pAmpRequired * 1000).toFixed(3)} mW</div>
      </div>

      <strong class="amp-calculator__status ${sufficient ? "is-sufficient" : "is-insufficient"}">
        ${sufficient ? "当前耳放输出能力足以达到目标 SPL" : "当前输入电平/增益不足以达到目标 SPL"}
      </strong>
    `;
  }

  function init(root) {
    root.querySelectorAll("input, select").forEach(function (element) {
      element.addEventListener("input", function () {
        calculate(root);
      });
      element.addEventListener("change", function () {
        calculate(root);
      });
    });

    calculate(root);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-amp-calculator]").forEach(init);
  });
})();
