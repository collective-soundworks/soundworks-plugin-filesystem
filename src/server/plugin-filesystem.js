import { existsSync, statSync, mkdirSync } from 'node:fs';
import { writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import chokidar from 'chokidar';
import dirTree from 'directory-tree';
import express from 'express';
import fileUpload from 'express-fileupload';
// @todo - remove in favor of @ircam/utils when it exists...
import isPlainObj from 'is-plain-obj';
import normalize from 'normalize-path';

const cwd = process.cwd();
// eslint-disable-next-line no-useless-escape
const EXCLUDE_DOT_FILES = /(^|[\/\\])\../;

// @todo - remove in favor of @ircam/utils when it exists...
function isString(val) {
  return (typeof val === 'string' || val instanceof String);
}

const pluginFactory = function(Plugin) {
  return class PluginFilesystem extends Plugin {
    constructor(server, id, options = {}) {
      super(server, id);

      const defaults = {
        dirname: null,
        publicPath: null,
      };

      this.options = Object.assign({}, defaults, options);
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

    async start() {
      await super.start();

      this._treeState = await this.server.stateManager.create(`sw:plugin:${this.id}`);

      // writeFile route for Blob and File
      // if config.env.protectedRoute disable all sensitive routes for clients
      // open post only that are not connected

      this.server.router.post(`/sw/plugin/${this.id}/upload`, async (req, res) => {
        const clientId = parseInt(req.body.clientId);
        const reqId = parseInt(req.body.reqId);
        const [filename, file] = Object.entries(req.files)[0];
        // find the client who triggered the post
        const client = Array.from(this.clients).find(client => client.id === clientId);

        if (!client) {
          res.status(404).end();
          client.socket.send(`sw:plugin:${this.name}:err`, reqId, '[soundworks:PluginFilesystem] Unknown client');
        }

        // we can send the http response now, as we are acknowledging though sockets
        res.end();

        try {
          await this.writeFile(filename, file.data);
          client.socket.send(`sw:plugin:${this.name}:ack`, reqId);
        } catch (err) {
          client.socket.send(`sw:plugin:${this.name}:err`, reqId, err.message);
        }
      });

      await this.switch(this.options);
    }

    async stop() {
      super.stop();

      if (this._watcher) {
        this._watcher.close();
      }
    }

    addClient(client) {
      super.addClient(client);

      // writeFile, mkdir, rename and delete from clients
      client.socket.addListener(`sw:plugin:${this.name}:req`, async (reqId, data) => {
        const { action, payload } = data;

        switch (action) {
          case 'writeFile': {
            const { filename, data } = payload;

            try {
              await this.writeFile(filename, data);
              client.socket.send(`sw:plugin:${this.name}:ack`, reqId);
            } catch (err) {
              client.socket.send(`sw:plugin:${this.name}:err`, reqId, err.message);
            }
            break;
          }
          case 'mkdir': {
            const { filename } = payload;

            try {
              await this.mkdir(filename);
              client.socket.send(`sw:plugin:${this.name}:ack`, reqId);
            } catch (err) {
              client.socket.send(`sw:plugin:${this.name}:err`, reqId, err.message);
            }
            break;
          }
          case 'rename': {
            const { oldPath, newPath } = payload;

            try {
              await this.rename(oldPath, newPath);
              client.socket.send(`sw:plugin:${this.name}:ack`, reqId);
            } catch (err) {
              client.socket.send(`sw:plugin:${this.name}:err`, reqId, err.message);
            }
            break;
          }
          case 'rm': {
            const { filename } = payload;

            try {
              await this.rm(filename);
              client.socket.send(`sw:plugin:${this.name}:ack`, reqId);
            } catch (err) {
              client.socket.send(`sw:plugin:${this.name}:err`, reqId, err.message);
            }
            break;
          }
          case 'delete':
            if (data.payload.directory === null) {
              this._delete(data.payload.filename);
            } else {
              this._delete(data.payload.directory, data.payload.filename);
            }
            break;
        }
      });
    }

    removeClient(client) {
      client.soscket.removeAllListeners(`sw:plugin:${this.name}:req`);

      const index = this.server.router._router.stack.findIndex(layer => {
        return layer.handle === this._upload;
      });

      console.log(index);
      this.server.router._router.stack.splice(index, 1);

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
      if (!isPlainObj(options)) {
        throw new Error(`[soundworks:PluginFilesystem] Invalid options, options should an object of type { dirname[, publicPath] }`);
      }

      if (!('dirname' in options)) {
        throw new Error(`[soundworks:PluginFilesystem] Invalid option "options.dirname", "options.dirname" is mandatory`);
      }

      if (!isString(options.dirname) && options.dirname !== null) {
        throw new Error(`[soundworks:PluginFilesystem] Invalid option "options.dirname", should be string or null`);
      }

      this.options = Object.assign(this.options, options);
      const { dirname, publicPath } = this.options;

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
        const watcher = chokidar.watch(dirname, {
          ignored: EXCLUDE_DOT_FILES, // ignore dotfiles
          persistent: true,
          ignoreInitial: true,
        });

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

    onUpdate(callback, executeListener = false) {
      return this._treeState.onUpdate(callback, executeListener);
    }

    getTree() {
      return this._treeState.get('tree');
    }

    findInTree(path, tree = null) {
      if (tree === null) {
        tree = this.getTree();
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

    async writeFile(filename, data) {
      const dirname = this.options.dirname;
      filename = path.join(dirname, filename);

      if (!this._checkInDir(filename)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot write file outside directory "${dirname}"`);
      }

      await writeFile(filename, data);
    }

    async mkdir(filename) {
      const dirname = this.options.dirname;
      filename = path.join(dirname, filename);

      if (!this._checkInDir(filename)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot create dir outside directory "${dirname}"`);
      }

      await mkdir(filename, { recursive: true });
    }

    async rename(oldPath, newPath) {
      const dirname = this.options.dirname;
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

    async rm(filename) {
      const dirname = this.options.dirname;
      filename = path.join(dirname, filename);

      if (!this._checkInDir(filename)) {
        throw new Error(`[soundworks:PluginFilesystem] Cannot remove file from outside directory "${dirname}"`);
      }

      await rm(filename);
    }

    _checkInDir(filename) {
      const { dirname } = this.options;
      const rel = path.relative(dirname, filename);

      return !rel.startsWith('..');
    }

    _parseTree() {
      // cf. https://www.npmjs.com/package/directory-tree
      const dirTreeOptions = {
        attributes: ['size', 'type', 'extension'],
        normalizePath: true,
        exclude: EXCLUDE_DOT_FILES,
      };

      const { dirname, publicPath } = this.options;
      const tree = dirTree(dirname, dirTreeOptions);

      // if options.publicPath is set add public urls to the tree
      if (isString(publicPath)) {
        // magically prepend subpath from env config
        const subpath = this.server.config.env.subpath;

        (function addUrl(node) {
          // we need these two steps to properly handle absolute and relative paths
          // i.e. if the dirname is declared as absolute (?)

          // 1. relative from cwd (harmonize abs and rel)
          const pathFromCwd = path.relative(cwd, node.path);
          // 2. relative from the watched path
          const relPath = path.relative(dirname, pathFromCwd);
          // 3. normalize according to platform (relPath could be in windows backslash style)
          const normalizedPath = normalize(relPath);
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

          node.path = pathFromCwd; // better to not expose the server guts client-side
          node.url = url;

          if (node.children) {
            node.children.forEach(addUrl);
          }
        }(tree));
      }

      return tree;
    }

    _queueEvent(event, path) {
      this._eventQueue.push([event, path]);

      clearTimeout(this._batchTimeout);

      this._batchTimeout = setTimeout(() => {
        const oldTree = this.getTree();
        const newTree = this._parseTree();

        const events = this._eventQueue.map(([event, path]) => {
          switch (event) {
            case 'add':
            case 'addDir': {
              const node = this.findInTree(path, newTree);

              if (node === null) {
                console.warn(`[soundworks:PluginFilesytem] node not found for chokidar event: ${event} ${path}, might be a false positive, ignore...`);
                return null;
              }

              return { type: 'create', node };
            }
            case 'change': {
              const node = this.findInTree(path, newTree);

              if (node === null) {
                console.warn(`[soundworks:PluginFilesytem] node not found for chokidar event: ${event} ${path}, might be a false positive, ignore...`);
                return null;
              }

              return { type: 'update', node };
            }
            case 'unlink':
            case 'unlinkDir': {
              const node = this.findInTree(path, oldTree);

              if (node === null) {
                console.warn(`[soundworks:PluginFilesytem] node not found for chokidar event: ${event} ${path}, might be a false positive, ignore...`);
                return null;
              }

              return { type: 'delete', node };
            }
            default: {
              console.warn(`[soundworks:PluginFilesytem] unparsed chokidar event: ${event} ${path}, ignore...`);
              return null;
            }
          }
        }).filter(e => e !== null);

        this._eventQueue.length = 0; // reset queue
        this._treeState.set({ tree: newTree, events });
      }, this._batchEventTimeoutDuration);
    }
  };
};

export default pluginFactory;
