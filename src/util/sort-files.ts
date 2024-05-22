type File = {
    original: string;
    lower: string;
};

export const sortFiles = (origFiles: string[], origPriorities: string[]): string[] => {
    const priorities = [...origPriorities].reverse().map(p => p.toLowerCase());
    const files: File[] = origFiles.map(file => ({ original: file, lower: file.toLowerCase() }));
    const rank = (file: string): number => priorities.indexOf(file) + 1;

    return files
        .sort((a, b) => rank(b.lower) - rank(a.lower))
        .map(file => file.original);
};