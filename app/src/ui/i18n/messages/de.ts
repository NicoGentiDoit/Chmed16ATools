/**
 * German UI dictionary.
 *
 * Complete translation of the English source key set: phases 3-5 swept the three
 * panels and their components, phase 6 the shell, shared-component, guided-task
 * and JSON-viewer keys. No entry is a placeholder copy of `en` any more; only
 * acronyms, spec terms and strings that are genuinely the same in German stay
 * identical. The key set must stay identical to `en` (phase 10 asserts it
 * fail-closed).
 */

import type { MessageKey, Messages } from './en';

export const de: Messages = {
  appTitle: 'CHMED16A Tools',
  appDescription:
    'CHMED16A-Dokumente vollständig im Browser validieren, kodieren, dekodieren, erzeugen und scannen.',
  disclaimer:
    'Nur ein Entwicklungs- und Testwerkzeug — kein zertifiziertes Medizinprodukt, nicht für den klinischen Einsatz. Ihre Daten verlassen diesen Browser nie.',

  tablistLabel: 'Werkzeugmodus',
  tabJsonToChmed: 'JSON → CHMED16A',
  tabChmedToJson: 'CHMED16A → JSON',
  tabPdfToChmed: 'PDF → CHMED16A',

  jsonInputLabel: 'CHMED16A-JSON-Dokument',
  jsonInputHint:
    'Ein CHMED16A-Verordnungsdokument einfügen oder eingeben. Es wird nichts an einen Server gesendet.',
  validateJson: 'JSON validieren',
  encodeToChmed: 'In CHMED16A kodieren',

  validationHeading: 'Validierungsergebnisse',
  resultsHeading: 'Dekodier- und Validierungsergebnisse',
  errorsLabel: 'Fehler',
  warningsLabel: 'Warnungen',
  noFindings: 'Keine Probleme gefunden.',
  notValidated: 'Noch nicht geprüft.',
  emptyInput: 'Zuerst ein Dokument eingeben.',
  analysisFailed: 'Das Dokument konnte nicht analysiert werden.',
  clear: 'Leeren',
  clearInputAccessibleName: 'Eingabedokument leeren',
  clearOutputAccessibleName: 'Ausgabeergebnis leeren',

  chmedOutputHeading: 'Kodierte CHMED16A-Zeichenkette',
  chmedOutputLabel: 'CHMED16A-Zeichenkette',
  chmedOutputHint: 'Nur-Lese-Ergebnis. Zum Weiterverwenden kopieren oder herunterladen.',
  copy: 'Kopieren',
  copyChmedAccessibleName: 'Kodierte CHMED16A-Zeichenkette kopieren',
  download: 'Herunterladen',
  downloadChmedAccessibleName: 'Kodierte CHMED16A-Zeichenkette als .txt-Datei herunterladen',
  downloadPng: 'PNG herunterladen',
  downloadPngAccessibleName: 'QR-Code als PNG-Bild herunterladen',
  copied: 'In die Zwischenablage kopiert.',
  copyFailed: 'Zwischenablage nicht verfügbar. Text markieren und manuell kopieren.',
  chmedFilename: 'chmed16a.txt',
  jsonFilename: 'chmed16a.json',
  qrFilename: 'chmed16a-qr.png',

  qrHeading: 'QR-Code',
  qrEcLabel: 'Fehlerkorrekturstufe des QR-Codes',
  qrEcHint: 'Höhere Stufen überstehen mehr Beschädigung, halten aber weniger Daten. Standard: M.',
  qrAriaLabel: 'CHMED16A-QR-Code, Fehlerkorrekturstufe {level}',
  qrInfo: 'Version {version} · {bytes} UTF-8-Bytes',
  qrOverflow:
    'Das Dokument passt bei Fehlerkorrekturstufe {level} nicht in einen QR-Code ({bytes} UTF-8-Bytes). Eine niedrigere Stufe wählen oder das Dokument kürzen.',
  qrEmpty: 'Dokument kodieren, um den QR-Code anzuzeigen.',
  qrPngFailed:
    'Der QR-Code konnte nicht als PNG-Bild exportiert werden. Erneut versuchen oder einen Screenshot der Vorschau erstellen.',

  chmedInputLabel: 'CHMED16A-Dokument',
  chmedInputHint:
    'Komprimierte (CHMED16A1…) und unkomprimierte (CHMED16A0…) Dokumente werden beide akzeptiert.',
  decodeToJson: 'In JSON dekodieren',

  scanHeading: 'QR-Code scannen',
  scanFileLabel: 'QR-Code-Bilddatei',
  scanFileHint:
    'PNG, JPEG oder ein beliebiges Bild, das der Browser lesen kann. Das Hochladen funktioniert immer; die Kamera ist optional.',
  scanNoQr: 'In diesem Bild wurde kein QR-Code gefunden. Ein schärferes, näheres Foto versuchen.',
  scanImageFailed: 'Das Bild konnte nicht gelesen werden. Eine PNG- oder JPEG-Datei wählen.',
  scanSuccess: 'QR-Code gelesen.',
  cameraStart: 'Kamera starten',
  cameraStop: 'Kamera stoppen',
  cameraPreview: 'Kameravorschau',
  cameraPermissionHint:
    'Die Kamera startet nur beim Drücken von „Kamera starten“ und stoppt beim Verlassen dieses Tabs.',
  cameraUnavailable:
    'Kamera nicht verfügbar. Browserberechtigung und angeschlossene Kamera prüfen — oder stattdessen ein Bild hochladen.',

  jsonOutputHeading: 'Dekodiertes JSON',
  jsonOutputLabel: 'Dekodiertes JSON-Dokument',
  jsonOutputHint: 'Schreibgeschütztes, formatiertes JSON.',
  copyJsonAccessibleName: 'Dekodiertes JSON-Dokument kopieren',
  downloadJsonAccessibleName: 'Dekodiertes JSON-Dokument als .json-Datei herunterladen',

  pdfFileLabel: 'eMediplan-PDF-Dokument',
  pdfFileHint:
    'Gedrucktes eMediplan-Papierlayout. Textbasierte PDFs werden direkt gelesen; gescannte PDFs werden offline Seite für Seite erkannt.',
  pdfProcess: 'PDF verarbeiten',
  pdfIdle: 'PDF-Datei auswählen, um die eVerordnung daraus zu extrahieren.',
  pdfProcessing:
    'PDF wird gelesen. Gescannte Dokumente werden offline erkannt und können eine Weile dauern.',
  pdfSuccess: 'Verordnung aus {pages} Seite(n) extrahiert.',
  pdfFindingsHeading: 'Extraktionsergebnisse',
  pdfSuccessTextLayer: 'Text direkt aus der Textebene des PDFs gelesen ({pages} Seite(n)).',
  pdfSuccessOcr: 'Text aus {pages} gescannten Seite(n) mit Offline-OCR erkannt.',
  pdfSuccessValidated: 'Die extrahierte Verordnung ist gültig und wurde erfolgreich kodiert.',
  pdfStageExtract: 'Das PDF konnte nicht gelesen werden.',
  pdfStageOcr: 'Die gescannten Seiten konnten nicht erkannt werden.',
  pdfStageParse: 'Im Text wurde keine eMediplan-Verordnung gefunden.',
  pdfStageParseValues:
    'Das eMediplan-Layout wurde erkannt, aber einige gedruckte Werte waren nicht lesbar; Fehler prüfen.',
  pdfStageValidate: 'Die extrahierte Verordnung ist nicht gültig.',
  pdfStageEncode: 'Die Verordnung konnte nicht kodiert werden.',
  pdfUnexpected: 'Das PDF konnte nicht verarbeitet werden.',
  pdfReadFailed: 'Die ausgewählte Datei konnte nicht gelesen werden.',
  pdfFileTooLarge:
    'Das ausgewählte PDF ist größer als 25 MB. Eine kleinere Datei wählen.',
  pdfJsonOutputHeading: 'JSON der extrahierten eVerordnung',
  pdfJsonOutputLabel: 'eVerordnung JSON',
  pdfDraftHeading: 'Entwurf des eVerordnung-JSON (nicht kodiert)',
  pdfDraftHint:
    'Entwurf — die analysierte Verordnung wird zur Prüfung angezeigt; die aufgeführten Fehler beheben, um die CHMED16A-Ausgabe zu ermöglichen.',
  pdfDraftStatus: 'Nur Entwurf: die extrahierte Verordnung ist nicht gültig, daher wurde keine CHMED16A-Ausgabe erzeugt.',
  pdfQrEmpty: 'Eine Verordnung extrahieren, um den QR-Code zu sehen.',

  /* ── icon accessible names (for aria-label on button wrappers) ── */
  iconCheckLabel: 'Erfolg',
  iconAlertLabel: 'Warnung',
  iconXLabel: 'Fehler',
  iconEyeLabel: 'Anzeigen',
  iconEyeOffLabel: 'Ausblenden',
  iconDownloadLabel: 'Herunterladen',
  iconCopyLabel: 'Kopieren',
  iconCameraLabel: 'Kamera',
  iconUploadLabel: 'Datei hochladen',
  iconQrLabel: 'QR-Code',

  /* ── workbench shell: brand, skip link, home (appended in phase 2) ── */
  workbenchSubtitle: 'Schweizer Therapiepläne konvertieren und validieren',
  skipToContent: 'Zum Inhalt springen',
  versionBadge: 'v{version}',
  homeHeading: 'Ablauf auswählen',
  homeCardJsonDescription:
    'Ein CHMED16A-JSON-Dokument einfügen oder eingeben, validieren und mit seinem QR-Code in eine CHMED16A-Zeichenkette kodieren.',
  homeCardJsonBadge: 'JSON',
  homeCardChmedDescription:
    'Eine komprimierte oder unkomprimierte CHMED16A-Zeichenkette dekodieren oder ihren QR-Code scannen — zurück zu lesbarem JSON.',
  homeCardChmedBadge: 'CHMED16A',
  homeCardPdfDescription:
    'Eine eVerordnung aus einem gedruckten eMediplan-PDF extrahieren. Gescannte Seiten werden offline erkannt.',
  homeCardPdfBadge: 'PDF',
  openFlowLabel: '{flow} öffnen',

  /* ── phase 4b: three-level findings, distinct PDF output clears (append-only) ── */
  infoLabel: 'Info',
  clearJsonOutputAccessibleName: 'Die extrahierte JSON-Ausgabe leeren',
  clearChmedOutputAccessibleName: 'Die kodierte CHMED16A-Zeichenkette leeren',

  /* ── phase 5: JSON input drop zone (append-only) ── */
  jsonInputDragHint: 'Eine .json- oder .txt-Datei kann hier ebenfalls abgelegt werden; ihr Text ersetzt den Feldinhalt.',
  dropFileUnsupported: '"{name}" ist keine .json- oder .txt-Textdatei. Es wurde nichts geladen.',
  dropFileTooLarge: '"{name}" ist größer als 1 MiB. Es wurde nichts geladen.',
  dropMultipleFiles: 'Bitte jeweils nur eine Datei ablegen. "{name}" wurde nicht geladen.',
  dropReadFailed: 'Die abgelegte Datei konnte nicht gelesen werden. Es wurde nichts geladen.',

  /* ── phase 6: CHMED16A → JSON structured view (append-only) ── */
  jsonViewGroupLabel: 'Ausgabeansicht',
  jsonViewStructured: 'Strukturiert',
  jsonViewRaw: 'Rohes JSON',
  jsonDocumentSection: 'Dokument',
  jsonSectionItem: '{count} Eintrag',
  jsonSectionItems: '{count} Einträge',
  jsonSectionKey: '{count} Schlüssel',
  jsonSectionKeys: '{count} Schlüssel',
  jsonSectionEmpty: 'leer',
  jsonTypeString: 'Zeichenkette',
  jsonTypeNumber: 'Zahl',
  jsonTypeBoolean: 'Wahrheitswert',
  jsonTypeNull: 'null',
  jsonTypeUnknown: 'Wert',

  /* ── phase 7a: PDF steps + first-page preview (append-only) ── */
  pdfStepIndicatorLabel: 'PDF-Verarbeitungsschritte',
  pdfStepOf: 'Schritt {current} von 3',
  pdfStep1Label: 'Hochladen',
  pdfStep2Label: 'Prüfung',
  pdfStep3Label: 'Export',
  pdfPreviewHeading: 'Vorschau der ersten Seite',
  pdfPreviewAriaLabel: 'Erste Seite des ausgewählten PDFs',
  pdfPreviewFailed: 'Die erste Seite konnte nicht angezeigt werden. Die Verarbeitung ist davon nicht betroffen.',

  /* ── phase 7b: read-only review table (append-only) ── */
  pdfReviewCaption: 'Extrahierte {section} prüfen',
  pdfReviewFieldHeader: 'Feld',
  pdfReviewValueHeader: 'Wert',
  pdfReviewStatusHeader: 'Status',
  pdfReviewPositionHeader: 'Pos',
  pdfReviewIdHeader: 'Id / GTIN',
  pdfReviewUnitHeader: 'Einheit',
  pdfReviewInstructionsHeader: 'Anwendungshinweise',
  statusRecognized: 'Erkannt',
  statusToVerify: 'Zu prüfen',
  statusAbsent: 'Nicht vorhanden',
  reviewValuePlaceholder: '—',

  /* ── phase 7c: inline editing of the review table (append-only) ── */
  reviewEditableHint:
    'Einen Wert ändern und das Feld verlassen: Die Verordnung wird erneut geprüft, und die CHMED16A-Ausgabe folgt dem Ergebnis.',
  reviewCellAriaLabel: '{field} ({row}) bearbeiten',
  reviewMedicamentRow: 'Medikament {position}',
  reviewInvalidEdit: 'Die geänderte Verordnung konnte nicht geprüft werden, daher wurde nichts kodiert.',

  /* ── phase 7d: export recap at step 3 (append-only) ── */
  exportRecapHeading: 'Exportübersicht',
  recapPatientLabel: 'Patient',
  recapPrescriberLabel: 'Verordner / Organisation',
  recapMedicamentsLabel: 'Medikamente',
  recapExtractionLabel: 'Extraktion',
  recapEditsLabel: 'Änderungen',
  recapPatientBorn: '{name} · geboren am {date}',
  recapEdited: 'Geändert',
  recapValid: 'Gültig ({warnings} Warnungen)',
  recapBlocked: 'Blockiert: {errors} Fehler, {warnings} Warnungen',

  /* ── phase 8a: guided tasks, required counter, recap shortcuts (append-only) ── */
  taskHeading: 'Erforderliche Aktionen',
  taskAddRequired: '{field} hinzufügen',
  taskGoToField: 'Zum Feld {field}',
  taskFieldFallback: 'Feld',
  technicalDetailsLabel: 'Technische Details',
  reviewRequiredCount: '{done} von {total} Pflichtfeldern ausgefüllt',
  reviewRequiredBlocked: 'Export weiterhin blockiert: {n} blockierende Probleme',
  recapFixField: '{section}-Daten korrigieren',

  /* ── phase 8b: advisory inline hints under editable fields (append-only) ── */
  advisoryGlnHint: 'Die GLN muss eine 13-stellige Zahl sein — der Validator bestätigt dies beim Speichern.',
  advisoryDateFormatHint: 'Das Format YYYY-MM-DD verwenden.',
  advisoryRequiredHint: 'Pflichtfeld — der Validator führt es unter Erforderliche Aktionen auf.',

  /* ── phase 8c: structured JSON missing-required marks (append-only) ── */
  jsonMissingRequired: 'fehlende Pflichteigenschaften',

  /* ── phase 8d: honest section-level labels for unrendered required keys (append-only) ── */
  taskGoToSectionData: 'Zu den {section}-Daten',
  taskAddSectionData: '{section}-Daten hinzufügen',

  /* ── i18n phase 2: header language selector (append-only) ── */
  uiLanguageLabel: 'Sprache',

  /* ── i18n phase 5: PDF panel + review table labels (append-only) ── */
  pdfReviewSectionHeading: 'Verordnungsdaten',
  pdfReviewSectionSummary: 'Patientendaten',
  pdfReviewSectionMedicaments: 'Medikamente',
  pdfReviewFieldLanguage: 'Sprache',
  pdfReviewFieldFirstName: 'Vorname',
  pdfReviewFieldLastName: 'Nachname',
  pdfReviewFieldBirthdate: 'Geburtsdatum',
  pdfReviewFieldGender: 'Geschlecht (1 = männlich, 2 = weiblich)',
  recapFixSectionPatient: 'Patient',

  /* ── i18n phase 6: guided-task field nouns, resolved per locale (append-only) ── */
  taskFieldPatient: 'Patient',
  taskFieldMedicaments: 'Medikament',
  taskFieldFName: 'Vorname',
  taskFieldLName: 'Nachname',
  taskFieldBDt: 'Geburtsdatum',
  taskFieldGln: 'GLN',
  taskFieldName: 'Name',
  taskFieldId: 'Medikament-Id',

  /* ── i18n phase 7: dynamische Core-Meldungen (append-only) ── */
  // Bewusst ohne ß, damit de-CH keine Delta-Einträge braucht.
  coreDecodeUnknownYear:
    'ReleaseYear {year} ist in ChTransmissionFormat nicht definiert; nur 16 wird unterstützt.',
  coreDecodeBadPrefix:
    'Erwartet wird ein CHMED16-Dokument: "CHMED16", ein Subversionsbuchstabe und die Kompressionsziffer 0 oder 1.',
  coreDecodeBadCompression:
    'Die Kompression muss die Ziffer 0 oder 1 direkt nach der Subversion sein.',
  coreDecodeBadBase64:
    'Die Nutzlast ist kein gültiges Standard-Base64: erlaubt sind nur A-Z, a-z, 0-9, "+", "/" und höchstens zwei "=" am Ende.',
  coreDecodeBadGzip: 'Die komprimierte Nutzlast konnte nicht entpackt werden: {reason}',
  coreDecodeBadJsonUtf8:
    'Die entpackten Daten sind kein gültiges UTF-8 und können daher kein JSON-Dokument sein.',
  corePdfNotPdf: 'Die ausgewählte Datei ist kein PDF-Dokument.',
  corePdfPassword: 'Das PDF ist passwortgeschützt.',
  corePdfUnreadable:
    'Das PDF konnte nicht gelesen werden. Es ist möglicherweise beschädigt oder verwendet ein nicht unterstütztes Layout.',
  corePdfTooManyPages: 'Das PDF hat mehr Seiten, als dieses Werkzeug lesen kann.',
  corePdfTooManyItems: 'Die PDF-Seite enthält zu viele Textelemente zum Lesen.',
  corePdfTooMuchText: 'Das PDF enthält zu viel Text zum Lesen.',
  corePdfUnexpected: 'Das PDF konnte nicht verarbeitet werden.',
  corePdfRenderFailed: 'Das PDF konnte nicht gerendert werden.',
  corePdfOcrFailed:
    'Die Texterkennung der gescannten Seiten konnte nicht abgeschlossen werden.',
  coreOcrLowConfidence:
    'Der Text wurde von einer gescannten Seite erkannt; prüfen Sie jeden Wert, bevor Sie die Verordnung verwenden.',

  /* ── i18n Phase 8: dynamische Meldungen aus prescription-parse (nur Ergänzungen) ── */
  // Der Parser liefert diese Meldungen als `detail`-Untercodes; die Werte für
  // `{value}`/`{unit}`/`{reason}` sind die auf dem Dokument gedruckten Werte.
  coreParseEmptyText: 'Der Text ist leer; es wurde kein eMediplan-Papierlayout gefunden.',
  coreParseNoLayout:
    'Es wurde keine Spaltenüberschrift für Medikamente ("Medication", "Morning", ...) gefunden; der Text ist kein gedrucktes eMediplan-Papierlayout.',
  coreParseBadStartDate:
    'Das Startdatum "{value}" konnte nicht gelesen werden; erwartet wird DD.MM.YYYY.',
  coreParseBadEndDate:
    'Das Enddatum "{value}" konnte nicht gelesen werden; erwartet wird DD.MM.YYYY.',
  coreParseBadDose:
    'Die Dosis "{value}" konnte nicht gelesen werden; erwartet wird eine Zahl oder eines von ½, 1/3, ¼, 2/3, ¾, 1/8.',
  coreParseBadBirthDate:
    'Das Geburtsdatum "{value}" konnte nicht gelesen werden; erwartet wird DD.MM.YYYY.',
  coreParseMissingFirstName: 'Der Patientblock enthält keinen Vornamen.',
  coreParseMissingLastName: 'Der Patientblock enthält keinen Nachnamen.',
  coreParseMissingBirthDate:
    'Der Patientblock enthält kein Geburtsdatum ("Born on:").',
  coreParseNoRows: 'Unter der Spaltenüberschrift wurde keine Medikamentenzeile gefunden.',
  coreParseMissingIssueDate:
    'Das Dokument enthält kein lesbares Ausstellungsdatum ("Issue date:").',
  coreParseIncomplete: 'Die Verordnung ist unvollständig.',
  coreParseNoCrypto:
    'Es kann keine Verordnungs-ID erzeugt werden: Dieser Browser bietet weder crypto.randomUUID noch crypto.getRandomValues.',
  coreParseUnreadableText: 'Der eMediplan-Text konnte nicht gelesen werden: {reason}',
  coreParseMissingWeight:
    'Die gedruckte Größen-/Gewichtszeile enthält keinen lesbaren Gewichtswert; er wird weggelassen, statt erfunden zu werden.',
  coreParseMissingHeight:
    'Die gedruckte Größen-/Gewichtszeile enthält keinen lesbaren Größenwert; er wird weggelassen, statt erfunden zu werden.',
  coreParseRenalUnknown:
    'Die gedruckte Nierenstufe "{value}" entspricht keiner Stufe aus chmed16a/README.md:819-848; es wurde kein Risikoeintrag erfunden.',
  coreParseDiabetesUnknown:
    'Der gedruckte Diabetesstatus "{value}" ist keiner der spezifizierten Typen (779 = Typ 1, 780 = Typ 2, chmed16a/README.md:911-922); es wurde kein Risikoeintrag erfunden.',
  coreParseDiabetesUnmatched:
    'Der gedruckte Diabetesstatus "{value}" entspricht keinem spezifizierten Typ (779/780, chmed16a/README.md:911-922); es wurde kein Risikoeintrag erfunden.',
  coreParseAllergyUnknown:
    'Die gedruckte Allergie "{value}" hat keine Übereinstimmung in den Allergie-IDs des Repositories (externe CDSCODE-Liste, chmed16a/README.md:809,906); sie wurde weggelassen.',
  coreParseUnitUnknown:
    'Die gedruckte Einheit "{value}" steht nicht im Einheitenverzeichnis; sie wird unverändert übernommen.',
  coreParseUnitLeak:
    'Die gedruckte Einheit "{value}" enthält Text nach der erkannten Einheit; nur "{unit}" wird übernommen.',
  coreParseMissingStartDate:
    'Für diese Medikamentenzeile wurde kein gedrucktes Startdatum ("Von") gefunden; "DtFrom" behält den erforderlichen leeren Platzhalter.',
  coreParseRouteUndetermined:
    'Aus dem gedruckten Text konnte keine Verabreichungsart abgeleitet werden; "Roa" wird weggelassen.',
  coreParseAnnotationDesync:
    'Die Zeilengeometrie der Link-Annotationen und die analysierten Medikamentenzeilen entsprechen sich nicht eins zu eins; Produkt-IDs (IdType 4) wurden verworfen und die Identitäten aus dem gedruckten Text beibehalten.',
  coreParseLanguageUndetected:
    'Das gedruckte Vokabular entspricht keiner Sprache, die dieser Parser abbildet; "Lng" behält den erforderlichen leeren Platzhalter (die Erkennung von Französisch und Italienisch ist auf den i18n-Plan verschoben).',
} satisfies Record<MessageKey, string>;
