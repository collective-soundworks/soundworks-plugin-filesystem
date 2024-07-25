import { existsSync, statSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

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

const pluginFactory = function(Plugin) {
  /**
   * Server-side representation of the soundworks' filesystem plugin.
   */
  class PluginFilesystemServer extends Plugin {
    /**
     * The constructor should never be called manually. The plugin will be
     * instantiated by soundworks when registered in the `pluginManager`
     *
     * Available options:
     * - `dirname` {String} - directory to watch into
     * - `publicPath` {String} - (optionnal) optionnal public path for the assets.
     *  If set, a route will be added to the router to serve the assets and an
     *  `url` entry will be added to each node of the tree.
     * - `depth` {String} - (optionnal) Maximum depth to watch in the file structure.
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
    constructor(server, id, options = {}) {
      super(server, id);

      const defaults = {
        dirname: null,
        publicPath: null,
        depth: undefined, // match chokidar default
      };

      this.options = Object.assign(defaults, options);
      // a state containing the file system infos
      this._treeState = null;
      // chokidar watchers
      this._watcher = null;
      // routes that have been opened
      this._middleware = null;
      // queue to batch file system events
      this._eventQueue = [];
      this._batchTimeout = null;
      this._batchEventTimeoutDuration = 100; // in ms

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

      this.server.stateManager.registerSchema(`sw:plugin:${this.id}`, schema);
      this.server.router.use(fileUpload());

      this._queueEvent = this._queueEvent.bind(this);
    }

    /** @private */
    async start() {
      await super.start();

      this._treeState = await this.server.stateManager.create(`sw:plugin:${this.id}`);

      this.server.router.post(`/sw/plugin/${this.id}/upload`, async (req, res) => {
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
          client.socket.send(`sw:plugin:${this.id}:err`, reqId, '[soundworks:PluginFilesystem] Unknown client');
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

      if (this._watcher) {
        this._watcher.close();
      }
    }

    /** @private */
    addClient(client) {
      super.addClient(client);

      // writeFile, mkdir, rename and delete from clients
      client.socket.addListener(`sw:plugin:${this.id}:req`, async (reqId, data) => {
        if (!this.server.isTrustedClient(client)) {
          client.socket.send(`sw:plugin:${this.id}:err`, reqId, '[soundworks:PluginFilesystem] Action is not permitted');
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
     * @param {String} [options.publicPath=null] - optionnal public path for the
     *  assets. If set, a route will be added to the router to serve the assets and
     *  an `url` entry will be added to each node of the tree.
     */
    async switch(options) {
      if (!isPlainObject(options)) {
        throw new Error(`[soundworks:PluginFilesystem] Invalid options, options should an object of type { dirname[, publicPath] }`);
      }

      if (!('dirname' in options)) {
        throw new Error(`[soundworks:PluginFilesystem] Invalid option "options.dirname", "options.dirname" is mandatory`);
      }

      if (!isString(options.dirname) && options.dirname !== null) {
        throw new Error(`[soundworks:PluginFilesystem] Invalid option "options.dirname", should be string or null`);
      }

      this.options = Object.assign(this.options, options);
      const { dirname, publicPath, depth } = this.options;

      // all good clean previous watcher and middleware
      // clean watcher and route
      if (this._watcher) {
        this._watcher.close();
        this._watcher = null;
      }

      // remove the middleware from express stack if it has already been registered
      // @note - might be a bit touchy as we manipulate the express stack directly
      if (this._middleware !== null) {
        const index = this.server.router._router.stack.findIndex(layer => {
          return layer.handle === this._middleware;
        });

        this.server.router._router.stack.splice(index, 1);
        this._middleware = null;
      }

      // discard tree
      this._treeState.set({ tree: null })

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
          throw new Error(`[soundworks:PluginFilesystem] Invalid option "options.publicPath", should be a string`);
        }

        // throw if a route already exists
        this.server.router._router.stack.forEach(layer => {
          if (layer.regexp.test(publicPath)) {
            throw new Error(`[soundworks:PluginFilesystem] Invalid option "options.publicPath", "${publicPath}" route is already registered in "server.router"`);
          }
        });

        const middleware = express.static(dirname);
        // automatically create route for static assets
        this.server.router.use(`/${publicPath.replace(/^\//, '')}`, middleware);

        this._middleware = middleware;
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

        watcher.on('all', this._queueEvent);

        watcher.on('error', (err) => {
          console.error(`[soundworks:PluginFilesystem:${this.id}] chokidar error watching ${dirname}`);
          console.error(err);
          reject(err);
        });

        watcher.on('ready', async () => {
          const tree = this._parseTree();
          await this._treeState.set({ tree });

          resolve();
        });

        this._watcher = watcher;
      });
    }

    /**
     * Return the current filesystem tree.
     * @return {Object}
     */
    getTree() {
      return this._treeState.get('tree');
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
      return this._treeState.onUpdate(callback, executeListener);
    }

    /**
     * Return a node from the tree matching the given path.
     * @param {String} pathname - Pathname, relative to `options.dirname`.
     * @return {Object}
     */
    findInTree(pathname) {
      const tree = this._treeState.getUnsafe('tree');
      let leaf = null;

      (function parse(node) {
        if (node.relPath === pathname) {
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
     * Read a file.
     *
     * @param {String} pathname - Pathname, relative to `options.dirname`.
     * @return {Promise<Blob>}
     */
    async readFile(pathname) {
      const dirname = this.options.dirname;

      if (this.options.dirname === null) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot write file while filesystem is idle (should call "switch({ dirname })" with non null value beforehand)`);
      }

      pathname = path.join(dirname, pathname);

      if (!this._checkInDir(pathname)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot write file outside directory "${dirname}"`);
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
        throw new Error(`[soundworks:PluginFilesystem] Cannot write file while filesystem is idle (should call "switch({ dirname })" with non null value beforehand)`);
      }

      pathname = path.join(dirname, pathname);

      if (!this._checkInDir(pathname)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot write file outside directory "${dirname}"`);
      }

      await writeFile(pathname, data);
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
        throw new Error(`[soundworks:PluginFilesystem] Cannot create dir while filesystem is idle (should call "switch({ dirname })" with non null value beforehand)`);
      }

      pathname = path.join(dirname, pathname);

      if (!this._checkInDir(pathname)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot create dir outside directory "${dirname}"`);
      }

      await mkdir(pathname, { recursive: true });
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
        throw new Error(`[soundworks:PluginFilesystem] Cannot rename while filesystem is idle (should call "switch({ dirname })" with non null value beforehand)`);
      }

      oldPath = path.join(dirname, oldPath);

      if (!this._checkInDir(oldPath)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot rename from outside directory "${dirname}"`);
      }

      newPath = path.join(dirname, newPath);

      if (!this._checkInDir(newPath)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot rename to outside directory "${dirname}"`);
      }

      await rename(oldPath, newPath);
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
        throw new Error(`[soundworks:PluginFilesystem] Cannot remove file while filesystem is idle (should call "switch({ dirname })" with non null value beforehand)`);
      }

      pathname = path.join(dirname, pathname);

      if (!this._checkInDir(pathname)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot remove file from outside directory "${dirname}"`);
      }

      // @todo
      await rm(pathname);
    }

    /** @private */
    _checkInDir(pathname) {
      const { dirname } = this.options;
      const rel = path.relative(dirname, pathname);

      return !rel.startsWith('..');
    }

    /**
     * Return a node from the tree matching the given path.
     * @param {String} path - absolute path of the node to be retrieved
     * @return {Object}
     * @private
     */
    _getNode(path, tree = null) {
      if (tree === null) {
        tree = this._treeState.getUnsafe('tree');
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
    _parseTree() {
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
      // to magically prepend subpath from env config
      const subpath = this.server.config.env.subpath;

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
          // 4. then we just need to join publicDirectory w/ relpath to obtain the url
          let url = `/${publicPath}/${normalizedPath}`;
          // 5. if subpath is defined we want to prepend it to the url too
          if (isString(subpath) && subpath !== '') {
            url = `/${subpath}/${url}`;
          }

          if (node.type === 'directory') {
            url += '/';
          }

          // clean double slahes
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
    _queueEvent(event, pathname) {
      clearTimeout(this._batchTimeout);
      // if for some reason chokidar propagates an absolute pathname (probably because
      // it was initialized with an absolute path) just make it relative so we are
      // consistent with the format returned by `dirTree` which is always relative
      pathname = path.relative(process.cwd(), pathname);
      // enqueue event
      this._eventQueue.push([event, pathname]);

      this._batchTimeout = setTimeout(() => {
        const oldTree = this._treeState.getUnsafe('tree');
        const newTree = this._parseTree();

        const events = this._eventQueue.map(([event, pathname]) => {
          switch (event) {
            case 'add':
            case 'addDir': {
              const node = this._getNode(pathname, newTree);

              if (node === null) {
                // this can occur for example when a directory with files is created
                //  at once and depth options is not supposed to track the inner files
                console.warn(`[soundworks:PluginFilesytem] ${this.id} - node not found for chokidar event: ${event} ${pathname}, might be a false positive, ignore...`);
                return null;
              }

              return { type: 'create', node };
            }
            case 'change': {
              const node = this._getNode(pathname, newTree);

              if (node === null) {
                // this can occur for example when a directory with files is created
                //  at once and depth options is not supposed to track the inner files
                console.warn(`[soundworks:PluginFilesytem] ${this.id} - node not found for chokidar event: ${event} ${pathname}, might be a false positive, ignore...`);
                return null;
              }

              return { type: 'update', node };
            }
            case 'unlink':
            case 'unlinkDir': {
              const node = this._getNode(pathname, oldTree);

              if (node === null) {
                // this can occur for example when a directory with files is created
                //  at once and depth options is not supposed to track the inner files
                console.warn(`[soundworks:PluginFilesytem] ${this.id} - node not found for chokidar event: ${event} ${pathname}, might be a false positive, ignore...`);
                return null;
              }

              return { type: 'delete', node };
            }
            default: {
              console.warn(`[soundworks:PluginFilesytem] ${this.id} - unparsed chokidar event: ${event} ${pathname}, ignore...`);
              return null;
            }
          }
        }).filter(e => e !== null);

        this._eventQueue.length = 0; // reset queue
        this._treeState.set({ tree: newTree, events });
      }, this._batchEventTimeoutDuration);
    }
  };

  return PluginFilesystemServer;
};

export default pluginFactory;
