import { resolve } from 'path';
import { DocumentLink, DocumentLinkProvider, ProviderResult, Range, TextDocument, Uri } from 'vscode';

export class DependencyLinkProvider implements DocumentLinkProvider {
    provideDocumentLinks(document: TextDocument): ProviderResult<DocumentLink[]> {
        const links: DocumentLink[] = [];
        let shouldCheckForDependency: boolean = false;
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (shouldCheckForDependency) {
                if (line.text.includes('}')) {
                    shouldCheckForDependency = false;
                } else {
                    const matches = line.text.match(/"(.*?)"/);
                    if (matches) {
                        links.push(this.buildLink(document, line, i, matches[1]));
                        links.push(this.buildLink(document, line, i, matches[1], true));
                    }
                }
            } else {
                shouldCheckForDependency = /"(\w*?)dependencies"/i.test(line.text);
            }
        }
        return links;
    }

    private buildLink(document: TextDocument, line: any, lineIndex: number, packageName: string, isWeb?: boolean): DocumentLink {
        const startCharacter: number = line.text.indexOf(packageName);
        const endCharacter: number = startCharacter + packageName.length;
        const linkRange: Range = new Range(lineIndex, startCharacter, lineIndex, endCharacter);
        const linkUri: Uri = isWeb ? Uri.parse(`https://www.npmjs.com/package/${packageName}`) :
            Uri.file(resolve(document.uri.fsPath, '..', 'node_modules', packageName, 'package.json'))
        return new DocumentLink(linkRange, linkUri);
    }

}