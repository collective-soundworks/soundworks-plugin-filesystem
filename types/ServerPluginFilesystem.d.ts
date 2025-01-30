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
export function checkInDir(pathname: any, dirname: any): boolean;
export const kRouter: unique symbol;
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
export default class ServerPluginFilesystem {
    /** @hideconstructor */
    constructor(server: any, id: any, options?: {});
    options: {
        dirname: any;
        publicPath: any;
        depth: any;
    };
    /** @private */
    private start;
    /** @private */
    private stop;
    /** @private */
    private addClient;
    /** @private */
    private removeClient;
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
    switch(options: {
        dirname?: string;
        publicPath?: string;
    }): Promise<any>;
    /**
     * Return the current filesystem tree.
     * @return {Object}
     */
    getTree(): any;
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
    onUpdate(callback: Function, executeListener?: boolean): Function;
    /**
     * Return a node from the tree matching the given path.
     * @param {String} pathname - Pathname, relative to `options.dirname`.
     * @return {Object}
     */
    findInTree(pathname: string): any;
    /**
     * Read a file.
     *
     * @param {String} pathname - Pathname, relative to `options.dirname`.
     * @return {Promise<Blob>}
     */
    readFile(pathname: string): Promise<Blob>;
    /**
     * Write a file
     *
     * @param {String} pathname - Pathname, relative to `options.dirname`.
     * @param {String|Blob} data - Content of the file.
     * @return {Promise}
     */
    writeFile(pathname: string, data: string | Blob): Promise<any>;
    /**
     * Create a directory
     *
     * @param {String} pathname - Path of the directory, relative to `options.dirname`.
     * @return {Promise}
     */
    mkdir(pathname: string): Promise<any>;
    /**
     * Rename a file or directory
     *
     * @param {String} oldPath - Current pathname, relative to `options.dirname`.
     * @param {String} newPath - New pathname, relative to `options.dirname`.
     * @return {Promise}
     */
    rename(oldPath: string, newPath: string): Promise<any>;
    /**
     * Delete a file or directory
     *
     * @param {String} pathname - Pathname, relative to `options.dirname`.
     * @return {Promise}
     */
    rm(pathname: string): Promise<any>;
    #private;
}
