function isString(val) {
  return (typeof val === 'string' || val instanceof String);
}

function* idGenerator() {
  for (let i = 0; true; i++) {
    if (i === Number.MAX_SAFE_INTEGER) {
      i = 0;
    }

    yield i;
  }
}

const isBrowser = new Function('try {return this===window;}catch(e){ return false;}');

// Blob is global in node.js and File is instance of Blob, no need to polyfill
// 03/2023 : Use userland fetch because node globals.fetch is still experimental (and buggy)
let fetch;
let FormData;

if (isBrowser()) {
  fetch = globalThis.fetch;
  FormData = globalThis.fetch;
} else {
  const mod = await import('node-fetch');
  fetch = mod.default;
  FormData = mod.FormData;
}

const pluginFactory = function(Plugin) {
  return class PluginFilesystem extends Plugin {
    constructor(client, id, options) {
      super(client, id);

      const defaults = {
        // add option to enable/disable writeFile, mkdir, rename and rm (?)
      };

      this.options = Object.assign({}, defaults, options);

      this._commandPromises = new Map();
      this._commandIdGenerator = idGenerator();
    }

    async start() {
      this._treeState = await this.client.stateManager.attach(`sw:plugin:${this.id}`);

      this.client.socket.addListener(`sw:plugin:${this.name}:ack`, reqId => {
        const { resolve } = this._commandPromises.get(reqId);
        this._commandPromises.delete(reqId);

        resolve();
      });

      this.client.socket.addListener(`sw:plugin:${this.name}:err`, (reqId, message) => {
        const { reject } = this._commandPromises.get(reqId);
        this._commandPromises.delete(reqId);

        reject(new Error(message));
      });
    }

    async stop() {
      await this._treeState.detach();
    }

    getTree() {
      return this._treeState.get('tree');
    }

    onUpdate(callback, executeListener = false) {
      return this._treeState.onUpdate(callback, executeListener);
    }

    /**
     * @return {Object} - key/value pairs of { filename[.ext] : url }
     */
    getTreeAsUrlMap(filterExt, keepExtension = false) {
      let map = {};
      let tree = this.getTree();

      if (!('url' in tree)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot create map, filesystem does not expose urls. Define server "options.publicPath" to expose public urls`);
      }

      let regexp = new RegExp(`\.?${filterExt}$`);

      (function populateMap(node) {
        if (('extension' in node) && regexp.test(node.extension)) {
          let { name, url } = node;

          if (keepExtension === false) {
            const replace = new RegExp(`${node.extension}$`);
            name = name.replace(replace, '');
          }

          map[name] = url;
        }

        if (node.children) {
          node.children.forEach(child => populateMap(child));
        }
      }(tree));

      return map;
    }

    findInTree(pathOrUrl, tree = null) {
      if (tree === null) {
        tree = this.getTree();
      }

      let leaf = null;

      (function parse(node) {
        if (node.path === pathOrUrl || node.url === pathOrUrl) {
          leaf = node;
          return;
        }

        if (node.children) {
          for (let child of node.children) {
            if (leaf !== null) {
              break;
            }

            parse(child);
          }
        }
      }(tree));

      return leaf;
    }

    /**
     * data can be string or Blob
     */
    async writeFile(filename, data) {
      return new Promise(async (resolve, reject) => {
        const reqId = this._commandIdGenerator.next().value;
        this._commandPromises.set(reqId, { resolve, reject })

        if (isString(data)) {
          this.client.socket.send(`sw:plugin:${this.name}:req`, reqId, {
            action: 'writeFile',
            payload: { filename, data },
          });
        } else if (data instanceof Blob) {
          const form = new FormData();
          form.append('clientId', this.client.id);
          form.append('reqId', reqId);
          form.append(filename, data);

          // for node we need to build the url
          let url = `/sw/plugin/${this.id}/upload`;

          if (!isBrowser()) {
            const { useHttps, serverAddress, port } = this.client.config.env;
            url = `${useHttps ? 'https' : 'http'}://${serverAddress}:${port}${url}`;
          }

          try {
            await fetch(url, {
              method: 'POST',
              body: form
            });
          } catch (err) {
            console.log(err.message);
          }
        } else {
          this._commandPromises.delete(reqId);
          reject(`[soundworks:PluginFilesystem] writeFile only accept String, File or Blob instances`);
        }
      });
    }

    mkdir(filename) {
      return new Promise(async (resolve, reject) => {
        const reqId = this._commandIdGenerator.next().value;
        this._commandPromises.set(reqId, { resolve, reject })

        this.client.socket.send(`sw:plugin:${this.name}:req`, reqId, {
          action: 'mkdir',
          payload: { filename },
        });
      });
    }

    rename(oldPath, newPath) {
      return new Promise(async (resolve, reject) => {
        const reqId = this._commandIdGenerator.next().value;
        this._commandPromises.set(reqId, { resolve, reject })

        this.client.socket.send(`sw:plugin:${this.name}:req`, reqId, {
          action: 'rename',
          payload: { oldPath, newPath },
        });
      });
    }

    rm(filename) {
      return new Promise(async (resolve, reject) => {
        const reqId = this._commandIdGenerator.next().value;
        this._commandPromises.set(reqId, { resolve, reject })

        this.client.socket.send(`sw:plugin:${this.name}:req`, reqId, {
          action: 'rm',
          payload: { filename },
        });
      });
    }
  }
}

export default pluginFactory;

