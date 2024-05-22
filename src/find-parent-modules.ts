import * as fs from 'fs';
import { existsSync } from 'fs';
import * as path from 'path';

// Looks for node_modules in parent folders of the workspace recursively.
// Returns a list of paths relative to workspaceRoot/nodeModulesPath
export const findParentModules = async (workspaceRoot: string, nodeModulesPath: string): Promise<string[]> => {
    const rootDirectoryPath = path.parse(process.cwd()).root.toLowerCase();
    const absoluteRootNodeModules = path.join(rootDirectoryPath, nodeModulesPath);

    const find = async (dir: string): Promise<string[]> => {
        const ret: string[] = [];
        if (existsSync(dir)) {
            const getFilePath = (file: string) =>
                path.relative(path.join(workspaceRoot, nodeModulesPath), path.join(dir, file));
            const dirFiles = fs.readdirSync(dir);
            ret.push(...dirFiles.map(getFilePath));
        }

        if (dir !== absoluteRootNodeModules) {
            const parent = path.join(dir, '..', '..', nodeModulesPath);
            if (dir == parent) return ret;
            ret.push(...(await find(parent)));
        }

        return ret;
    };

    return find(path.join(workspaceRoot, '..', nodeModulesPath));
};