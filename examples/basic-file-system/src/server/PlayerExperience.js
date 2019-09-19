import { Experience } from '@soundworks/core/server';

class PlayerExperience extends Experience {
  constructor(server, clientTypes, options = {}) {
    super(server, clientTypes);

    this.fileSystem = this.require('file-system');
  }

  start() {
    super.start();

    console.log(this.fileSystem.state.getSchema());

    this.fileSystem.state.subscribe(updates => {
      const test = this.fileSystem.state.get('test-files');
      this.log(test);
    });

    const test = this.fileSystem.state.get('test-files');
    this.log(test);
  }

  enter(client) {
    super.enter(client);
  }

  exit(client) {
    super.exit(client);
  }

  log(obj) {
    // console.log(JSON.stringify(obj, null, 2));
  }
}

export default PlayerExperience;
