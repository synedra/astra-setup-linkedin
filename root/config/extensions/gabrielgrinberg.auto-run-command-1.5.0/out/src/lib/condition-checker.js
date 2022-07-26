"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const condition_parser_1 = require("./condition-parser");
const vscode = require("vscode");
exports.checkCondition = (rule) => __awaiter(this, void 0, void 0, function* () {
    const args = rule.args;
    const editor = vscode.window.activeTextEditor;
    switch (rule.type) {
        case condition_parser_1.ParsedConditionType.always:
            return true;
        case condition_parser_1.ParsedConditionType.isLanguage:
            return editor && editor.document.languageId === args[0];
        case condition_parser_1.ParsedConditionType.hasFile:
            const results = yield vscode.workspace.findFiles(args[0], '', 1);
            return Array.isArray(results) && results.length > 0;
        case condition_parser_1.ParsedConditionType.isRootFolder:
            const rootPath = vscode.workspace.rootPath || '';
            const folderMatches = rootPath.match(/([^\/]*)\/*$/);
            const match = folderMatches && folderMatches[1];
            return match && match === args[0];
    }
});
//# sourceMappingURL=condition-checker.js.map