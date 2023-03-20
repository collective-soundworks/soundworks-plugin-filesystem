import chalk from 'chalk';

/**
 * This simple layout is provided for convenience, feel free to edit or even
 * remove it if you want to use you own logic.
 *
 * The general goal is to provide an API that mimics the one of `lit` allowing
 * to reuse higher level abstractions created to target browsers (e.g. Contexts)
 * with minimal adaptation of the code.
 *
 * @example
 * const $layout = createLayout(client, $container);
 * const myComponent = {
 *   render() {
 *     if (client.target === 'browser') {
 *       return html`<h1>${Math.random()}</h1>`
 *     } else {
 *       return Math.random();
 *     }
 *   },
 * };
 * $layout.addComponent(myComponent);
 * setInterval(() => $layout.requestUpdate(), 1000);
 */
class Layout {
  constructor(client) {
    this.client = client;
    this.components = new Set();

    this.lastComponentOutput = new Map(); // <comp, lastStrValue>
  }

  addComponent(comp) {
    this.components.add(comp);
    this.render();
  }

  deleteComponent(comp) {
    this.components.delete(comp);
    this.render();
  }

  // mimic lit API
  requestUpdate() {
    this.render();
  }

  render() {
    // write a new log only if the result of the component render is different
    // from the last call.
    this.components.forEach(comp => {
      const last = this.lastComponentOutput.get(comp);
      const value = comp.render ? comp.render() : comp;

      if (last !== value) {
        console.log(chalk.green(`[${this.client.role} ${this.client.id}]`), value);
        this.lastComponentOutput.set(comp, value);
      }
    });
  }
}

export default function createLayout(client) {
  const $layout = new Layout(client);
  return $layout;
}
