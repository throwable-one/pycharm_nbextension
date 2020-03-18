'use strict';

/**
 * Run in this folder
 * jupyter nbextensions install pycharm_nbextension
 *  jupyter nbextensions enable pycharm_nbextension/pycharm_nbextension
 */


/**
 * @type Notebook notebook
 * @return jquery object to show message
 */
function prepareUi(notebook, menubar, KeyboardManager, CodeCell) {
    menubar.element.children().hide();
    const messageBar = $("<p/>");
    menubar.element.append(messageBar);
    // noinspection JSUnusedGlobalSymbols
    KeyboardManager.prototype.handle_keydown = () => false;
    // noinspection JSUnusedGlobalSymbols
    CodeCell.prototype.is_editable = () => true;
    notebook.header = false;
    notebook.toolbar = false;
    return messageBar;
}

class PyCharmJupyterExtension {

    /**
     * @type Notebook notebook
     */
    constructor(notebook, messageBar) {
        const url = "ws://localhost:8765";
        this.socket = new WebSocket(url);
        this.notebook = notebook;
        this.styleLoaded = false;
        this.connected = false;
        this.log = (message) => {
            messageBar.text(message);
            console.log(message);
        };
        this.socket.onopen = () => {
            this.connected = true;
            this.sendHello();
            this.socket.onmessage = (message) => this.onMessage(message);
            this.socket.onerror = (err) => this.log(`Error ${err}`);
            this.socket.onclose = () => {
                this.log("Disconnected from PyCharm :(((");
                this.connected = false;
            }
        }
    }

    loadStyle(isDark) {
        if (this.styleLoaded) {
            console.log("Already loaded");
            return;
        }
        const cssName = (isDark ? "newFrontEndDark.css" : "newFrontEndLight.css");
        $('<link/>')
            .attr({
                rel: 'stylesheet',
                type: 'text/css',
                href: requirejs.toUrl(`/nbextensions/pycharm_nbextension/pycharm_nbextension/${cssName}`)
            })
            .appendTo('head');
        this.styleLoaded = true;
    }

    sendHello() {
        this.log("Connecting to PyCharm...");
        const notebook = this.notebook;
        const hello = {
            file_name: notebook.notebook_name,
            notebook: notebook.toJSON()
        };
        this.socket.send(JSON.stringify(hello));
    }

    /**
     *
     * @type MessageEvent message
     */
    onMessage(message) {
        this.log("Connected to PyCharm");
        const notebook = this.notebook;
        const messageObj = JSON.parse(message.data);
        const cell = (messageObj.cell !== undefined ? notebook.get_cell(messageObj.cell) : undefined);
        const code = messageObj.code;

        switch (messageObj.command) {
            case 'delete_cell':
                notebook.delete_cell(messageObj.cell);
                break;
            case 'insert_cell':
                notebook.insert_cell_at_index("code", messageObj.cell);
                break;
            case 'set_theme':
                this.loadStyle(messageObj.theme === "dark");
                break;
            case 'save':
                notebook.save_notebook().catch(e => console.exception(e));
                break;
            case 'execute':
                if (cell) {
                    this.subscribeToExecution(cell.events, messageObj.cell);
                    cell.execute();
                } else {
                    notebook.kernel.execute(code, {
                        shell: {
                            reply: (reply) => this.sendToPyCharm(reply.content)
                        }
                    });
                }
                break;
            case 'set_text':
                console.assert(cell);
                cell.set_text(code);
        }
        this.socket.onerror = (err) => {
            console.error(err);
        };
    }

    subscribeToExecution(events, cellId) {
        const eventId = 'finished_execute.CodeCell';

        const onEvent = () => {
            events.off(eventId, onEvent);
            this.sendToPyCharm({'execution_finished': cellId});
        };

        events.on(eventId, onEvent);
    }

    sendToPyCharm(obj) {
        if (this.connected) {
            this.socket.send(JSON.stringify(obj));
        } else {
            console.error("Can't send");
            console.log(obj);
        }
    }
}


define(['base/js/namespace', 'notebook/js/keyboardmanager'],
    (Jupyter, KeyboardManager) => {
        // noinspection JSUnusedGlobalSymbols
        return {
            load_ipython_extension: () => {
                const notebook = Jupyter.notebook;
                Jupyter.notebook.config.loaded.then(() => {
                    const messageBar = prepareUi(notebook, Jupyter.menubar, KeyboardManager.KeyboardManager, Jupyter.CodeCell);
                    new PyCharmJupyterExtension(notebook, messageBar);
                });
            }
        };
    });
