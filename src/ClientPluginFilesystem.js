import { ClientPlugin } from '@soundworks/core/client.js';
import { isString, isBrowser, counter } from '@ircam/sc-utils';

// @notes 03/2023:
// - Blob is global in node.js and File is instance of Blob, no need to polyfill
// - Use userland fetch because node globals.fetch is still experimental (and buggy)

/**
 * Client-side representation of the soundworks' filesystem plugin.
 *
 * The constructor should never be called manually. The plugin will be
 * instantiated when registered in the `pluginManager`
 */
export default class ClientPluginFilesystem extends ClientPlugin {
  #commandPromises = new Map();
  #commandIdGenerator = counter();
  #treeState = null;

  /** @hideconstructor */
  constructor(client, id, options) {
    super(client, id);

    this.options = Object.assign({}, options);
  }

  /** @private */
  async start() {
    await super.start();

    this.#treeState = await this.client.stateManager.attach(`sw:plugin:${this.id}`);

    this.client.socket.addListener(`sw:plugin:${this.id}:ack`, reqId => {
      const { resolve } = this.#commandPromises.get(reqId);
      this.#commandPromises.delete(reqId);

      resolve();
    });

    this.client.socket.addListener(`sw:plugin:${this.id}:err`, (reqId, message) => {
      const { reject } = this.#commandPromises.get(reqId);
      this.#commandPromises.delete(reqId);

      message = `Invalid execution on ClientPluginFileSystem: ${message}`;
      reject(new Error(message));
    });
  }

  /** @private */
  async stop() {
    await this.#treeState.detach();
    await super.stop();
  }

  /**
   * Return the current filesystem tree.
   * @return {Object}
   */
  getTree() {
    return this.#treeState.get('tree');
  }

  /**
   * Register a callback to execute when a file is created, modified or deleted
   * on the underlying directory. The callback will receive the updated `tree`
   * and the list of `events` describing the modifications made on the tree.
   *
   * @param {Function} callback - Callback function to execute
   * @param {boolean} [executeListener=false] - If true, execute the given
   *  callback immediately.
   * @return {Function} Function that unregister the listener when executed.
   */
  onUpdate(callback, executeListener = false) {
    return this.#treeState.onUpdate(callback, executeListener);
  }

  /**
   * Return the tree as flat map of `<filename, url>`
   *
   * @param {String} filterExt - File extension to retrieve in the list
   * @param {Boolean} [keepExtension=false] - Keep or remove the file extension
   *  from the keys
   * @return {Object} Map of `<filename, url>`
   */
  getTreeAsUrlMap(filterExt, keepExtension = false) {
    const tree = this.#treeState.getUnsafe('tree');
    let map = {};

    if (!('url' in tree)) {
      throw new Error(`Cannot execute 'getTreeAsUrlMap' on ClientPluginFilesystem: Current filesystem configuration does not expose urls. You must define server "options.publicPath" to expose public urls`);
    }

    // eslint-disable-next-line no-useless-escape
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

  /**
   * Return a node from the tree matching the given path.
   * @param {String} pathOrUrl - Path of the node to be retrieved, relative to
   *  `options.dirname` or URL of the node.
   * @return {Object}
   */
  findInTree(pathOrUrl) {
    const tree = this.#treeState.getUnsafe('tree');

    if (tree === null) {
      return null;
    }

    let leaf = null;

    // remove leading "./"
    // @todo - improve, this is probably a bit weak
    pathOrUrl = pathOrUrl.replace(/^\.\//, '');

    (function parse(node) {
      if (node.relPath === pathOrUrl || node.url === pathOrUrl) {
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
   * Read a file
   *
   * @param {String} pathname - Pathname, relative to `options.dirname`.
   * @return {Promise<Blob>}
   */
  async readFile(pathname) {
    const node = this.findInTree(pathname);

    if (node === null) {
      throw new Error(`Cannot execute 'readFile' on ClientPluginFilesystem: pathname "${pathname}" not found in file tree`);
    }

    if (node.type === 'directory') {
      throw new Error(`Cannot execute 'readFile' on ClientPluginFilesystem: pathname "${pathname}" is a directory`);
    }

    let { url } = node;

    if (!isBrowser()) {
      const { useHttps, serverAddress, port } = this.client.config.env;
      url = `${useHttps ? 'https' : 'http'}://${serverAddress}:${port}${url}`;
    }

    const res = ClientPluginFilesystem.fetch
      ? await ClientPluginFilesystem.fetch(url)
      : await globalThis.fetch(url);

    const blob = await res.blob();

    return blob;
  }

  /**
   * Write a file
   *
   * @param {String} pathname - Pathname, relative to `options.dirname`.
   * @param {String|File|Blob} [data=''] - Content of the file.
   * @return {Promise}
   */
  async writeFile(pathname, data = '') {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      const reqId = this.#commandIdGenerator();
      this.#commandPromises.set(reqId, { resolve, reject });

      if (isString(data)) {
        this.client.socket.send(`sw:plugin:${this.id}:req`, reqId, {
          action: 'writeFile',
          payload: { pathname, data },
        });
      } else if (data instanceof Blob) {
        const form = new ClientPluginFilesystem.FormData();
        form.append('clientId', this.client.id);
        form.append('token', this.client.token);
        form.append('reqId', reqId);
        form.append(pathname, data);

        // for node we need to build the url
        let url = `/sw/plugin/${this.id}/upload`;

        if (!isBrowser()) {
          const { useHttps, serverAddress, port } = this.client.config.env;
          url = `${useHttps ? 'https' : 'http'}://${serverAddress || '127.0.0.1'}:${port}${url}`;
        }

        try {
          const res = ClientPluginFilesystem.fetch
            ? await ClientPluginFilesystem.fetch(url, { method: 'POST', body: form })
            : await globalThis.fetch(url, { method: 'POST', body: form });

          if (res.status === 403) {
            const { reject } = this.#commandPromises.get(reqId);
            this.#commandPromises.delete(reqId);
            // keep this, must match server-side error
            reject(new Error(`Invalid execution on ClientPluginFileSystem: Operation is not permitted`));
          }
        } catch (err) {
          reject(err);
        }
      } else {
        this.#commandPromises.delete(reqId);
        reject(new TypeError(`Cannot execute 'writeFile' on ClientPluginFilesystem: argument 1 must be a String, a File or a Blob instance`));
      }
    });
  }

  /**
   * Create a directory
   *
   * @param {String} pathname - Path of the directory, relative to `options.dirname`.
   * @return {Promise}
   */
  mkdir(pathname) {
    return new Promise((resolve, reject) => {
      const reqId = this.#commandIdGenerator();
      this.#commandPromises.set(reqId, { resolve, reject });

      this.client.socket.send(`sw:plugin:${this.id}:req`, reqId, {
        action: 'mkdir',
        payload: { pathname },
      });
    });
  }

  /**
   * Rename a file or directory
   *
   * @param {String} oldPath - Current pathname, relative to `options.dirname`.
   * @param {String} newPath - New pathname, relative to `options.dirname`.
   * @return {Promise}
   */
  rename(oldPath, newPath) {
    return new Promise((resolve, reject) => {
      const reqId = this.#commandIdGenerator();
      this.#commandPromises.set(reqId, { resolve, reject });

      this.client.socket.send(`sw:plugin:${this.id}:req`, reqId, {
        action: 'rename',
        payload: { oldPath, newPath },
      });
    });
  }

  /**
   * Delete a file or directory
   *
   * @param {String} pathname - Pathname, relative to `options.dirname`.
   * @return {Promise}
   */
  rm(pathname) {
    return new Promise((resolve, reject) => {
      const reqId = this.#commandIdGenerator();
      this.#commandPromises.set(reqId, { resolve, reject });

      this.client.socket.send(`sw:plugin:${this.id}:req`, reqId, {
        action: 'rm',
        payload: { pathname },
      });
    });
  }
}
