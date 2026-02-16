/**
 * LoadingManager — Progress-tracked loading screen with named steps.
 */
export class LoadingManager {
  constructor() {
    this.screen = document.getElementById('loading-screen');
    this.progressBar = document.getElementById('loading-progress');
    this.textEl = this.screen?.querySelector('.loading-text');
    this.steps = [];
    this._completedWeight = 0;
    this._totalWeight = 0;
  }

  registerSteps(steps) {
    this.steps = steps.map((s) => ({ ...s, _completed: false }));
    this._totalWeight = steps.reduce((sum, s) => sum + s.weight, 0);
    this._completedWeight = 0;
  }

  completeStep(stepName) {
    const step = this.steps.find((s) => s.name === stepName);
    if (!step || step._completed) return;

    step._completed = true;
    this._completedWeight += step.weight;
    const progress = (this._completedWeight / this._totalWeight) * 100;

    if (this.progressBar) {
      this.progressBar.style.width = `${progress}%`;
    }

    // Show next incomplete step name
    const next = this.steps.find((s) => !s._completed);
    if (next && this.textEl) {
      this.textEl.textContent = next.name + '...';
    }
  }

  async hide() {
    if (!this.screen) return;

    // Hold at 100% briefly
    if (this.progressBar) this.progressBar.style.width = '100%';
    if (this.textEl) this.textEl.textContent = 'Ready';
    await new Promise((r) => setTimeout(r, 400));

    this.screen.classList.add('fade-out');
    await new Promise((r) => setTimeout(r, 800));
    this.screen.remove();
  }
}
