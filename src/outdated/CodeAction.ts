import {
  CodeAction,
  CodeActionKind,
  CodeActionProvider,
  l10n,
  languages,
  Range,
  TextDocument,
  WorkspaceEdit,
} from "vscode"
import { COMMAND_INSTALL_REQUEST } from "./Command"
import { DiagnosticType, PackageRelatedDiagnostic } from "./Diagnostic"
import { pluginName } from "./plugin"
import { hasMajorUpdateProtection } from "./Settings"

export const DIAGNOSTIC_ACTION = pluginName

const VERSION_PREFIX_REGEXP = /^\s*(\^|~|=|>=|<=)/

export class PackageJsonCodeActionProvider implements CodeActionProvider {
  async provideCodeActions(
    document: TextDocument,
    range: Range
  ): Promise<CodeAction[]> {
    const diagnosticsAll = languages.getDiagnostics(document.uri)

    // Get all diagnostics from this extension.
    const diagnostics = diagnosticsAll.filter(
      (diagnostic) =>
        typeof diagnostic.code === "object" &&
        diagnostic.code.value === DIAGNOSTIC_ACTION &&
        (!PackageRelatedDiagnostic.is(diagnostic) ||
          diagnostic.type === DiagnosticType.GENERAL)
    ) as PackageRelatedDiagnostic[]

    // Checks if an CodeAction comes through a diagnostic.
    const diagnosticsSelected = diagnostics.filter(
      (diagnostic) => diagnostic.range.intersection(range) !== undefined
    )

    // Checks if there are any packages waiting to be installed.
    let requiresInstallCount = 0

    for (const diagnostic of diagnosticsAll) {
      if (
        PackageRelatedDiagnostic.is(diagnostic) &&
        diagnostic.type === DiagnosticType.READY_TO_INSTALL &&
        diagnostic.range.intersection(range) !== undefined
      ) {
        requiresInstallCount++

        if (requiresInstallCount >= 2) {
          break
        }
      }
    }

    if (!diagnosticsSelected.length) {
      if (requiresInstallCount) {
        return Promise.all([
          this.createInstallAction(document, requiresInstallCount),
        ])
      }

      return Promise.resolve([])
    }

    const diagnosticsPromises: Promise<CodeAction>[] = []

    let diagnosticsSelectedFiltered = diagnosticsSelected

    // If only a single-line is selected or range accepts only one diagnostic then create a direct action for a specific package.
    // Else, it will be suggested to update all <number of> packages within range.
    if (diagnosticsSelected.length === 1) {
      diagnosticsPromises.push(
        this.createUpdateSingleAction(document, diagnosticsSelected[0]!)
      )
    } else {
      let updateWarning = ""

      // Ensures that we will not include major updates together with minor, if protection is enabled.
      if (hasMajorUpdateProtection()) {
        const diagnosticsSelectedMajors: PackageRelatedDiagnostic[] = []

        for (const diagnosticSelected of diagnosticsSelected) {
          if (
            await diagnosticSelected.packageRelated.requiresVersionMajorUpdate()
          ) {
            diagnosticsSelectedMajors.push(diagnosticSelected)
          }
        }

        if (diagnosticsSelectedMajors.length) {
          if (diagnosticsSelectedMajors.length < diagnosticsSelected.length) {
            updateWarning = ` (${l10n.t("excluding major")})`
            diagnosticsSelectedFiltered = diagnosticsSelectedFiltered.filter(
              (diagnostic) => !diagnosticsSelectedMajors.includes(diagnostic)
            )
          } else {
            updateWarning = ` (${l10n.t("major")})`
          }
        }
      }

      if (diagnosticsSelectedFiltered.length === 1) {
        diagnosticsPromises.push(
          this.createUpdateSingleAction(
            document,
            diagnosticsSelectedFiltered[0]!
          )
        )
      } else {
        diagnosticsPromises.push(
          this.createUpdateManyAction(
            document,
            diagnosticsSelectedFiltered,
            `${l10n.t(
              "Update {0} selected packages",
              diagnosticsSelectedFiltered.length
            )}${updateWarning}`
          )
        )
      }
    }

    // If the total number of diagnostics is greater than the number of selected ones, then it is suggested to update all.
    if (
      diagnostics.length > 1 &&
      diagnostics.length > diagnosticsSelectedFiltered.length
    ) {
      let updateWarning = ""
      let diagnosticsFiltered = diagnostics

      // Ensures that we will not include major updates together with minor, if protection is enabled.
      if (hasMajorUpdateProtection()) {
        const diagnosticsMajors: PackageRelatedDiagnostic[] = []

        for (const diagnostic of diagnostics) {
          if (await diagnostic.packageRelated.requiresVersionMajorUpdate()) {
            diagnosticsMajors.push(diagnostic)
          }
        }

        if (diagnosticsMajors.length) {
          if (diagnosticsMajors.length < diagnostics.length) {
            updateWarning = ` (${l10n.t("excluding major")})`
            diagnosticsFiltered = diagnosticsFiltered.filter(
              (diagnostic) => !diagnosticsMajors.includes(diagnostic)
            )
          } else {
            updateWarning = ` (${l10n.t("major")})`
          }
        }
      }

      if (diagnosticsFiltered.length > diagnosticsSelectedFiltered.length) {
        diagnosticsPromises.push(
          this.createUpdateManyAction(
            document,
            diagnosticsFiltered,
            `${l10n.t(
              "Update all {0} packages",
              diagnosticsFiltered.length
            )}${updateWarning}`
          )
        )
      }
    }

    if (requiresInstallCount) {
      diagnosticsPromises.push(
        this.createInstallAction(document, requiresInstallCount)
      )
    }

    return Promise.all(diagnosticsPromises)
  }

  private async createAction(
    document: TextDocument,
    message: string,
    diagnostics: PackageRelatedDiagnostic[],
    isPreferred?: boolean
  ): Promise<CodeAction> {
    const edit = new WorkspaceEdit()
    const action = new CodeAction(message, CodeActionKind.QuickFix)

    action.edit = edit
    action.diagnostics = diagnostics
    action.isPreferred = isPreferred

    let requiresUpdate = false

    for (const diagnostic of diagnostics) {
      if (
        !(await diagnostic.packageRelated.isVersionLatestAlreadyInstalled())
      ) {
        requiresUpdate = true
        break
      }
    }

    if (requiresUpdate) {
      action.command = {
        arguments: [document],
        command: COMMAND_INSTALL_REQUEST,
        title: "update",
      }
    }

    return action
  }

  private async createUpdateManyAction(
    doc: TextDocument,
    diagnostics: PackageRelatedDiagnostic[],
    message: string
  ): Promise<CodeAction> {
    const action = await this.createAction(doc, message, diagnostics)

    await Promise.all(
      diagnostics.map((diagnostic) =>
        this.updatePackageVersion(action, doc, diagnostic)
      )
    )

    return action
  }

  private async createUpdateSingleAction(
    document: TextDocument,
    diagnostic: PackageRelatedDiagnostic
  ): Promise<CodeAction> {
    const versionLatest = await diagnostic.packageRelated.getVersionLatest()
    const updateWarning =
      hasMajorUpdateProtection() &&
        (await diagnostic.packageRelated.requiresVersionMajorUpdate())
        ? ` (${l10n.t("major")})`
        : ""

    const action = this.createAction(
      document,
      `${l10n.t(
        'Update "{0}" to {1}',
        diagnostic.packageRelated.name,
        versionLatest!
      )}${updateWarning}`,
      [diagnostic],
      true
    )

    await this.updatePackageVersion(await action, document, diagnostic)

    return action
  }

  private async createInstallAction(
    document: TextDocument,
    requiresInstallCount: number
  ): Promise<CodeAction> {
    const action = new CodeAction(
      requiresInstallCount === 1
        ? l10n.t("Install package")
        : l10n.t("Install packages"),
      CodeActionKind.QuickFix
    )

    action.command = {
      arguments: [document],
      command: COMMAND_INSTALL_REQUEST,
      title: "update",
    }

    return action
  }

  private async updatePackageVersion(
    action: CodeAction,
    document: TextDocument,
    diagnostic: PackageRelatedDiagnostic
  ): Promise<void> {
    const line = document.lineAt(diagnostic.range.start.line),
      version = line.text.slice(
        diagnostic.range.start.character,
        diagnostic.range.end.character
      ),
      versionPrefix = version.match(VERSION_PREFIX_REGEXP)?.[1] ?? "",
      versionUpdated = await diagnostic.packageRelated.getVersionLatest()

    action.edit?.replace(
      document.uri,
      diagnostic.range,
      versionPrefix + versionUpdated
    )
  }
}
