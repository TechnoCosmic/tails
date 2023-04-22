import { ExtensionContext } from 'vscode';
import * as clipboard from './clipboard';


export function activate(context: ExtensionContext) {
    clipboard.connect(context);
}


export function deactivate() { }
