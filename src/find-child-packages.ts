import { existsSync } from 'fs';
import glob from 'glob';
import loadJsonFile from 'load-json-file';
import { join } from 'path';
import { showWarning } from './util/utils';

const PACKAGE_JSON_FILE = 'package.json';
const LERNA_CONFIG_FILE = 'lerna.json';
const DOUBLE_STAR = '**'; // globstar

const distinct = (array: any[]): any[] => [...new Set(array)];

const findPatternMatches = async (root: string, pattern: string): Promise<string[]> => {
    // patterns with double star e.g. '/src/**/' are not supported at the moment, because they are too general and may match nested node_modules
    if (pattern.includes(DOUBLE_STAR)) return [];

    const matches = await glob(join(pattern, PACKAGE_JSON_FILE), {
        cwd: root
    });

    return matches.map(match => join(match, '..'));
};

const getLernaPackagesConfig = async (root: string): Promise<string[]> => {
    const lernaConfigFile = join(root, LERNA_CONFIG_FILE);
    if (!(existsSync(lernaConfigFile))) {
        return [];
    }

    const config: any = await loadJsonFile(lernaConfigFile).catch(() =>
        showWarning(`Ignoring invalid ${LERNA_CONFIG_FILE} file at: ${lernaConfigFile}`)
    );
    return config && Array.isArray(config.packages) ? config.packages : [];
};

const getYarnWorkspacesConfig = async (root: string): Promise<string[]> => {
    const packageJsonFile = join(root, PACKAGE_JSON_FILE);
    if (!existsSync(packageJsonFile)) {
        return [];
    }

    const config: any = await loadJsonFile(packageJsonFile).catch(() =>
        showWarning(`Ignoring invalid ${PACKAGE_JSON_FILE} file at: ${packageJsonFile}`)
    );
    return config && Array.isArray(config.workspaces) ? config.workspaces : [];
};

export const findChildPackages = async (root: string): Promise<string[]> => {
    const patterns = distinct([
        ...(await getLernaPackagesConfig(root)),
        ...(await getYarnWorkspacesConfig(root))
    ]);

    const matchesArr = await Promise.all(
        patterns.map(pattern => findPatternMatches(root, pattern))
    );

    return matchesArr.flat();
};