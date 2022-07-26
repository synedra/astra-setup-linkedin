"use strict";
const condition_checker_1 = require("./lib/condition-checker");
const condition_parser_1 = require("./lib/condition-parser");
const vscode = require("vscode");
const nameSpace = 'auto-run-command';
function activate(context) {
    let disposable = vscode.commands.registerCommand(`${nameSpace}.placeholder-command`, () => {
        vscode.window.showInformationMessage('Auto run command is working. Check out the README to make it do something useful!');
    });
    context.subscriptions.push(disposable);
    const nsConfig = vscode.workspace.getConfiguration(nameSpace);
    const rules = nsConfig.get('rules');
    const runCommandDelayed = (command, message) => {
        const safetyDelay = 5000; //to ensure other extensions got their moves on
        const commands = command.split(" "); // commands may contain specified to separate arguments
        if (commands.length < 1) {
            return;
        }
        const [cmd, ...args] = commands;
        setTimeout(() => {
            vscode.commands.executeCommand(cmd, ...args)
                .then(() => vscode.window.setStatusBarMessage(`[Auto Run Command] Condition met - ${message}`, 3000), (reason) => vscode.window.showErrorMessage(`[Auto Run Command] Condition met but command [${command}] raised an error - [${reason}] `));
        }, safetyDelay);
    };
    rules.forEach(rule => {
        console.log(rule);
        const conditions = typeof rule.condition === 'string' ? [rule.condition] : rule.condition || [];
        const commands = typeof rule.command === 'string' ? [rule.command] : rule.command || [];
        const message = rule.message || conditions.join(' and ');
        try {
            const parsed = conditions.map(condition_parser_1.parseCondition);
            const checkPromises = parsed.map(condition_checker_1.checkCondition);
            return Promise.all(checkPromises)
                .then(values => {
                if (values.every(id => !!id)) {
                    commands.forEach(cmd => runCommandDelayed(cmd, message));
                }
            });
        }
        catch (e) {
            vscode.window.showErrorMessage(`[Auto Run Command] ${e}`);
        }
    });
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() {
    //console.
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map