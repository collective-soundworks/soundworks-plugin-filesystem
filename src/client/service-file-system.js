const serviceFactory = function(Service) {

  return class ServiceFileSystem extends Service {
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
  }
}

// not mandatory
serviceFactory.defaultName = 'file-system';

export default serviceFactory;
