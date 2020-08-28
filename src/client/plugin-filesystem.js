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
  }
}

export default pluginFactory;

