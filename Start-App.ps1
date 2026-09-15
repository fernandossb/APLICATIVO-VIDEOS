param(
    [int]$Port = 8787,
    [string]$HostName = "+"
)

$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PublicRoot = Join-Path $ScriptRoot "public"
$FichaCachePath = Join-Path $ScriptRoot "fichas-cache.json"
$FichaAssetRoot = Join-Path $ScriptRoot "ficha-assets"

$FichaRoot = Join-Path "G:\" ("Ficha T" + [char]0x00E9 + "cnica")
$MetodosRoot = Join-Path "G:\" ("M" + [char]0x00E9 + "todos e Processos")
$VideoRoot = Join-Path $MetodosRoot ("M" + [char]0x00E9 + "todo em v" + [char]0x00ED + "deo\V" + [char]0x00CD + "DEOS BDF")

$ExcelExtensions = @(".xlsx", ".xlsm", ".xls")
$VideoExtensions = @(".mp4", ".mov", ".m4v", ".avi", ".wmv", ".webm", ".mkv")
$Utf8 = [System.Text.UTF8Encoding]::new($false)
$RoteiroSheetPrefix = "ROTEIRO DE PRODU" + [char]0x00C7 + [char]0x00C3 + "O"
$FichaMemoryCacheSeconds = 30
$FichaCacheVersion = 3

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (-not ("CosturaFlowNativeWindow" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CosturaFlowNativeWindow
{
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
}

$script:VideoIndex = $null
$script:VideoIndexAt = $null
$script:FichaCache = $null
$script:FichaCacheAt = $null
$script:ListenerPrefix = $null
$script:NetworkAccessEnabled = $false
$script:NetworkAccessWarning = ""

function Release-ComObject {
    param([object]$Object)
    if ($null -ne $Object -and [System.Runtime.InteropServices.Marshal]::IsComObject($Object)) {
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($Object)
    }
}

function Get-ExcelAutomationProcessId {
    param(
        [int[]]$ExistingProcessIds,
        $ExcelApplication
    )

    $mappedProcessId = [uint32]0
    try {
        [void][CosturaFlowNativeWindow]::GetWindowThreadProcessId(
            [IntPtr]$ExcelApplication.Hwnd,
            [ref]$mappedProcessId
        )
    }
    catch { }

    Start-Sleep -Milliseconds 150
    $newProcess = @(Get-Process EXCEL -ErrorAction SilentlyContinue | Where-Object {
        $ExistingProcessIds -notcontains $_.Id
    } | Sort-Object StartTime -Descending)[0]

    if ($newProcess) {
        $newProcessId = [int]$newProcess.Id
        $newProcess.Dispose()
        return $newProcessId
    }
    return [int]$mappedProcessId
}

function Stop-ExcelAutomationProcess {
    param([int]$ProcessId)

    if ($ProcessId -le 0) { return }
    $excelProcess = $null
    try {
        $excelProcess = [Diagnostics.Process]::GetProcessById($ProcessId)
        if (-not $excelProcess.WaitForExit(500)) {
            $excelProcess.Kill()
            [void]$excelProcess.WaitForExit(2000)
        }
    }
    catch { }
    finally {
        if ($excelProcess) { $excelProcess.Dispose() }
    }
}

function ConvertTo-Token {
    param([string]$Text)
    $bytes = $Utf8.GetBytes($Text)
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function ConvertFrom-Token {
    param([string]$Token)
    $base64 = $Token.Replace("-", "+").Replace("_", "/")
    switch ($base64.Length % 4) {
        2 { $base64 += "==" }
        3 { $base64 += "=" }
    }
    return $Utf8.GetString([Convert]::FromBase64String($base64))
}

function Test-PathInside {
    param(
        [string]$Path,
        [string]$Root
    )
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd("\") + "\"
    return $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)
}

function ConvertTo-ColumnName {
    param([int]$Column)
    $name = ""
    $current = $Column
    while ($current -gt 0) {
        $current--
        $name = [char](65 + ($current % 26)) + $name
        $current = [Math]::Floor($current / 26)
    }
    return $name
}

function Get-MatrixValue {
    param(
        $Values,
        [int]$Row,
        [int]$Column
    )

    if ($null -eq $Values) { return "" }
    if ($Values -is [array]) {
        try { return ConvertTo-SafeText $Values.GetValue($Row, $Column) }
        catch { return "" }
    }
    if ($Row -eq 1 -and $Column -eq 1) { return ConvertTo-SafeText $Values }
    return ""
}

function ConvertTo-SafeText {
    param($Value)
    if ($null -eq $Value) { return "" }
    return (($Value -as [string]) -replace "\s+", " ").Trim()
}

function Normalize-Text {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return "" }
    $normalized = $Text.Normalize([Text.NormalizationForm]::FormD)
    $builder = [Text.StringBuilder]::new()
    foreach ($ch in $normalized.ToCharArray()) {
        $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
        if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($ch)
        }
    }
    return ($builder.ToString().ToUpperInvariant() -replace "[^A-Z0-9 ]+", " " -replace "\s+", " ").Trim()
}

function Test-RoteiroSheetName {
    param([string]$Name)
    return (Normalize-Text $Name).StartsWith((Normalize-Text $RoteiroSheetPrefix), [System.StringComparison]::Ordinal)
}

function Find-RoteiroSheet {
    param($Workbook)
    foreach ($sheet in @($Workbook.Worksheets)) {
        if (Test-RoteiroSheetName ([string]$sheet.Name)) { return $sheet }
    }
    return $null
}

function Find-WorksheetByNames {
    param(
        $Workbook,
        [string[]]$Names
    )
    $wanted = @($Names | ForEach-Object { Normalize-Text $_ })
    foreach ($sheet in @($Workbook.Worksheets)) {
        $normalized = Normalize-Text ([string]$sheet.Name)
        if ($wanted -contains $normalized) { return $sheet }
    }
    return $null
}

function Get-CellText {
    param(
        $Worksheet,
        [int]$Row,
        [int]$Column
    )
    $cell = $Worksheet.Cells.Item($Row, $Column)
    $text = ConvertTo-SafeText $cell.Text
    if (-not $text) {
        $text = ConvertTo-SafeText $cell.Value2
    }
    return $text
}

function Get-TechnicalCellInfo {
    param(
        $Worksheet,
        [int]$Row,
        [int]$Column
    )

    $cell = $Worksheet.Cells.Item($Row, $Column)
    $startRow = $Row
    $startColumn = $Column
    $endRow = $Row
    $endColumn = $Column
    $valueCell = $cell

    try {
        if ($cell.MergeCells) {
            $area = $cell.MergeArea
            $startRow = [int]$area.Row
            $startColumn = [int]$area.Column
            $endRow = $startRow + [int]$area.Rows.Count - 1
            $endColumn = $startColumn + [int]$area.Columns.Count - 1
            $valueCell = $area.Cells.Item(1, 1)
        }
    }
    catch {
    }

    $text = ConvertTo-SafeText $valueCell.Text
    if (-not $text) { $text = ConvertTo-SafeText $valueCell.Value2 }

    return [ordered]@{
        text = $text
        startRow = $startRow
        startColumn = $startColumn
        endRow = $endRow
        endColumn = $endColumn
    }
}

function Get-TechnicalCellText {
    param(
        $Worksheet,
        [int]$Row,
        [int]$Column
    )
    return (Get-TechnicalCellInfo $Worksheet $Row $Column).text
}

function Get-RoteiroHeaderRow {
    param($Worksheet)

    $used = $Worksheet.UsedRange
    $lastRow = [Math]::Min([Math]::Max($used.Rows.Count, 1), 80)

    for ($row = 1; $row -le $lastRow; $row++) {
        $codeHeader = Normalize-Text (Get-CellText $Worksheet $row 2)
        $descriptionHeader = Normalize-Text (Get-CellText $Worksheet $row 6)

        if ($codeHeader.Contains("CODIGO") -and $descriptionHeader.Contains("DESCRICAO")) {
            return $row
        }
    }

    return 0
}

function Get-ZipEntryText {
    param(
        [IO.Compression.ZipArchive]$Zip,
        [string]$Name
    )

    $entry = $Zip.GetEntry($Name)
    if ($null -eq $entry) { return $null }

    $stream = $entry.Open()
    try {
        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
        try { return $reader.ReadToEnd() }
        finally { $reader.Close() }
    }
    finally {
        $stream.Close()
    }
}

function Join-OpenXmlPath {
    param(
        [string]$BasePath,
        [string]$Target
    )

    if ([string]::IsNullOrWhiteSpace($Target)) { return "" }
    if ($Target.StartsWith("/")) { return $Target.TrimStart("/") }

    $baseDir = [IO.Path]::GetDirectoryName($BasePath).Replace("\", "/")
    $parts = [System.Collections.Generic.List[string]]::new()
    foreach ($part in (($baseDir + "/" + $Target) -split "/")) {
        if (-not $part -or $part -eq ".") { continue }
        if ($part -eq "..") {
            if ($parts.Count -gt 0) { $parts.RemoveAt($parts.Count - 1) }
            continue
        }
        $parts.Add($part)
    }
    return ($parts -join "/")
}

function Get-OpenXmlRelationships {
    param(
        [IO.Compression.ZipArchive]$Zip,
        [string]$RelsPath
    )

    $map = @{}
    $relsText = Get-ZipEntryText $Zip $RelsPath
    if (-not $relsText) { return $map }

    [xml]$rels = $relsText
    foreach ($rel in @($rels.SelectNodes("//*[local-name()='Relationship']"))) {
        $id = $rel.GetAttribute("Id")
        $target = $rel.GetAttribute("Target")
        if ($id -and $target) { $map[$id] = $target }
    }
    return $map
}

function Get-WorkbookSheetMap {
    param([IO.Compression.ZipArchive]$Zip)

    $workbookText = Get-ZipEntryText $Zip "xl/workbook.xml"
    if (-not $workbookText) { return @() }

    [xml]$workbook = $workbookText
    $rels = Get-OpenXmlRelationships $Zip "xl/_rels/workbook.xml.rels"
    $sheets = @()
    foreach ($sheet in @($workbook.SelectNodes("//*[local-name()='sheet']"))) {
        $relId = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
        if (-not $relId) { $relId = $sheet.GetAttribute("r:id") }
        if (-not $relId -or -not $rels.ContainsKey($relId)) { continue }

        $sheets += [ordered]@{
            name = [string]$sheet.GetAttribute("name")
            path = Join-OpenXmlPath "xl/workbook.xml" $rels[$relId]
        }
    }
    return $sheets
}

function Get-WorksheetDrawingPath {
    param(
        [IO.Compression.ZipArchive]$Zip,
        [string]$SheetPath
    )

    $sheetText = Get-ZipEntryText $Zip $SheetPath
    if (-not $sheetText) { return "" }

    [xml]$sheetXml = $sheetText
    $drawing = @($sheetXml.SelectNodes("//*[local-name()='drawing']"))[0]
    if (-not $drawing) { return "" }

    $relId = $drawing.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    if (-not $relId) { $relId = $drawing.GetAttribute("r:id") }
    if (-not $relId) { return "" }

    $sheetFile = [IO.Path]::GetFileName($SheetPath)
    $sheetDir = [IO.Path]::GetDirectoryName($SheetPath).Replace("\", "/")
    $relsPath = "$sheetDir/_rels/$sheetFile.rels"
    $rels = Get-OpenXmlRelationships $Zip $relsPath
    if (-not $rels.ContainsKey($relId)) { return "" }

    return Join-OpenXmlPath $SheetPath $rels[$relId]
}

function Copy-WorkbookImages {
    param([string]$Path)

    $imagesBySheet = @{}
    $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
    if ($extension -notin @(".xlsx", ".xlsm")) { return $imagesBySheet }

    $assetFolder = Join-Path $FichaAssetRoot (ConvertTo-Token $Path)
    if (Test-Path -LiteralPath $assetFolder) {
        Remove-Item -LiteralPath $assetFolder -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $assetFolder -Force | Out-Null

    $fileStream = $null
    $zip = $null
    try {
        $fileStream = [IO.FileStream]::new(
            $Path,
            [IO.FileMode]::Open,
            [IO.FileAccess]::Read,
            [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete
        )
        $zip = [IO.Compression.ZipArchive]::new($fileStream, [IO.Compression.ZipArchiveMode]::Read, $false)
        foreach ($sheet in @(Get-WorkbookSheetMap $zip)) {
            $drawingPath = Get-WorksheetDrawingPath $zip $sheet.path
            if (-not $drawingPath) { continue }

            $drawingText = Get-ZipEntryText $zip $drawingPath
            if (-not $drawingText) { continue }

            [xml]$drawingXml = $drawingText
            $drawingFile = [IO.Path]::GetFileName($drawingPath)
            $drawingDir = [IO.Path]::GetDirectoryName($drawingPath).Replace("\", "/")
            $relsPath = "$drawingDir/_rels/$drawingFile.rels"
            $rels = Get-OpenXmlRelationships $zip $relsPath

            $sheetKey = Normalize-Text $sheet.name
            $items = @()
            $order = 0
            foreach ($blip in @($drawingXml.SelectNodes("//*[local-name()='blip']"))) {
                $embed = $blip.GetAttribute("embed", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
                if (-not $embed) { $embed = $blip.GetAttribute("r:embed") }
                if (-not $embed -or -not $rels.ContainsKey($embed)) { continue }

                $mediaPath = Join-OpenXmlPath $drawingPath $rels[$embed]
                $entry = $zip.GetEntry($mediaPath)
                if ($null -eq $entry) { continue }

                $order++
                $mediaExtension = [IO.Path]::GetExtension($mediaPath).ToLowerInvariant()
                if (-not $mediaExtension) { $mediaExtension = ".png" }
                $destPath = Join-Path $assetFolder ("$sheetKey-$order$mediaExtension")

                $source = $entry.Open()
                try {
                    $dest = [IO.File]::Create($destPath)
                    try { $source.CopyTo($dest) }
                    finally { $dest.Close() }
                }
                finally {
                    $source.Close()
                }

                $anchor = $blip.ParentNode
                while ($anchor -and $anchor.LocalName -notin @("twoCellAnchor", "oneCellAnchor", "absoluteAnchor")) {
                    $anchor = $anchor.ParentNode
                }
                $row = 0
                $column = 0
                if ($anchor) {
                    $from = @($anchor.SelectNodes(".//*[local-name()='from']"))[0]
                    if ($from) {
                        $rowNode = @($from.SelectNodes("./*[local-name()='row']"))[0]
                        $columnNode = @($from.SelectNodes("./*[local-name()='col']"))[0]
                        if ($rowNode) { [void][int]::TryParse($rowNode.InnerText, [ref]$row); $row++ }
                        if ($columnNode) { [void][int]::TryParse($columnNode.InnerText, [ref]$column); $column++ }
                    }
                }

                $token = ConvertTo-Token $destPath
                $items += [ordered]@{
                    id = $token
                    url = "/asset?id=$token"
                    sheet = $sheet.name
                    order = $order
                    row = $row
                    column = $column
                    name = [IO.Path]::GetFileName($mediaPath)
                }
            }

            if ($items.Count -gt 0) {
                $imagesBySheet[$sheetKey] = @($items | Sort-Object row, column, order)
            }
        }
    }
    catch {
        return $imagesBySheet
    }
    finally {
        if ($zip) { $zip.Dispose() }
        if ($fileStream) { $fileStream.Dispose() }
    }

    return $imagesBySheet
}

function Get-SheetImages {
    param(
        [hashtable]$ImageIndex,
        $Worksheet
    )
    if ($null -eq $Worksheet) { return @() }
    $key = Normalize-Text ([string]$Worksheet.Name)
    if ($ImageIndex.ContainsKey($key)) { return @($ImageIndex[$key]) }
    return @()
}

function Get-CommentWorksheetBlocks {
    param($Worksheet)

    if ($null -eq $Worksheet) { return @() }

    $used = $null
    $sectionRange = $null
    try {
        $used = $Worksheet.UsedRange
        $firstRow = [Math]::Max(9, [int]$used.Row)
        $lastRow = [int]$used.Row + [int]$used.Rows.Count - 1
        if ($lastRow -lt $firstRow) { return @() }

        $sectionRange = $Worksheet.Range("A$($firstRow):A$($lastRow)")
        $values = $sectionRange.Value2
        $sectionNames = @("MODELAGEM", "ENGENHARIA", "PILOTAGEM", "MARKETING")
        $seen = @{}
        $anchors = @()

        for ($row = $firstRow; $row -le $lastRow; $row++) {
            $value = Normalize-Text (Get-MatrixValue $values ($row - $firstRow + 1) 1)
            if (($sectionNames -contains $value) -and -not $seen.ContainsKey($value)) {
                $seen[$value] = $true
                $anchors += [ordered]@{
                    name = $value
                    row = $row
                }
            }
        }

        if ($anchors.Count -eq 0) { return @() }

        $blocks = @()
        for ($index = 0; $index -lt $anchors.Count; $index++) {
            $start = [int]$anchors[$index].row
            $end = if ($index -lt ($anchors.Count - 1)) {
                [int]$anchors[$index + 1].row - 1
            }
            else {
                $lastRow
            }
            $blocks += [ordered]@{
                start = $start
                end = $end
            }
        }
        return $blocks
    }
    finally {
        Release-ComObject $sectionRange
        Release-ComObject $used
    }
}

function Export-WorksheetFormattedBlocks {
    param(
        $Worksheet,
        $ExcelApplication,
        [string]$WorkbookPath,
        [int]$StartRow = 13,
        [int]$SplitGap = 6,
        [string]$FilePrefix = "PLANILHA-FORMATADA",
        [array]$BlockRanges = @()
    )

    if ($null -eq $Worksheet) { return @() }

    $assetFolder = Join-Path $FichaAssetRoot (ConvertTo-Token $WorkbookPath)
    New-Item -ItemType Directory -Path $assetFolder -Force | Out-Null

    $used = $null
    $matrixRange = $null
    $range = $null
    $activeWindow = $null
    $chartObjects = $null
    $chartObject = $null
    $chart = $null
    $items = @()

    try {
        $used = $Worksheet.UsedRange
        $firstRow = [Math]::Max($StartRow, [int]$used.Row)
        $firstColumn = [Math]::Max(1, [int]$used.Column)
        $lastRow = [int]$used.Row + [int]$used.Rows.Count - 1
        $lastColumn = [int]$used.Column + [int]$used.Columns.Count - 1
        if ($lastRow -lt $firstRow -or $lastColumn -lt $firstColumn) { return @() }

        $firstColumnName = ConvertTo-ColumnName $firstColumn
        $lastColumnName = ConvertTo-ColumnName $lastColumn
        $blocks = @()

        if (@($BlockRanges).Count -gt 0) {
            foreach ($block in @($BlockRanges)) {
                $blockStart = [Math]::Max($firstRow, [int]$block.start)
                $blockEnd = [Math]::Min($lastRow, [int]$block.end)
                if ($blockEnd -ge $blockStart) {
                    $blocks += [ordered]@{
                        start = $blockStart
                        end = $blockEnd
                    }
                }
            }
        }
        else {
            $matrixAddress = "{0}{1}:{2}{3}" -f $firstColumnName, $firstRow, $lastColumnName, $lastRow
            $matrixRange = $Worksheet.Range($matrixAddress)
            $matrix = $matrixRange.Value2
            $contentRows = @()

            for ($row = $firstRow; $row -le $lastRow; $row++) {
                $matrixRow = $row - $firstRow + 1
                $hasContent = $false
                for ($column = $firstColumn; $column -le $lastColumn; $column++) {
                    $matrixColumn = $column - $firstColumn + 1
                    if (Get-MatrixValue $matrix $matrixRow $matrixColumn) {
                        $hasContent = $true
                        break
                    }
                }
                if ($hasContent) { $contentRows += $row }
            }

            if ($contentRows.Count -eq 0) { return @() }

            $blockStart = [int]$contentRows[0]
            $previousRow = $blockStart
            for ($index = 1; $index -lt $contentRows.Count; $index++) {
                $currentRow = [int]$contentRows[$index]
                if (($currentRow - $previousRow) -gt $SplitGap) {
                    $blocks += [ordered]@{
                        start = $blockStart
                        end = [Math]::Min($lastRow, $previousRow + 2)
                    }
                    $blockStart = $currentRow
                }
                $previousRow = $currentRow
            }
            $blocks += [ordered]@{
                start = $blockStart
                end = [Math]::Min($lastRow, $previousRow + 2)
            }
        }

        if ($blocks.Count -eq 0) { return @() }

        $Worksheet.Activate() | Out-Null
        try {
            $activeWindow = $ExcelApplication.ActiveWindow
            if ($activeWindow) { $activeWindow.View = 1 }
        }
        catch { }
        Release-ComObject $activeWindow
        $activeWindow = $null

        $order = 0
        foreach ($block in @($blocks)) {
            $order++
            $blockAddress = "{0}{1}:{2}{3}" -f $firstColumnName, [int]$block.start, $lastColumnName, [int]$block.end
            $range = $Worksheet.Range($blockAddress)

            $fileName = "$FilePrefix-$order.png"
            $destPath = Join-Path $assetFolder $fileName
            if (Test-Path -LiteralPath $destPath) {
                Remove-Item -LiteralPath $destPath -Force -ErrorAction SilentlyContinue
            }

            $range.CopyPicture(1, 2) | Out-Null
            $chartObjects = $Worksheet.ChartObjects()
            $chartObject = $chartObjects.Add(
                0,
                0,
                [double]$range.Width,
                [double]$range.Height
            )
            $chartObject.Activate() | Out-Null
            $chart = $chartObject.Chart
            $chart.Paste() | Out-Null
            $exported = $chart.Export($destPath, "PNG")

            if ($exported -and (Test-Path -LiteralPath $destPath)) {
                $token = ConvertTo-Token $destPath
                $items += [ordered]@{
                    id = $token
                    url = "/asset?id=$token"
                    sheet = [string]$Worksheet.Name
                    order = $order
                    row = [int]$block.start
                    column = $firstColumn
                    name = $fileName
                }
            }

            Release-ComObject $chart
            $chart = $null
            $chartObject.Delete() | Out-Null
            Release-ComObject $chartObject
            $chartObject = $null
            Release-ComObject $chartObjects
            $chartObjects = $null
            Release-ComObject $range
            $range = $null
        }
    }
    catch {
        return @()
    }
    finally {
        if ($chartObject) {
            try { $chartObject.Delete() | Out-Null } catch { }
        }
        Release-ComObject $chart
        Release-ComObject $chartObject
        Release-ComObject $chartObjects
        Release-ComObject $activeWindow
        Release-ComObject $range
        Release-ComObject $matrixRange
        Release-ComObject $used
    }

    return $items
}

function Get-WorksheetRows {
    param(
        $Worksheet,
        [int]$MaxRows = 220,
        [int]$MaxColumns = 32
    )

    if ($null -eq $Worksheet) { return @() }
    $used = $Worksheet.UsedRange
    $lastRow = [Math]::Min([Math]::Max($used.Rows.Count, 1), $MaxRows)
    $lastColumn = [Math]::Min([Math]::Max($used.Columns.Count, 1), $MaxColumns)
    $range = $Worksheet.Range($Worksheet.Cells.Item(1, 1), $Worksheet.Cells.Item($lastRow, $lastColumn))
    $matrix = $range.Value2
    $rows = @()

    for ($row = 1; $row -le $lastRow; $row++) {
        $cells = @()
        for ($column = 1; $column -le $lastColumn; $column++) {
            $text = Get-MatrixValue $matrix $row $column
            if ($text) {
                $cells += [ordered]@{
                    column = $column
                    columnName = ConvertTo-ColumnName $column
                    text = $text
                }
            }
        }
        if ($cells.Count -gt 0) {
            $rows += [ordered]@{
                row = $row
                cells = $cells
            }
        }
    }
    return $rows
}

function Get-WorksheetFields {
    param($Worksheet)

    if ($null -eq $Worksheet) { return @() }
    $keys = @(
        "REFERENCIA",
        "DESCRICAO",
        "COLECAO",
        "ESTILISTA",
        "MODELISTA",
        "ENGENHARIA",
        "GRADE",
        "PILOTISTA",
        "COMPOSICAO",
        "DATA DE LIBERACAO DA FICHA",
        "LOCAL DO ARQUIVO"
    )

    $fields = @()
    $seen = @{}
    $used = $Worksheet.UsedRange
    $lastRow = [Math]::Min([Math]::Max($used.Rows.Count, 1), 12)
    $lastColumn = [Math]::Min([Math]::Max($used.Columns.Count, 1), 24)
    $range = $Worksheet.Range($Worksheet.Cells.Item(1, 1), $Worksheet.Cells.Item($lastRow, $lastColumn))
    $matrix = $range.Value2

    for ($row = 1; $row -le $lastRow; $row++) {
        for ($column = 1; $column -le $lastColumn; $column++) {
            $labelText = Get-MatrixValue $matrix $row $column
            if (-not $labelText) { continue }

            $normalizedLabel = (Normalize-Text $labelText).Trim()
            foreach ($key in $keys) {
                if ($seen.ContainsKey($key)) { continue }
                if ($normalizedLabel -eq $key -or $normalizedLabel.StartsWith("$key ", [System.StringComparison]::Ordinal)) {
                    $value = ""
                    $labelEndColumn = $column
                    try {
                        $labelCell = $Worksheet.Cells.Item($row, $column)
                        if ($labelCell.MergeCells) {
                            $labelArea = $labelCell.MergeArea
                            $labelEndColumn = [int]$labelArea.Column + [int]$labelArea.Columns.Count - 1
                        }
                    }
                    catch {
                    }

                    $firstValueColumn = [Math]::Max($column + 1, $labelEndColumn + 1)
                    for ($valueColumn = $firstValueColumn; $valueColumn -le [Math]::Min($firstValueColumn + 6, $lastColumn); $valueColumn++) {
                        $candidate = Get-MatrixValue $matrix $row $valueColumn
                        if ($candidate) {
                            $normalizedCandidate = (Normalize-Text $candidate).Trim()
                            $isAnotherLabel = @($keys | Where-Object {
                                $normalizedCandidate -eq $_ -or $normalizedCandidate.StartsWith("$_ ", [System.StringComparison]::Ordinal)
                            }).Count -gt 0
                            if ($isAnotherLabel) { break }
                            $formattedCandidate = Get-CellText $Worksheet $row $valueColumn
                            $value = if ($formattedCandidate) { $formattedCandidate } else { $candidate }
                            break
                        }
                    }
                    if ($value) {
                        $fields += [ordered]@{
                            key = $key
                            label = ($labelText -replace "[:：]+$", "").Trim()
                            value = $value
                        }
                        $seen[$key] = $true
                    }
                }
            }
        }
    }
    return $fields
}

function Get-FieldValue {
    param(
        [array]$Fields,
        [string]$Key
    )
    $match = @($Fields | Where-Object { $_.key -eq $Key })[0]
    if ($match) { return $match.value }
    return ""
}

function Get-CoverStatusItems {
    param($Worksheet)

    if ($null -eq $Worksheet) { return @() }
    $items = @()
    $seen = @{}
    for ($row = 3; $row -le 8; $row++) {
        $item = Get-TechnicalCellText $Worksheet $row 6
        $size = Get-TechnicalCellText $Worksheet $row 9
        $quantity = Get-TechnicalCellText $Worksheet $row 10
        $delivery = Get-TechnicalCellText $Worksheet $row 11
        if ($item -or $size -or $quantity -or $delivery) {
            $key = Normalize-Text "$item|$size|$quantity|$delivery"
            if ($seen.ContainsKey($key)) { continue }
            $seen[$key] = $true
            $items += [ordered]@{
                item = $item
                size = $size
                quantity = $quantity
                delivery = $delivery
            }
        }
    }
    return $items
}

function Get-ColorOptionsFromRows {
    param([array]$Rows)

    $colors = @()
    $seen = @{}
    foreach ($row in @($Rows)) {
        foreach ($cell in @($row.cells)) {
            $text = ConvertTo-SafeText $cell.text
            if (-not $text -or $text -notmatch "\|") { continue }

            $parts = @($text -split "\|", 2)
            if ($parts.Count -lt 2) { continue }
            $code = ConvertTo-SafeText $parts[0]
            $name = ConvertTo-SafeText $parts[1]
            if (-not $code -or -not $name) { continue }
            if ($code -notmatch "^[A-Z0-9. -]{2,}$") { continue }

            $key = (Normalize-Text "$code $name")
            if ($seen.ContainsKey($key)) { continue }
            $seen[$key] = $true
            $colors += [ordered]@{
                code = $code
                name = $name
                sourceRow = $row.row
            }
        }
    }
    return $colors
}

function Get-MeasurementTable {
    param($Worksheet)

    if ($null -eq $Worksheet) { return [ordered]@{ sizes = @(); rows = @() } }

    $used = $Worksheet.UsedRange
    $lastRow = [Math]::Min([Math]::Max($used.Rows.Count, 1), 160)
    $lastColumn = [Math]::Min([Math]::Max($used.Columns.Count, 1), 24)
    $range = $Worksheet.Range($Worksheet.Cells.Item(1, 1), $Worksheet.Cells.Item($lastRow, $lastColumn))
    $matrix = $range.Value2
    $headerRow = 0
    for ($row = 1; $row -le $lastRow; $row++) {
        for ($column = 1; $column -le $lastColumn; $column++) {
            if ((Normalize-Text (Get-MatrixValue $matrix $row $column)) -eq "TAMANHOS") {
                $headerRow = $row
                break
            }
        }
        if ($headerRow) { break }
    }

    if (-not $headerRow) { return [ordered]@{ sizes = @(); rows = @() } }

    $sizes = @()
    for ($column = 2; $column -le $lastColumn; $column++) {
        $size = Get-MatrixValue $matrix $headerRow $column
        if ($size) {
            $sizes += [ordered]@{
                column = $column
                label = $size
            }
        }
    }

    $rows = @()
    for ($row = $headerRow + 1; $row -le $lastRow; $row++) {
        $measure = Get-MatrixValue $matrix $row 1
        if (-not $measure) { continue }
        if ((Normalize-Text $measure).StartsWith("OBSERV", [System.StringComparison]::Ordinal)) { break }

        $measureValues = @()
        foreach ($size in @($sizes)) {
            $cellValue = Get-MatrixValue $matrix $row $size.column
            $measureValues += [ordered]@{
                size = $size.label
                value = $cellValue
            }
        }
        if (@($measureValues | Where-Object { $_.value }).Count -gt 0) {
            $rows += [ordered]@{
                measure = $measure
                values = $measureValues
            }
        }
    }

    return [ordered]@{
        sizes = @($sizes | ForEach-Object { $_.label })
        rows = $rows
    }
}

function Get-TechnicalSheetSection {
    param(
        $Worksheet,
        [hashtable]$ImageIndex,
        [int]$MaxRows = 220,
        [int]$MaxColumns = 32
    )

    if ($null -eq $Worksheet) {
        return [ordered]@{
            present = $false
            sheetName = ""
            fields = @()
            rows = @()
            images = @()
            colors = @()
        }
    }

    $rows = Get-WorksheetRows $Worksheet $MaxRows $MaxColumns
    return [ordered]@{
        present = $true
        sheetName = [string]$Worksheet.Name
        title = Get-CellText $Worksheet 1 1
        fields = Get-WorksheetFields $Worksheet
        rows = $rows
        images = Get-SheetImages $ImageIndex $Worksheet
        colors = Get-ColorOptionsFromRows $rows
    }
}

function Read-TechnicalSheetData {
    param(
        $Workbook,
        $ExcelApplication,
        [hashtable]$ImageIndex,
        [string]$WorkbookPath
    )

    $capa = Find-WorksheetByNames $Workbook @("CAPA")
    $variantes = Find-WorksheetByNames $Workbook @("VARIANTES")
    $modelagem = Find-WorksheetByNames $Workbook @("MODELAGEM")
    $insumos = Find-WorksheetByNames $Workbook @("INSUMOS")
    $comentarios = Find-WorksheetByNames $Workbook @("COMENTARIOS", "COMENTÁRIOS")
    $estilo = Find-WorksheetByNames $Workbook @("ESTILO")

    $cover = Get-TechnicalSheetSection $capa $ImageIndex 80 18
    $cover["statusItems"] = Get-CoverStatusItems $capa

    $modeling = Get-TechnicalSheetSection $modelagem $ImageIndex 180 24
    $modeling["measurements"] = Get-MeasurementTable $modelagem

    $comments = Get-TechnicalSheetSection $comentarios $ImageIndex 220 16
    $commentBlocks = @(Get-CommentWorksheetBlocks $comentarios)
    $formattedComments = @(Export-WorksheetFormattedBlocks `
        -Worksheet $comentarios `
        -ExcelApplication $ExcelApplication `
        -WorkbookPath $WorkbookPath `
        -StartRow 9 `
        -SplitGap 6 `
        -FilePrefix "COMENTARIOS-FORMATADO" `
        -BlockRanges $commentBlocks)
    $comments["formattedImages"] = $formattedComments
    $style = Get-TechnicalSheetSection $estilo $ImageIndex 120 16
    $supplies = Get-TechnicalSheetSection $insumos $ImageIndex 180 18
    $formattedSupplies = @(Export-WorksheetFormattedBlocks `
        -Worksheet $insumos `
        -ExcelApplication $ExcelApplication `
        -WorkbookPath $WorkbookPath `
        -StartRow 13 `
        -SplitGap 6 `
        -FilePrefix "INSUMOS-FORMATADO")
    $supplies["formattedImages"] = $formattedSupplies

    return [ordered]@{
        cover = $cover
        variants = Get-TechnicalSheetSection $variantes $ImageIndex 120 18
        modeling = $modeling
        supplies = $supplies
        comments = $comments
        style = $style
        availableSheets = @($Workbook.Worksheets | ForEach-Object { [string]$_.Name })
    }
}

function Get-WorkbookSignature {
    param([System.IO.FileInfo]$File)
    return "v$FichaCacheVersion|$($File.FullName)|$($File.LastWriteTimeUtc.Ticks)|$($File.Length)"
}

function Get-WorkbookHasTargetSheetFromOpenXml {
    param([string]$Path)

    $fileStream = $null
    $zip = $null
    $stream = $null
    $reader = $null

    try {
        $fileStream = [IO.FileStream]::new(
            $Path,
            [IO.FileMode]::Open,
            [IO.FileAccess]::Read,
            [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete
        )
        $zip = [IO.Compression.ZipArchive]::new($fileStream, [IO.Compression.ZipArchiveMode]::Read, $false)
        $entry = $zip.GetEntry("xl/workbook.xml")
        if ($null -eq $entry) { return $false }

        $stream = $entry.Open()
        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
        $workbookXml = $reader.ReadToEnd()
        [xml]$workbook = $workbookXml

        foreach ($sheet in @($workbook.workbook.sheets.sheet)) {
            if (Test-RoteiroSheetName ([string]$sheet.name)) { return $true }
        }
        return $false
    }
    catch {
        return $false
    }
    finally {
        if ($reader) { $reader.Close() }
        elseif ($stream) { $stream.Close() }
        if ($zip) { $zip.Dispose() }
        if ($fileStream) { $fileStream.Dispose() }
    }
}

function Get-WorkbookHasTargetSheetFromExcel {
    param([string]$Path)

    $excelProcessIdsBefore = @(Get-Process EXCEL -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $excel = $null
    $excelProcessId = 0
    $workbook = $null
    try {
        $excel = New-Object -ComObject Excel.Application
        $excelProcessId = Get-ExcelAutomationProcessId $excelProcessIdsBefore $excel
        $excel.Visible = $false
        $excel.DisplayAlerts = $false
        $excel.AskToUpdateLinks = $false
        $workbook = $excel.Workbooks.Open($Path, 0, $true)
        return $null -ne (Find-RoteiroSheet $workbook)
    }
    catch {
        return $false
    }
    finally {
        if ($workbook) { $workbook.Close($false) | Out-Null }
        if ($excel) { $excel.Quit() | Out-Null }
        Release-ComObject $workbook
        Release-ComObject $excel
        Stop-ExcelAutomationProcess $excelProcessId
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}

function Test-WorkbookHasTargetSheet {
    param([System.IO.FileInfo]$File)

    $extension = $File.Extension.ToLowerInvariant()
    if ($extension -in @(".xlsx", ".xlsm")) {
        return Get-WorkbookHasTargetSheetFromOpenXml $File.FullName
    }
    if ($extension -eq ".xls") {
        return Get-WorkbookHasTargetSheetFromExcel $File.FullName
    }
    return $false
}

function Get-LocalIpAddresses {
    $addresses = @()
    try {
        $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -notlike "127.*" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.PrefixOrigin -ne "WellKnown"
            } |
            Select-Object -ExpandProperty IPAddress -Unique
    }
    catch {
        try {
            $addresses = [Net.Dns]::GetHostAddresses([Net.Dns]::GetHostName()) |
                Where-Object { $_.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork } |
                ForEach-Object { $_.IPAddressToString } |
                Where-Object { $_ -notlike "127.*" -and $_ -notlike "169.254.*" } |
                Select-Object -Unique
        }
        catch {
            $addresses = @()
        }
    }
    return @($addresses)
}

function Get-AccessInfo {
    $localUrl = "http://localhost:$Port/"
    $networkUrls = @()
    if ($script:NetworkAccessEnabled) {
        $networkUrls = @(Get-LocalIpAddresses | ForEach-Object { "http://$_`:$Port/" })
    }

    return [ordered]@{
        localUrl = $localUrl
        networkUrls = $networkUrls
        listenerPrefix = $script:ListenerPrefix
        networkAccessEnabled = $script:NetworkAccessEnabled
        networkAccessWarning = $script:NetworkAccessWarning
        externalAccessNote = "Para acessar fora da empresa, publique este servidor por VPN, túnel seguro ou servidor web com HTTPS/autenticação."
    }
}

function Get-PersistedFichaCache {
    if (-not (Test-Path -LiteralPath $FichaCachePath)) { return @{} }

    try {
        $items = Get-Content -Raw -Encoding UTF8 -LiteralPath $FichaCachePath | ConvertFrom-Json
        $cache = @{}
        foreach ($item in @($items)) {
            if ($item.path) { $cache[$item.path] = $item }
        }
        return $cache
    }
    catch {
        return @{}
    }
}

function Save-PersistedFichaCache {
    param([hashtable]$Cache)

    $items = @($Cache.Values | Sort-Object path)
    $json = $items | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText($FichaCachePath, $json, $Utf8)
}

function Get-VideoIndex {
    if ($null -ne $script:VideoIndex) { return $script:VideoIndex }

    $byCode = @{}
    $items = @()
    if (Test-Path -LiteralPath $VideoRoot) {
        $files = Get-ChildItem -LiteralPath $VideoRoot -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $VideoExtensions -contains $_.Extension.ToLowerInvariant() }

        foreach ($file in $files) {
            $code = ""
            if ($file.BaseName -match "^\s*(\d{2,})\b") {
                $code = $Matches[1]
            }
            $token = ConvertTo-Token $file.FullName
            $video = [ordered]@{
                id = $token
                code = $code
                name = $file.Name
                path = $file.FullName
                modifiedAt = $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm")
                size = $file.Length
                url = "/video?id=$token"
            }
            $items += $video
            if ($code -and -not $byCode.ContainsKey($code)) {
                $byCode[$code] = $video
            }
        }
    }

    $script:VideoIndex = [ordered]@{
        byCode = $byCode
        items = $items
        count = $items.Count
    }
    $script:VideoIndexAt = Get-Date
    return $script:VideoIndex
}

function Get-Fichas {
    if ($null -ne $script:FichaCache -and $null -ne $script:FichaCacheAt) {
        $cacheAge = ((Get-Date) - $script:FichaCacheAt).TotalSeconds
        if ($cacheAge -lt $FichaMemoryCacheSeconds) {
            return $script:FichaCache
        }
    }
    if (-not (Test-Path -LiteralPath $FichaRoot)) { return @() }

    $files = Get-ChildItem -LiteralPath $FichaRoot -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $ExcelExtensions -contains $_.Extension.ToLowerInvariant() } |
        Sort-Object FullName

    $result = @()
    $persistedCache = Get-PersistedFichaCache
    $cacheChanged = $false

    foreach ($file in $files) {
        if ($file.Name.StartsWith("~$")) { continue }

        $signature = Get-WorkbookSignature $file
        $cacheItem = $persistedCache[$file.FullName]
        if ($cacheItem -and $cacheItem.signature -eq $signature) {
            $hasTargetSheet = [bool]$cacheItem.hasTargetSheet
        }
        else {
            $hasTargetSheet = Test-WorkbookHasTargetSheet $file
            $persistedCache[$file.FullName] = [ordered]@{
                path = $file.FullName
                signature = $signature
                hasTargetSheet = $hasTargetSheet
                checkedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            }
            $cacheChanged = $true
        }

        if (-not $hasTargetSheet) { continue }

        $relative = $file.FullName.Substring($FichaRoot.Length).TrimStart("\")
        $result += [ordered]@{
            id = ConvertTo-Token $file.FullName
            name = $file.Name
            relativePath = $relative
            folder = Split-Path -Parent $relative
            extension = $file.Extension.ToLowerInvariant()
            modifiedAt = $file.LastWriteTime.ToString("dd/MM/yyyy HH:mm")
            size = $file.Length
        }
    }
    if ($cacheChanged) {
        Save-PersistedFichaCache $persistedCache
    }

    $script:FichaCache = $result
    $script:FichaCacheAt = Get-Date
    return $script:FichaCache
}

function Read-Ficha {
    param([string]$Path)

    if (-not (Test-PathInside $Path $FichaRoot)) {
        throw "Arquivo fora da pasta de fichas permitida."
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Arquivo nao encontrado."
    }

    $videoIndex = Get-VideoIndex
    $imageIndex = Copy-WorkbookImages $Path
    $excelProcessIdsBefore = @(Get-Process EXCEL -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $excel = $null
    $excelProcessId = 0
    $workbook = $null
    $worksheet = $null

    try {
        $excel = New-Object -ComObject Excel.Application
        $excelProcessId = Get-ExcelAutomationProcessId $excelProcessIdsBefore $excel
        $excel.Visible = $false
        $excel.DisplayAlerts = $false
        $excel.AskToUpdateLinks = $false

        $workbook = $excel.Workbooks.Open($Path, 0, $true)
        $worksheet = Find-RoteiroSheet $workbook
        if ($null -eq $worksheet) {
            throw "Aba obrigatoria nao encontrada. O nome deve iniciar com: $RoteiroSheetPrefix"
        }

        $technicalData = Read-TechnicalSheetData $workbook $excel $imageIndex $Path

        $used = $worksheet.UsedRange
        $lastRow = [Math]::Max($used.Rows.Count, 1)
        $operations = @()

        $headerRow = Get-RoteiroHeaderRow $worksheet
        $firstDataRow = if ($headerRow -gt 0) { $headerRow + 1 } else { 1 }

        for ($row = $firstDataRow; $row -le $lastRow; $row++) {
            $code = Get-CellText $worksheet $row 2
            if (-not $code) { $code = Get-CellText $worksheet $row 3 }
            $description = Get-CellText $worksheet $row 6

            if (-not $code -and -not $description) { continue }
            if ((Normalize-Text $code).Contains("CODIGO") -or (Normalize-Text $description).Contains("DESCRICAO")) { continue }
            if ($code -notmatch "^\s*\d+\s*$") { continue }

            $number = Get-CellText $worksheet $row 1
            $group = Get-CellText $worksheet $row 4
            $observation = Get-CellText $worksheet $row 18
            $time = Get-CellText $worksheet $row 21
            $totalTime = Get-CellText $worksheet $row 23
            $meta = Get-CellText $worksheet $row 25

            $video = $null
            $codeDigits = ($code -replace "\D", "")
            if ($codeDigits -and $videoIndex.byCode.ContainsKey($codeDigits)) {
                $video = $videoIndex.byCode[$codeDigits]
            }

            $operations += [ordered]@{
                row = $row
                number = $number
                code = $code
                group = $group
                description = $description
                observation = $observation
                time = $time
                totalTime = $totalTime
                meta = $meta
                video = $video
            }
        }

        $file = Get-Item -LiteralPath $Path
        $relative = $file.FullName.Substring($FichaRoot.Length).TrimStart("\")
        $coverFields = @($technicalData["cover"]["fields"])
        $reference = Get-FieldValue $coverFields "REFERENCIA"
        if (-not $reference) { $reference = Get-CellText $worksheet 1 2 }
        $product = Get-FieldValue $coverFields "DESCRICAO"
        if (-not $product) { $product = Get-CellText $worksheet 1 6 }
        return [ordered]@{
            id = ConvertTo-Token $file.FullName
            name = $file.Name
            relativePath = $relative
            sheetName = $worksheet.Name
            reference = $reference
            product = $product
            modifiedAt = $file.LastWriteTime.ToString("dd/MM/yyyy HH:mm")
            technical = $technicalData
            operations = $operations
            operationCount = $operations.Count
            videoCount = @($operations | Where-Object { $null -ne $_.video }).Count
        }
    }
    finally {
        if ($workbook) { $workbook.Close($false) | Out-Null }
        if ($excel) { $excel.Quit() | Out-Null }
        Release-ComObject $worksheet
        Release-ComObject $workbook
        Release-ComObject $excel
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()

        Stop-ExcelAutomationProcess $excelProcessId
    }
}

function Write-Bytes {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [byte[]]$Bytes,
        [string]$ContentType,
        [int]$StatusCode = 200
    )
    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Response.Close()
}

function Write-Text {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [string]$Text,
        [string]$ContentType,
        [int]$StatusCode = 200
    )
    Write-Bytes $Response ($Utf8.GetBytes($Text)) ($ContentType + "; charset=utf-8") $StatusCode
}

function Write-Json {
    param(
        [System.Net.HttpListenerResponse]$Response,
        $Data,
        [int]$StatusCode = 200
    )
    $json = $Data | ConvertTo-Json -Depth 24 -Compress
    Write-Text $Response $json "application/json" $StatusCode
}

function Write-ErrorJson {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [string]$Message,
        [int]$StatusCode = 500
    )
    Write-Json $Response ([ordered]@{ ok = $false; error = $Message }) $StatusCode
}

function Get-StaticContentType {
    param([string]$Path)
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { "text/html" }
        ".css" { "text/css" }
        ".js" { "application/javascript" }
        ".svg" { "image/svg+xml" }
        ".png" { "image/png" }
        ".jpg" { "image/jpeg" }
        ".jpeg" { "image/jpeg" }
        ".gif" { "image/gif" }
        ".webp" { "image/webp" }
        ".ico" { "image/x-icon" }
        default { "application/octet-stream" }
    }
}

function Send-StaticFile {
    param(
        [System.Net.HttpListenerRequest]$Request,
        [System.Net.HttpListenerResponse]$Response
    )
    $relative = [Uri]::UnescapeDataString($Request.Url.AbsolutePath.TrimStart("/"))
    if (-not $relative) { $relative = "index.html" }
    $relative = $relative.Replace("/", "\")
    $path = Join-Path $PublicRoot $relative

    if (-not (Test-PathInside $path $PublicRoot) -or -not (Test-Path -LiteralPath $path)) {
        Write-ErrorJson $Response "Arquivo estatico nao encontrado." 404
        return
    }

    $bytes = [IO.File]::ReadAllBytes($path)
    Write-Bytes $Response $bytes (Get-StaticContentType $path)
}

function Send-Video {
    param(
        [System.Net.HttpListenerRequest]$Request,
        [System.Net.HttpListenerResponse]$Response
    )
    $id = $Request.QueryString["id"]
    if (-not $id) {
        Write-ErrorJson $Response "Video nao informado." 400
        return
    }

    $path = ConvertFrom-Token $id
    if (-not (Test-PathInside $path $VideoRoot) -or -not (Test-Path -LiteralPath $path)) {
        Write-ErrorJson $Response "Video nao encontrado." 404
        return
    }

    $file = Get-Item -LiteralPath $path
    $length = $file.Length
    $start = 0L
    $end = $length - 1
    $status = 200
    $range = $Request.Headers["Range"]

    if ($range -match "^bytes=(\d*)-(\d*)$") {
        if ($Matches[1]) { $start = [int64]$Matches[1] }
        if ($Matches[2]) { $end = [int64]$Matches[2] }
        if ($end -ge $length) { $end = $length - 1 }
        if ($start -lt 0 -or $start -ge $length -or $end -lt $start) {
            $Response.StatusCode = 416
            $Response.Close()
            return
        }
        $status = 206
    }

    $contentLength = $end - $start + 1
    $Response.StatusCode = $status
    $Response.ContentType = "video/mp4"
    $Response.ContentLength64 = $contentLength
    $Response.Headers.Add("Accept-Ranges", "bytes")
    if ($status -eq 206) {
        $Response.Headers.Add("Content-Range", "bytes $start-$end/$length")
    }

    $stream = [IO.File]::OpenRead($path)
    try {
        [void]$stream.Seek($start, [IO.SeekOrigin]::Begin)
        $buffer = New-Object byte[] 65536
        $remaining = $contentLength
        while ($remaining -gt 0) {
            $readSize = [Math]::Min($buffer.Length, $remaining)
            $read = $stream.Read($buffer, 0, $readSize)
            if ($read -le 0) { break }
            $Response.OutputStream.Write($buffer, 0, $read)
            $remaining -= $read
        }
    }
    finally {
        $stream.Close()
        $Response.Close()
    }
}

function Send-Asset {
    param(
        [System.Net.HttpListenerRequest]$Request,
        [System.Net.HttpListenerResponse]$Response
    )
    $id = $Request.QueryString["id"]
    if (-not $id) {
        Write-ErrorJson $Response "Imagem nao informada." 400
        return
    }

    $path = ConvertFrom-Token $id
    if (-not (Test-PathInside $path $FichaAssetRoot) -or -not (Test-Path -LiteralPath $path)) {
        Write-ErrorJson $Response "Imagem nao encontrada." 404
        return
    }

    $bytes = [IO.File]::ReadAllBytes($path)
    Write-Bytes $Response $bytes (Get-StaticContentType $path)
}

function Handle-Request {
    param([System.Net.HttpListenerContext]$Context)

    $request = $Context.Request
    $response = $Context.Response
    $response.Headers.Add("Cache-Control", "no-store")

    try {
        $path = $request.Url.AbsolutePath
        switch -Regex ($path) {
            "^/api/config$" {
                $videoIndex = Get-VideoIndex
                $accessInfo = Get-AccessInfo
                Write-Json $response ([ordered]@{
                    ok = $true
                    fichaRoot = $FichaRoot
                    videoRoot = $VideoRoot
                    validSheetName = "$RoteiroSheetPrefix *"
                    technicalSheets = @("CAPA", "VARIANTES", "MODELAGEM", "INSUMOS", "ROTEIRO DE PRODUÇÃO", "COMENTARIOS", "ESTILO")
                    videoCount = $videoIndex.count
                    videoIndexAt = if ($script:VideoIndexAt) { $script:VideoIndexAt.ToString("dd/MM/yyyy HH:mm:ss") } else { "" }
                    access = $accessInfo
                })
                return
            }
            "^/api/fichas$" {
                $fichas = Get-Fichas
                Write-Json $response ([ordered]@{ ok = $true; fichas = $fichas; count = $fichas.Count })
                return
            }
            "^/api/ficha$" {
                $id = $request.QueryString["id"]
                if (-not $id) { Write-ErrorJson $response "Ficha nao informada." 400; return }
                $filePath = ConvertFrom-Token $id
                $ficha = Read-Ficha $filePath
                Write-Json $response ([ordered]@{ ok = $true; ficha = $ficha })
                return
            }
            "^/api/refresh$" {
                $script:VideoIndex = $null
                $script:VideoIndexAt = $null
                $script:FichaCache = $null
                $script:FichaCacheAt = $null
                $videoIndex = Get-VideoIndex
                $fichas = Get-Fichas
                Write-Json $response ([ordered]@{ ok = $true; fichas = $fichas; videoCount = $videoIndex.count })
                return
            }
            "^/video$" {
                Send-Video $request $response
                return
            }
            "^/asset$" {
                Send-Asset $request $response
                return
            }
            default {
                Send-StaticFile $request $response
                return
            }
        }
    }
    catch {
        try {
            Write-ErrorJson $response $_.Exception.Message 500
        }
        catch {
            try { $response.Abort() } catch {}
        }
    }
}

if (-not (Test-Path -LiteralPath $PublicRoot)) {
    throw "Pasta public nao encontrada: $PublicRoot"
}

$listenerHost = $HostName
if ($listenerHost -eq "*") { $listenerHost = "+" }
$prefix = "http://$listenerHost`:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    $script:ListenerPrefix = $prefix
    $script:NetworkAccessEnabled = $listenerHost -in @("+", "*") -or $listenerHost -notin @("localhost", "127.0.0.1")
}
catch {
    if ($listenerHost -ne "localhost") {
        $script:NetworkAccessWarning = "Nao foi possivel iniciar em $prefix. Iniciado apenas em localhost. Para rede externa, libere URLACL/firewall ou use um tunel seguro."
        $listener = [System.Net.HttpListener]::new()
        $prefix = "http://localhost`:$Port/"
        $listener.Prefixes.Add($prefix)
        $listener.Start()
        $script:ListenerPrefix = $prefix
        $script:NetworkAccessEnabled = $false
    }
    else {
        throw
    }
}

$accessInfo = Get-AccessInfo

Write-Host ""
Write-Host "Aplicativo iniciado."
Write-Host "Local: $($accessInfo.localUrl)"
foreach ($url in $accessInfo.networkUrls) {
    Write-Host "Celular na rede da empresa: $url"
}
if ($accessInfo.networkUrls.Count -eq 0) {
    Write-Host "Celular na rede da empresa: indisponivel nesta inicializacao."
}
if ($script:NetworkAccessWarning) {
    Write-Warning $script:NetworkAccessWarning
}
Write-Host "Fora da empresa: use VPN, tunel seguro ou publicacao HTTPS apontando para este servidor."
Write-Host "Fichas: $FichaRoot"
Write-Host "Videos: $VideoRoot"
Write-Host "Aba obrigatoria: $RoteiroSheetPrefix *"
Write-Host "Pressione Ctrl+C para encerrar."
Write-Host ""

try {
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            Handle-Request $context
        }
        catch {
            Write-Warning ("Falha ao atender requisicao: " + $_.Exception.Message)
            if ($context -and $context.Response) {
                try { $context.Response.Abort() } catch {}
            }
        }
    }
}
finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
}
