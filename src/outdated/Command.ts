import { dirname, resolve } from "path"
import { commands, l10n, TextDocument, window } from "vscode"
import { pluginName } from "./plugin"
import { existsSync } from "fs"
import { platform } from "os"

export const COMMAND_INSTALL = `${pluginName}.install`
export const COMMAND_INSTALL_REQUEST = `${pluginName}.installRequest`

export const packageInstallRequest = async (
  document: TextDocument
): Promise<void> => {

  const yarnLockPath = resolve(document.uri.fsPath, '..', 'yarn.lock')
  const packageManager = existsSync(yarnLockPath) ? 'yarn' : 'npm'

  const action = l10n.t("Run")
  const result = await window.showInformationMessage(
    l10n.t(
      "Run install command to finish updating packages."
    ),
    action
  )

  if (result === action) {
    await document.save()

    commands.executeCommand(
      COMMAND_INSTALL,
      `${packageManager} install`,
      dirname(document.uri.fsPath)
    )
  }
}

export const packageInstall = (command: string, cwd: string): void => {
  const terminal = window.createTerminal({
    name: `Update packages`, cwd,
    shellPath: platform() == 'win32' ? 'cmd' : undefined,
  });
  terminal.sendText(`${command}\n`)
  terminal.show()
}
