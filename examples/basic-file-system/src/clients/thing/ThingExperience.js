import { Experience } from '@soundworks/core/client';

class ThingExperience extends Experience {
  constructor(client, config) {
    super(client, config);

    this.fileSystem = this.require('file-system');
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
    console.log(JSON.stringify(obj, null, 2));
  }
}

export default ThingExperience;
