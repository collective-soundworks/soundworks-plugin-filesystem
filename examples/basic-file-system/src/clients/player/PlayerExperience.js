import { Experience } from '@soundworks/core/client';
import { render, html } from 'lit-html';
import renderAppInitialization from '../views/renderAppInitialization';

class PlayerExperience extends Experience {
  constructor(client, config = {}, $container) {
    super(client);

    this.config = config;
    this.$container = $container;

    this.fileSystem = this.require('file-system');

    renderAppInitialization(client, config, this.$container);
  }

  start() {
    super.start();

    this.fileSystem.state.subscribe(updates => {
      const test = this.fileSystem.state.get('test-files');
      this.renderApp(test);
    });

    const test = this.fileSystem.state.get('test-files');
    this.renderApp(test);
  }

  renderApp(obj) {
    render(html`
      <div class="screen">
        <pre><code>${JSON.stringify(obj, null, 2)}</code></pre>
      </div>
    `, this.$container);
  }
}

export default PlayerExperience;
