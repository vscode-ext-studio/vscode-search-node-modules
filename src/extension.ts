import { existsSync, readdirSync, statSync } from 'fs';
import { format, join } from 'path';
import vscode, { ThemeIcon, Uri, languages } from 'vscode';
import { findChildPackages } from './find-child-packages';
import { findParentModules } from './find-parent-modules';
import { sortFiles } from './util/sort-files';
import { showError } from './util/utils';
import { DependencyLinkProvider } from './provider/dependencyLinkProvider';

let lastFolder = '';
let lastWorkspaceName = '';
let lastWorkspaceRoot = '';

const nodeModules = 'node_modules';

export function activate(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        languages.registerDocumentLinkProvider(['javascript', { pattern: '**/package.json' }], new DependencyLinkProvider())
    );
    const fileIcon = Uri.file(join(context.extensionPath, 'icons', 'file.svg'))
    const folderIcon = Uri.file(join(context.extensionPath, 'icons', 'folder.svg'))
    const packageIcon = Uri.file(join(context.extensionPath, 'icons', 'nodejs.svg'))

    const searchNodeModules = vscode.commands.registerCommand('npm.jumper.search', () => {
        const preferences = vscode.workspace.getConfiguration('npm-dependency-jumper');

        const useLastFolder = preferences.get('useLastFolder', false);
        const nodeModulesPath = preferences.get('path', nodeModules);
        const searchParentModules = preferences.get('searchParentModules', true);
        const orderPriority = preferences.get('orderPriority', []);

        const searchPath = async (workspaceName: string, workspaceRoot: string, folderPath: string) => {
            // Path to node_modules in this workspace folder
            const workspaceNodeModules = join(workspaceName, nodeModulesPath);

            // Reset last folder
            lastFolder = '';
            lastWorkspaceName = '';
            lastWorkspaceRoot = '';

            // Path to current folder
            const folderFullPath = join(workspaceRoot, folderPath);

            // Read folder, built quick pick with files/folder (and shortcuts)
            const files = readdirSync(folderFullPath).filter(file => file !== '.package-lock.json');
            const isParentFolder = folderPath.includes('..');
            const options = sortFiles(files, orderPriority);

            // If searching in root node_modules, also include modules from parent folders, that are outside of the workspace
            if (folderPath === nodeModulesPath) {
                if (searchParentModules) {
                    const parentModules = await findParentModules(workspaceRoot, nodeModulesPath);
                    options.push(...parentModules);
                }
            } else {
                // Otherwise, show option to move back to root
                options.push('');
                options.push(workspaceNodeModules);
                // If current folder is not outside of the workspace, also add option to move a step back
                if (!isParentFolder) {
                    options.push('..');
                }
            }
            const items = options.map(name => {
                const isPackageJson = name === 'package.json';
                const filePath = join(folderFullPath, name);
                let iconPath: Uri | ThemeIcon = null;
                if (isPackageJson) iconPath = packageIcon;
                else if (name == '..') iconPath = new ThemeIcon('arrow-left')
                else if (existsSync(filePath)) {
                    iconPath = statSync(join(folderFullPath, name)).isDirectory() ? folderIcon : fileIcon;
                } else {
                    iconPath = new ThemeIcon('home'); // Root node_modules
                }
                return {
                    label: name,
                    kind: name == '' ? vscode.QuickPickItemKind.Separator : undefined,
                    iconPath, picked: isPackageJson,
                } as vscode.QuickPickItem
            });
            vscode.window.showQuickPick(items, {
                placeHolder: format({ dir: workspaceName, base: folderPath })

            }).then(item => {
                if (!item) return;
                const selected = item.label;
                // node_modules shortcut selected
                if (selected === workspaceNodeModules) {
                    searchPath(workspaceName, workspaceRoot, nodeModulesPath);
                } else {
                    const selectedPath = join(folderPath, selected);
                    const selectedFullPath = join(workspaceRoot, selectedPath);
                    // If selected is a folder, traverse it,
                    // otherwise open file.
                    const stats = statSync(selectedFullPath)
                    if (stats.isDirectory()) {
                        searchPath(workspaceName, workspaceRoot, selectedPath);
                    } else {
                        lastWorkspaceName = workspaceName;
                        lastWorkspaceRoot = workspaceRoot;
                        lastFolder = folderPath;

                        vscode.workspace.openTextDocument(selectedFullPath)
                            .then(vscode.window.showTextDocument);
                    }
                }
            });
        };

        const getProjectFolder = async (workspaceFolder: vscode.WorkspaceFolder) => {
            const packages = await findChildPackages(workspaceFolder.uri.fsPath);
            // If in a lerna/yarn monorepo, prompt user to select which project to traverse
            if (packages.length > 0) {
                const selected = await vscode.window.showQuickPick(
                    [
                        { label: workspaceFolder.name, packageDir: '' }, // First option is the root dir
                        ...packages.map(packageDir => ({ label: join(workspaceFolder.name, packageDir), packageDir }))
                    ]
                    , { placeHolder: 'Select Project' }
                );
                if (!selected) return;
                return {
                    name: selected.label,
                    path: join(workspaceFolder.uri.fsPath, selected.packageDir)
                };
            }

            // Otherwise, use the root folder
            return {
                name: workspaceFolder.name,
                path: workspaceFolder.uri.fsPath
            };
        };

        const getWorkspaceFolder = async () => {
            // If in a multifolder workspace, prompt user to select which one to traverse.
            if (vscode.workspace.workspaceFolders?.length > 1) {
                const selected = await vscode.window.showQuickPick(vscode.workspace.workspaceFolders.map(folder => ({
                    label: folder.name,
                    folder
                })), {
                    placeHolder: 'Select workspace folder'
                });

                if (!selected) {
                    return;
                }

                return selected.folder;
            }

            // Otherwise, use the first one
            const folder = vscode.workspace.workspaceFolders[0];
            return folder;
        };

        // Open last folder if there is one
        if (useLastFolder && lastFolder) {
            return searchPath(lastWorkspaceName, lastWorkspaceRoot, lastFolder);
        }

        // Must have at least one workspace folder
        if (!vscode.workspace.workspaceFolders?.length) {
            return showError('You must have a workspace opened.');
        }

        getWorkspaceFolder().then(folder => folder && getProjectFolder(folder)).then(folder => {
            if (folder) {
                searchPath(folder.name, folder.path, nodeModulesPath);
            }
        });
    });

    context.subscriptions.push(searchNodeModules);
};

export function deactivate() { }