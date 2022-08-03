const pluginFactory = function(AbstractPlugin) {

  return class PluginFilesystem extends AbstractPlugin {
    constructor(client, name, options) {
      super(client, name);

      const defaults = {
        // default config options
      };

      this.options = this.configure(defaults, options);
    }

    async start() {
      this.state = await this.client.stateManager.attach(`s:${this.name}`);
      this.started();
      this.ready();
    }

    subscribe(callback) {
      const unsubscribe = this.state.subscribe(callback);
      return unsubscribe;
    }

    getValues() {
      return this.state.getValues();
    }

    get(name) {
      return this.state.get(name);
    }

    upload(...args) {
      let files, directory = null;
      if (args.length === 1) {
        files = args[0];
      } else if (args.length === 2) {
        directory = args[0];
        files = args[1];
      } else {
        throw Error("@soundworks/plugin-filesystem's upload method only accepts 1 or 2 arguments");
      }

      const form = new FormData();
      Object.entries(files).forEach(([filename, file]) => {
        form.append(filename, file);
      });

      if (directory !== null) {
        form.append('directory', directory);
      }

      fetch(`/s-${this.name}-upload`, {
        method: 'POST',
        body: form
      });
    }

    delete(...args) {
      let filename, directory = null;
      if (args.length === 1) {
        filename = args[0];
      } else if (args.length === 2) {
        directory = args[0];
        filename = args[1];
      } else {
        throw Error("@soundworks/plugin-filesystem's delete method only accepts 1 or 2 arguments");
      }

      this.client.socket.send(`s:${this.name}:command`, {
        action: 'delete',
        payload: {
          directory: directory,
          filename: filename
        },
      });
    }
  }
}

export default pluginFactory;

