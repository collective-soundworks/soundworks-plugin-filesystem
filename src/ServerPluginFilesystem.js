import { existsSync, statSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { ServerPlugin } from '@soundworks/core/server.js';
import { isPlainObject, isString } from '@ircam/sc-utils';
import chokidar from 'chokidar';
import dirTree from 'directory-tree';
import express from 'express';
import fileUpload from 'express-fileupload';
import mime from 'mime-types';
import normalize from 'normalize-path';

const cwd = process.cwd();
// eslint-disable-next-line no-useless-escape
const EXCLUDE_DOT_FILES = /(^|[\/\\])\../;

const kEventQueue = Symbol('ws:server-plugin-filesystem:event-queue-method');
// export for testing purposes
export const kRouter = Symbol('ws:server-plugin-filesystem:router');

/**
 * Check pathname is in dirname
 * Note that we consider dirname is not in itself
 *
 * Exported for testing purpose
 *
 * @param {*} pathname
 * @param {*} dirname
 * @returns {boolean}
 * @private
 */
export function checkInDir(pathname, dirname) {
  const rel = path.relative(dirname, pathname);
  return (rel !== '') && !rel.startsWith('..');
}

/**
 * Server-side representation of the soundworks' filesystem plugin.
 *
 * The constructor should never be called manually. The plugin will be
 * instantiated when registered in the `pluginManager`
 *
 * Available options:
 * - `dirname` {String} - directory to watch into
 * - `publicPath` {String} - (optional) optional public path for the assets.
 *  If set, a route will be added to the router to serve the assets and an
 *  `url` entry will be added to each node of the tree.
 * - `depth` {String} - (optional) Maximum depth to watch in the file structure.
 *
 * If no option is given, for example before a user selects a project, the plugin
 * will stay idle until `switch` is called.
 *
 * @example
 * server.pluginManager.register('filesystem', filesystemPlugin, {
 *   dirname: 'my-dir',
 *   publicPath: 'assets'
 * });
 */
export default class ServerPluginFilesystem extends ServerPlugin {
  // shared state containing the file system infos
  #treeState = null;
  // chokidar watchers
  #watcher = null;
  // route that have been opened
  #middleware = null;
  // queue to batch file system events
  #eventQueue = [];
  #batchTimeout = null;
  #batchEventTimeoutDuration = 50; // in ms

  /** @hideconstructor */
  constructor(server, id, options = {}) {
    super(server, id);

    const defaults = {
      dirname: null,
      publicPath: null,
      depth: undefined, // match chokidar default
    };

    this.options = Object.assign(defaults, options);

    this[kRouter] = null;

    // generate schema from `config`
    const schema = {
      tree: {
        type: 'any',
        nullable: true,
        default: null,
        filterChange: false,
      },
      events: {
        type: 'any',
        event: true,
      },
    };

    this.server.stateManager.defineClass(`sw:plugin:${this.id}`, schema);

    this[kEventQueue] = this[kEventQueue].bind(this);
  }

  /** @private */
  async start() {
    await super.start();

    // reuse core router if any, or create a brand new one
    if (this.server.router) {
      this[kRouter] = this.server.router;
    } else {
      this[kRouter] = express();
      this.server.httpServer.on('request', this[kRouter]);
    }

    this[kRouter].use(fileUpload());

    this.#treeState = await this.server.stateManager.create(`sw:plugin:${this.id}`);

    this[kRouter].post(`/sw/plugin/${this.id}/upload`, async (req, res) => {
      const clientId = parseInt(req.body.clientId);
      const clientIp = req.ip;
      const token = req.body.token;

      if (!this.server.isTrustedToken(clientId, clientIp, token)) {
        res.status(403).end(); // HTTP forbidden
        return;
      }

      const reqId = parseInt(req.body.reqId);
      const [filename, file] = Object.entries(req.files)[0];
      // find the client who triggered the post
      const client = Array.from(this.clients).find(client => client.id === clientId);

      if (!client) {
        res.status(404).end();
        client.socket.send(`sw:plugin:${this.id}:err`, reqId, 'Unknown client');
      }

      // we can send the http response now, as we are acknowledging though sockets
      res.end();

      try {
        await this.writeFile(filename, file.data);
        client.socket.send(`sw:plugin:${this.id}:ack`, reqId);
      } catch (err) {
        client.socket.send(`sw:plugin:${this.id}:err`, reqId, err.message);
      }
    });

    await this.switch(this.options);
  }

  /** @private */
  async stop() {
    super.stop();

    if (this.#watcher) {
      this.#watcher.close();
    }
  }

  /** @private */
  addClient(client) {
    super.addClient(client);

    // writeFile, mkdir, rename and delete from clients
    client.socket.addListener(`sw:plugin:${this.id}:req`, async (reqId, data) => {
      if (!this.server.isTrustedClient(client)) {
        client.socket.send(`sw:plugin:${this.id}:err`, reqId, 'Operation is not permitted');
        return;
      }

      const { action, payload } = data;

      switch (action) {
        case 'writeFile': {
          const { pathname, data } = payload;

          try {
            await this.writeFile(pathname, data);
            client.socket.send(`sw:plugin:${this.id}:ack`, reqId);
          } catch (err) {
            client.socket.send(`sw:plugin:${this.id}:err`, reqId, err.message);
          }
          break;
        }
        case 'mkdir': {
          const { pathname } = payload;

          try {
            await this.mkdir(pathname);
            client.socket.send(`sw:plugin:${this.id}:ack`, reqId);
          } catch (err) {
            client.socket.send(`sw:plugin:${this.id}:err`, reqId, err.message);
          }
          break;
        }
        case 'rename': {
          const { oldPath, newPath } = payload;

          try {
            await this.rename(oldPath, newPath);
            client.socket.send(`sw:plugin:${this.id}:ack`, reqId);
          } catch (err) {
            client.socket.send(`sw:plugin:${this.id}:err`, reqId, err.message);
          }
          break;
        }
        case 'rm': {
          const { pathname } = payload;

          try {
            await this.rm(pathname);
            client.socket.send(`sw:plugin:${this.id}:ack`, reqId);
          } catch (err) {
            client.socket.send(`sw:plugin:${this.id}:err`, reqId, err.message);
          }
          break;
        }
      }
    });
  }

  /** @private */
  removeClient(client) {
    client.socket.removeAllListeners(`sw:plugin:${this.id}:req`);

    super.removeClient(client);
  }

  /**
   * Switch the filesystem to a new directory, e.g. to change project while
   * keeping the same plugin and related logic at hand.
   *
   * @param {Object} options
   * @param {String} [options.dirname=null] - directory to watch, plugin is idle
   *  if null
   * @param {String} [options.publicPath=null] - optional public path for the
   *  assets. If set, a route will be added to the router to serve the assets and
   *  an `url` entry will be added to each node of the tree.
   */
  async switch(options) {
    if (!isPlainObject(options)) {
      throw new TypeError(`Cannot execute 'switch' on ServerPluginFilesystem: Invalid options, options should an object of type { dirname[, publicPath] }`);
    }

    if (!('dirname' in options)) {
      throw new TypeError(`Cannot execute 'switch' on ServerPluginFilesystem: Invalid option "options.dirname", "options.dirname" is mandatory`);
    }

    if (!isString(options.dirname) && options.dirname !== null) {
      throw new TypeError(`Cannot execute 'switch' on ServerPluginFilesystem: Invalid option "options.dirname", should be string or null`);
    }

    this.options = Object.assign(this.options, options);
    const { dirname, publicPath, depth } = this.options;

    // all good clean previous watcher and middleware
    // clean watcher and route
    if (this.#watcher) {
      this.#watcher.close();
      this.#watcher = null;
    }

    // remove the middleware from express stack if it has already been registered
    // @note - might be a bit touchy as we manipulate the express stack directly
    if (this.#middleware !== null) {
      const index = this[kRouter]._router.stack.findIndex(layer => {
        return layer.handle === this.#middleware;
      });

      this[kRouter]._router.stack.splice(index, 1);
      this.#middleware = null;
    }

    // discard tree
    this.#treeState.set({ tree: null })

    // nothing left to do, this filesystem is in idle state
    if (dirname === null) {
      return Promise.resolve();
    }

    // create directory if not exists
    if (!existsSync(dirname) || !statSync(dirname).isDirectory()) {
      mkdirSync(dirname, { recursive: true });
    }

    // Open a route for static assets if publicPath is defined.
    //
    // Allow to watch "public" directory and share urls but do not open a route,
    // as this is already done in default template
    //
    // @todo review - This might not be what we want in all cases: what if we
    // don't use default template? Maybe we should just ignore instead of throwing
    // if some static route and middleware already exists for that publicPath.
    if (publicPath !== null && publicPath !== '' && publicPath !== '/') {
      if (!isString(publicPath)) {
        throw new TypeError(`Cannot execute 'switch' on ServerPluginFilesystem: Invalid option "options.publicPath", should be a string`);
      }

      // throw if a route already exists
      this[kRouter]._router.stack.forEach(layer => {
        if (layer.route?.path === publicPath) {
          throw new Error(`Cannot execute 'switch' on ServerPluginFilesystem:: Invalid option "options.publicPath", "${publicPath}" route is already registered in "server.router"`);
        }
      });

      const middleware = express.static(dirname);
      // automatically create route for static assets
      this[kRouter].use(`/${publicPath.replace(/^\//, '')}`, middleware);

      this.#middleware = middleware;
    }

    // create new watcher
    return new Promise((resolve, reject) => {
      const options = {
        ignored: EXCLUDE_DOT_FILES, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        depth: depth,
      };

      const watcher = chokidar.watch(dirname, options);

      watcher.on('all', this[kEventQueue]);

      watcher.on('error', (err) => {
        console.error(`ServerPluginFileSystem chokidar error watching ${dirname}`);
        console.error(err);
        reject(err);
      });

      watcher.on('ready', async () => {
        const tree = this.#parseTree();
        await this.#treeState.set({ tree });

        resolve();
      });

      this.#watcher = watcher;
    });
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
   * Return a node from the tree matching the given path.
   * @param {String} pathname - Pathname, relative to `options.dirname`.
   * @return {Object}
   */
  findInTree(pathname) {
    const dirname = this.options.dirname;

    if (this.options.dirname === null) {
      throw new Error(`Cannot execute 'findInTree' on ServerPluginFilesystem: Cannot write file while filesystem is idle, you should call the 'switch' method first`);
    }

    pathname = path.join(dirname, pathname);

    return this.#getNode(pathname);
  }

  /**
   * Read a file.
   *
   * @param {String} pathname - Pathname, relative to `options.dirname`.
   * @return {Promise<Blob>}
   */
  async readFile(pathname) {
    const dirname = this.options.dirname;

    if (this.options.dirname === null) {
      throw new Error(`Cannot execute 'readFile' on ServerPluginFilesystem: Cannot write file while filesystem is idle, you should call the 'switch' method first`);
    }

    pathname = path.join(dirname, pathname);

    if (!checkInDir(pathname, this.options.dirname)) {
      throw new Error(`Cannot execute 'readFile' on ServerPluginFilesystem: Cannot write file outside directory "${dirname}"`);
    }

    const buffer = await readFile(pathname);
    return new Blob([buffer]);
  }

  /**
   * Write a file
   *
   * @param {String} pathname - Pathname, relative to `options.dirname`.
   * @param {String|Blob} data - Content of the file.
   * @return {Promise}
   */
  async writeFile(pathname, data) {
    const dirname = this.options.dirname;

    if (this.options.dirname === null) {
      throw new Error(`Cannot execute 'writeFile' on ServerPluginFilesystem: Cannot write file while filesystem is idle, you should call the 'switch' method first`);
    }

    pathname = path.join(dirname, pathname);

    if (!checkInDir(pathname, this.options.dirname)) {
      throw new Error(`Cannot execute 'writeFile' on ServerPluginFilesystem: Cannot write file outside directory "${dirname}"`);
    }

    const promise = new Promise((resolve) => {
      const unsubscribe = this.onUpdate(() => {
        if (this.#getNode(pathname) !== null) {
          unsubscribe();
          resolve();
        }
      });
    });

    await writeFile(pathname, data);

    return promise;
  }

  /**
   * Create a directory
   *
   * @param {String} pathname - Path of the directory, relative to `options.dirname`.
   * @return {Promise}
   */
  async mkdir(pathname) {
    const dirname = this.options.dirname;

    if (this.options.dirname === null) {
      throw new Error(`Cannot execute 'mkdir' on ServerPluginFilesystem: Cannot create directory while filesystem is idle, you should call the 'switch' method first`);
    }

    pathname = path.join(dirname, pathname);

    if (!checkInDir(pathname, this.options.dirname)) {
      throw new Error(`Cannot execute 'mkdir' on ServerPluginFilesystem: Cannot create directory outside directory "${dirname}"`);
    }

    const promise = new Promise((resolve) => {
      const unsubscribe = this.onUpdate(() => {
        if (this.#getNode(pathname) !== null) {
          unsubscribe();
          resolve();
        }
      });
    });

    await mkdir(pathname, { recursive: true });

    return promise;
  }

  /**
   * Rename a file or directory
   *
   * @param {String} oldPath - Current pathname, relative to `options.dirname`.
   * @param {String} newPath - New pathname, relative to `options.dirname`.
   * @return {Promise}
   */
  async rename(oldPath, newPath) {
    const dirname = this.options.dirname;

    if (this.options.dirname === null) {
      throw new Error(`Cannot execute 'rename' on ServerPluginFilesystem: Cannot rename while filesystem is idle, you should call the 'switch' method first`);
    }

    oldPath = path.join(dirname, oldPath);

    if (!checkInDir(oldPath, this.options.dirname)) {
      throw new Error(`Cannot execute 'rename' on ServerPluginFilesystem: Cannot rename file that is not within directory "${dirname}"`);
    }

    newPath = path.join(dirname, newPath);

    if (!checkInDir(newPath, this.options.dirname)) {
      throw new Error(`Cannot execute 'rename' on ServerPluginFilesystem: Cannot rename to outside directory "${dirname}"`);
    }

    const promise = new Promise((resolve) => {
      const unsubscribe = this.onUpdate(() => {
        if (this.#getNode(newPath) !== null) {
          unsubscribe();
          resolve();
        }
      });
    });

    await rename(oldPath, newPath);

    return promise;
  }

  /**
   * Delete a file or directory
   *
   * @param {String} pathname - Pathname, relative to `options.dirname`.
   * @return {Promise}
   */
  async rm(pathname) {
    const dirname = this.options.dirname;

    if (this.options.dirname === null) {
      throw new Error(`Cannot execute 'rm' on ServerPluginFilesystem: Cannot remove file while filesystem is idle, you should call the 'switch' method first`);
    }

    pathname = path.join(dirname, pathname);

    if (!checkInDir(pathname, this.options.dirname)) {
      throw new Error(`Cannot execute 'rm' on ServerPluginFilesystem: Cannot remove file that is not within directory "${dirname}"`);
    }

    const promise = new Promise((resolve) => {
      const unsubscribe = this.onUpdate(() => {
        if (this.#getNode(pathname) === null) {
          unsubscribe();
          resolve();
        }
      });
    });

    // @todo
    await rm(pathname, { recursive: true });

    return promise;
  }

  /**
   * Return a node from the tree matching the given path.
   * @param {String} path - absolute path of the node to be retrieved
   * @return {Object}
   * @private
   */
  #getNode(path, tree = null) {
    if (tree === null) {
      tree = this.#treeState.getUnsafe('tree');
    }

    if (tree === null) {
      return null;
    }

    let leaf = null;

    (function parse(node) {
      if (node.path === path) {
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

  /** @private */
  #parseTree() {
    const { dirname, publicPath, depth } = this.options;
    // cf. https://www.npmjs.com/package/directory-tree

    let dirTreeOptions;
    // directory-tree: Usage of size attribute with depth option is prohibited.
    if (depth === undefined) {
      dirTreeOptions = {
        attributes: ['size', 'type', 'extension'],
        normalizePath: true,
        exclude: EXCLUDE_DOT_FILES,
      };
    } else {
      dirTreeOptions = {
        attributes: ['type', 'extension'],
        normalizePath: true,
        exclude: EXCLUDE_DOT_FILES,
        depth: depth + 1, // directory-tree does not behave as chokidar for depth
      };
    }

    const tree = dirTree(dirname, dirTreeOptions);
    // to magically prepend baseUrl from env config
    const baseUrl = this.server.config.env.baseUrl;

    function addInfos(node) {
      // we need these two steps to properly handle absolute and relative paths
      // i.e. if the dirname is declared as absolute (?)
      //
      // 1. relative from cwd (harmonize abs and rel)
      const pathFromCwd = path.relative(cwd, node.path);
      // 2. relative from the watched path
      const relPath = path.relative(dirname, pathFromCwd);
      // 3. normalize according to platform (relPath could be in windows backslash style)
      const normalizedPath = normalize(relPath);

      if (node.type === 'file') {
        node.mimeType = mime.lookup(node.path);
      }

      node.path = pathFromCwd; // better to not expose the server guts client-side
      node.relPath = relPath;

      if (isString(publicPath)) {
        // 4. then we just need to join publicDirectory w/ rel path to obtain the url
        let url = `/${publicPath}/${normalizedPath}`;
        // 5. if baseUrl is defined we want to prepend it to the url too
        if (isString(baseUrl) && baseUrl !== '') {
          url = `/${baseUrl}/${url}`;
        }

        if (node.type === 'directory') {
          url += '/';
        }

        // clean double slashes
        url = url.replace(/\/+/g, '/');

        node.url = url;
      }

      if (node.children) {
        node.children.forEach(addInfos);
      }
    }

    // can happen if the root directory is deleted
    if (tree !== null) {
      addInfos(tree);
    }

    return tree;
  }

  /** @private */
  [kEventQueue](event, pathname) {
    clearTimeout(this.#batchTimeout);
    // if for some reason chokidar propagates an absolute pathname (probably because
    // it was initialized with an absolute path) just make it relative so we are
    // consistent with the format returned by `dirTree` which is always relative
    pathname = path.relative(process.cwd(), pathname);
    // enqueue event
    this.#eventQueue.push([event, pathname]);

    this.#batchTimeout = setTimeout(() => {
      const oldTree = this.#treeState.getUnsafe('tree');
      const newTree = this.#parseTree();

      const events = this.#eventQueue.map(([event, pathname]) => {
        switch (event) {
          case 'add':
          case 'addDir': {
            const node = this.#getNode(pathname, newTree);

            if (node === null) {
              // this can occur for example when a directory with files is created
              // at once and depth options is not supposed to track the inner files
              console.warn(`ServerPluginFilesystem (${this.id}) - node not found for chokidar event: ${event} ${pathname}, might be a false positive, ignore...`);
              return null;
            }

            return { type: 'create', node };
          }
          case 'change': {
            const node = this.#getNode(pathname, newTree);

            if (node === null) {
              // this can occur for example when a directory with files is created
              // at once and depth options is not supposed to track the inner files
              console.warn(`ServerPluginFilesystem (${this.id}) - node not found for chokidar event: ${event} ${pathname}, might be a false positive, ignore...`);
              return null;
            }

            return { type: 'update', node };
          }
          case 'unlink':
          case 'unlinkDir': {
            const node = this.#getNode(pathname, oldTree);

            if (node === null) {
              // this can occur for example when a directory with files is created
              // at once and depth options is not supposed to track the inner files
              console.warn(`ServerPluginFilesystem (${this.id}) - node not found for chokidar event: ${event} ${pathname}, might be a false positive, ignore...`);
              return null;
            }

            return { type: 'delete', node };
          }
          default: {
            console.warn(`ServerPluginFilesystem (${this.id}) - unparsed chokidar event: ${event} ${pathname}, ignore...`);
            return null;
          }
        }
      }).filter(e => e !== null);

      this.#eventQueue.length = 0; // reset queue
      this.#treeState.set({ tree: newTree, events });
    }, this.#batchEventTimeoutDuration);
  }
};
