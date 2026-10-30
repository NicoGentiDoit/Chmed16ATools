/**
 * Italian UI dictionary.
 *
 * Complete translation of the English source key set: phases 3-5 swept the three
 * panels and their components, phase 6 the shell, shared-component, guided-task
 * and JSON-viewer keys. No entry is a placeholder copy of `en` any more; only
 * acronyms, spec terms and strings that are genuinely the same in Italian stay
 * identical. The key set must stay identical to `en` (phase 10 asserts it
 * fail-closed).
 */

import type { MessageKey, Messages } from './en';

export const it: Messages = {
  appTitle: 'CHMED16A Tools',
  appDescription:
    'Valida, codifica, decodifica, genera e scansiona documenti CHMED16A interamente nel browser.',
  disclaimer:
    'Solo strumento di sviluppo e test — non è un dispositivo medico certificato, non destinato all’uso clinico. I dati non lasciano mai questo browser.',

  tablistLabel: 'Modalità strumento',
  tabJsonToChmed: 'JSON → CHMED16A',
  tabChmedToJson: 'CHMED16A → JSON',
  tabPdfToChmed: 'PDF → CHMED16A',

  jsonInputLabel: 'Documento JSON CHMED16A',
  jsonInputHint:
    'Incollare o digitare un documento di prescrizione CHMED16A. Nulla viene inviato a un server.',
  validateJson: 'Valida JSON',
  encodeToChmed: 'Codifica in CHMED16A',

  validationHeading: 'Risultati della validazione',
  resultsHeading: 'Risultati di decodifica e validazione',
  errorsLabel: 'Errori',
  warningsLabel: 'Avvisi',
  noFindings: 'Nessun problema rilevato.',
  notValidated: 'Non ancora verificato.',
  emptyInput: 'Inserire prima un documento.',
  analysisFailed: 'Impossibile analizzare il documento.',
  clear: 'Svuota',
  clearInputAccessibleName: 'Svuota il documento di input',
  clearOutputAccessibleName: 'Svuota il risultato di output',

  chmedOutputHeading: 'Stringa CHMED16A codificata',
  chmedOutputLabel: 'Stringa CHMED16A',
  chmedOutputHint: 'Risultato in sola lettura. Per riutilizzarlo, usare Copia o Scarica.',
  copy: 'Copia',
  copyChmedAccessibleName: 'Copia la stringa CHMED16A codificata',
  download: 'Scarica',
  downloadChmedAccessibleName: 'Scarica la stringa CHMED16A codificata come file .txt',
  downloadPng: 'Scarica PNG',
  downloadPngAccessibleName: 'Scarica il codice QR come immagine PNG',
  copied: 'Copiato negli appunti.',
  copyFailed: 'Appunti non disponibili. Selezionare il testo e copiarlo manualmente.',
  chmedFilename: 'chmed16a.txt',
  jsonFilename: 'chmed16a.json',
  qrFilename: 'chmed16a-qr.png',

  qrHeading: 'Codice QR',
  qrEcLabel: 'Livello di correzione degli errori del codice QR',
  qrEcHint: 'Livelli più alti resistono a più danni ma contengono meno dati. Predefinito: M.',
  qrAriaLabel: 'Codice QR CHMED16A, livello di correzione degli errori {level}',
  qrInfo: 'Versione {version} · {bytes} byte UTF-8',
  qrOverflow:
    'Il documento non entra in un codice QR con livello di correzione degli errori {level} ({bytes} byte UTF-8). Scegliere un livello più basso o accorciare il documento.',
  qrEmpty: 'Codificare un documento per visualizzarne il codice QR.',
  qrPngFailed:
    "Impossibile esportare il codice QR come immagine PNG. Riprovare o acquisire uno screenshot dell'anteprima.",

  chmedInputLabel: 'Documento CHMED16A',
  chmedInputHint:
    'Sono accettati sia i documenti compressi (CHMED16A1…) sia quelli non compressi (CHMED16A0…).',
  decodeToJson: 'Decodifica in JSON',

  scanHeading: 'Scansiona un codice QR',
  scanFileLabel: 'File immagine con codice QR',
  scanFileHint:
    'PNG, JPEG o qualsiasi immagine il browser riesca a leggere. Il caricamento funziona sempre; la fotocamera è opzionale.',
  scanNoQr: 'Nessun codice QR trovato in questa immagine. Provare con una foto più nitida e ravvicinata.',
  scanImageFailed: "Impossibile leggere l'immagine. Scegliere un file PNG o JPEG.",
  scanSuccess: 'Codice QR letto.',
  cameraStart: 'Avvia fotocamera',
  cameraStop: 'Ferma fotocamera',
  cameraPreview: 'Anteprima fotocamera',
  cameraPermissionHint:
    'La fotocamera si avvia solo premendo Avvia fotocamera e si arresta quando si lascia questa scheda.',
  cameraUnavailable:
    "Fotocamera non disponibile. Verificare i permessi del browser e che sia collegata una fotocamera — oppure usare il caricamento di un'immagine.",

  jsonOutputHeading: 'JSON decodificato',
  jsonOutputLabel: 'Documento JSON decodificato',
  jsonOutputHint: 'JSON in sola lettura, formattato.',
  copyJsonAccessibleName: 'Copia il documento JSON decodificato',
  downloadJsonAccessibleName: 'Scarica il documento JSON decodificato come file .json',

  pdfFileLabel: 'Documento PDF eMediplan',
  pdfFileHint:
    'Layout cartaceo eMediplan stampato. I PDF con testo vengono letti direttamente; i PDF scansionati vengono riconosciuti offline, pagina per pagina.',
  pdfProcess: 'Elabora PDF',
  pdfIdle: 'Scegliere un file PDF per estrarne la prescrizione elettronica.',
  pdfProcessing:
    'Lettura del PDF. I documenti scansionati vengono riconosciuti offline e possono richiedere tempo.',
  pdfSuccess: 'Prescrizione estratta da {pages} pagina/e.',
  pdfFindingsHeading: "Risultati dell'estrazione",
  pdfSuccessTextLayer: 'Testo letto direttamente dal livello testo del PDF ({pages} pagina/e).',
  pdfSuccessOcr: 'Testo riconosciuto da {pages} pagina/e scansionata/e con OCR offline.',
  pdfSuccessValidated: 'La prescrizione estratta è valida ed è stata codificata correttamente.',
  pdfStageExtract: 'Impossibile leggere il PDF.',
  pdfStageOcr: 'Impossibile riconoscere le pagine scansionate.',
  pdfStageParse: 'Nel testo non è stata trovata alcuna prescrizione eMediplan.',
  pdfStageParseValues:
    'Il layout eMediplan è stato riconosciuto, ma alcuni valori stampati non sono stati leggibili; controllare gli errori.',
  pdfStageValidate: 'La prescrizione estratta non è valida.',
  pdfStageEncode: 'Impossibile codificare la prescrizione.',
  pdfUnexpected: 'Impossibile elaborare il PDF.',
  pdfReadFailed: 'Impossibile leggere il file selezionato.',
  pdfFileTooLarge:
    'Il PDF selezionato supera 25 MB. Scegliere un file più piccolo.',
  pdfJsonOutputHeading: 'JSON della prescrizione elettronica estratta',
  pdfJsonOutputLabel: 'JSON della prescrizione elettronica',
  pdfDraftHeading: 'Bozza del JSON della prescrizione elettronica (non codificata)',
  pdfDraftHint:
    'Bozza — la prescrizione analizzata è mostrata per la verifica; correggere gli errori elencati per abilitare l\u2019output CHMED16A.',
  pdfDraftStatus: 'Solo bozza: la prescrizione estratta non è valida, quindi non è stato prodotto alcun output CHMED16A.',
  pdfQrEmpty: 'Estrarre una prescrizione per visualizzarne il codice QR.',

  /* ── icon accessible names (for aria-label on button wrappers) ── */
  iconCheckLabel: 'Successo',
  iconAlertLabel: 'Avviso',
  iconXLabel: 'Errore',
  iconEyeLabel: 'Mostra',
  iconEyeOffLabel: 'Nascondi',
  iconDownloadLabel: 'Scarica',
  iconCopyLabel: 'Copia',
  iconCameraLabel: 'Fotocamera',
  iconUploadLabel: 'Carica file',
  iconQrLabel: 'Codice QR',

  /* ── workbench shell: brand, skip link, home (appended in phase 2) ── */
  workbenchSubtitle: 'Converti e valida piani terapeutici svizzeri',
  skipToContent: 'Vai al contenuto',
  versionBadge: 'v{version}',
  homeHeading: 'Scegli un flusso',
  homeCardJsonDescription:
    'Incolla o digita un documento JSON CHMED16A, validalo e codificalo in una stringa CHMED16A con il relativo codice QR.',
  homeCardJsonBadge: 'JSON',
  homeCardChmedDescription:
    'Decodifica una stringa CHMED16A compressa o non compressa, oppure scansiona il suo codice QR, per tornare a un JSON leggibile.',
  homeCardChmedBadge: 'CHMED16A',
  homeCardPdfDescription:
    'Estrai una prescrizione elettronica da un PDF eMediplan stampato. Le pagine scansionate vengono riconosciute offline.',
  homeCardPdfBadge: 'PDF',
  openFlowLabel: 'Apri {flow}',

  /* ── phase 4b: three-level findings, distinct PDF output clears (append-only) ── */
  infoLabel: 'Info',
  clearJsonOutputAccessibleName: "Svuota l'output JSON estratto",
  clearChmedOutputAccessibleName: 'Svuota la stringa CHMED16A codificata',

  /* ── phase 5: JSON input drop zone (append-only) ── */
  jsonInputDragHint: 'È anche possibile trascinare qui un file .json o .txt; il suo testo sostituisce il contenuto del campo.',
  dropFileUnsupported: '"{name}" non è un file di testo .json o .txt. Non è stato caricato nulla.',
  dropFileTooLarge: '"{name}" supera 1 MiB. Non è stato caricato nulla.',
  dropMultipleFiles: 'Trascinare un file alla volta. "{name}" non è stato caricato.',
  dropReadFailed: 'Impossibile leggere il file trascinato. Non è stato caricato nulla.',

  /* ── phase 6: CHMED16A → JSON structured view (append-only) ── */
  jsonViewGroupLabel: 'Vista di output',
  jsonViewStructured: 'Strutturata',
  jsonViewRaw: 'JSON grezzo',
  jsonDocumentSection: 'Documento',
  jsonSectionItem: '{count} elemento',
  jsonSectionItems: '{count} elementi',
  jsonSectionKey: '{count} chiave',
  jsonSectionKeys: '{count} chiavi',
  jsonSectionEmpty: 'vuoto',
  jsonTypeString: 'stringa',
  jsonTypeNumber: 'numero',
  jsonTypeBoolean: 'booleano',
  jsonTypeNull: 'null',
  jsonTypeUnknown: 'valore',

  /* ── phase 7a: PDF steps + first-page preview (append-only) ── */
  pdfStepIndicatorLabel: 'Passaggi di elaborazione del PDF',
  pdfStepOf: 'Passaggio {current} di 3',
  pdfStep1Label: 'Caricamento',
  pdfStep2Label: 'Verifica',
  pdfStep3Label: 'Esportazione',
  pdfPreviewHeading: 'Anteprima della prima pagina',
  pdfPreviewAriaLabel: 'Prima pagina del PDF selezionato',
  pdfPreviewFailed: "Impossibile mostrare l'anteprima della prima pagina. L'elaborazione non è interessata.",

  /* ── phase 7b: read-only review table (append-only) ── */
  pdfReviewCaption: 'Controllo dei {section} estratti',
  pdfReviewFieldHeader: 'Campo',
  pdfReviewValueHeader: 'Valore',
  pdfReviewStatusHeader: 'Stato',
  pdfReviewPositionHeader: 'Pos',
  pdfReviewIdHeader: 'Id / GTIN',
  pdfReviewUnitHeader: 'Unità',
  pdfReviewInstructionsHeader: 'Istruzioni',
  statusRecognized: 'Riconosciuto',
  statusToVerify: 'Da verificare',
  statusAbsent: 'Assente',
  reviewValuePlaceholder: '—',

  /* ── phase 7c: inline editing of the review table (append-only) ── */
  reviewEditableHint:
    'Modificare un valore, poi uscire dal campo: la prescrizione viene verificata di nuovo e l’output CHMED16A segue il risultato.',
  reviewCellAriaLabel: 'Modifica {field} ({row})',
  reviewMedicamentRow: 'Farmaco {position}',
  reviewInvalidEdit: 'Impossibile verificare la prescrizione modificata, quindi nulla è stato codificato.',

  /* ── phase 7d: export recap at step 3 (append-only) ── */
  exportRecapHeading: 'Riepilogo dell’esportazione',
  recapPatientLabel: 'Paziente',
  recapPrescriberLabel: 'Prescrittore / Organizzazione',
  recapMedicamentsLabel: 'Farmaci',
  recapExtractionLabel: 'Estrazione',
  recapEditsLabel: 'Modifiche',
  recapPatientBorn: '{name} · data di nascita {date}',
  recapEdited: 'Modificato',
  recapValid: 'Valido ({warnings} avvisi)',
  recapBlocked: 'Bloccato: {errors} errori, {warnings} avvisi',

  /* ── phase 8a: guided tasks, required counter, recap shortcuts (append-only) ── */
  taskHeading: 'Azioni richieste',
  taskAddRequired: 'Aggiungi {field}',
  taskGoToField: 'Vai al campo {field}',
  taskFieldFallback: 'campo',
  technicalDetailsLabel: 'Dettagli tecnici',
  reviewRequiredCount: '{done} di {total} campi obbligatori completati',
  reviewRequiredBlocked: 'Esportazione ancora bloccata: {n} problemi bloccanti',
  recapFixField: 'Correggi i dati del {section}',

  /* ── phase 8b: advisory inline hints under editable fields (append-only) ── */
  advisoryGlnHint: 'Il GLN deve essere un numero di 13 cifre — il validatore lo confermerà al salvataggio.',
  advisoryDateFormatHint: 'Usare il formato YYYY-MM-DD.',
  advisoryRequiredHint: 'Obbligatorio — il validatore lo elenca in Azioni richieste.',

  /* ── phase 8c: structured JSON missing-required marks (append-only) ── */
  jsonMissingRequired: 'proprietà obbligatorie mancanti',

  /* ── phase 8d: honest section-level labels for unrendered required keys (append-only) ── */
  taskGoToSectionData: 'Vai ai dati {section}',
  taskAddSectionData: 'Aggiungi i dati {section}',

  /* ── i18n phase 2: header language selector (append-only) ── */
  uiLanguageLabel: 'Lingua',

  /* ── i18n phase 5: PDF panel + review table labels (append-only) ── */
  pdfReviewSectionHeading: 'dati della prescrizione',
  pdfReviewSectionSummary: 'dati del paziente',
  pdfReviewSectionMedicaments: 'farmaci',
  pdfReviewFieldLanguage: 'Lingua',
  pdfReviewFieldFirstName: 'Nome',
  pdfReviewFieldLastName: 'Cognome',
  pdfReviewFieldBirthdate: 'Data di nascita',
  pdfReviewFieldGender: 'Sesso (1 = maschile, 2 = femminile)',
  recapFixSectionPatient: 'paziente',

  /* ── i18n phase 6: guided-task field nouns, resolved per locale (append-only) ── */
  taskFieldPatient: 'paziente',
  taskFieldMedicaments: 'farmaco',
  taskFieldFName: 'nome',
  taskFieldLName: 'cognome',
  taskFieldBDt: 'data di nascita',
  taskFieldGln: 'GLN',
  taskFieldName: 'nome',
  taskFieldId: 'id del farmaco',

  /* ── i18n phase 7: messaggi dinamici del core (append-only) ── */
  coreDecodeUnknownYear:
    'ReleaseYear {year} non è definito da ChTransmissionFormat; è supportato solo 16.',
  coreDecodeBadPrefix:
    'Atteso un documento CHMED16: "CHMED16", una lettera di subversione e la cifra di compressione 0 o 1.',
  coreDecodeBadCompression:
    'La compressione deve essere la cifra 0 o 1 subito dopo la subversione.',
  coreDecodeBadBase64:
    'Il payload non è Base64 standard valido: sono ammessi solo A-Z, a-z, 0-9, "+", "/" e al massimo due caratteri "=" finali di padding.',
  coreDecodeBadGzip: 'Non è stato possibile decomprimere il payload compresso: {reason}',
  coreDecodeBadJsonUtf8:
    'I dati decompressi non sono UTF-8 valido, quindi non possono essere un documento JSON.',
  corePdfNotPdf: 'Il file selezionato non è un documento PDF.',
  corePdfPassword: 'Il PDF è protetto da password.',
  corePdfUnreadable:
    'Non è stato possibile leggere il PDF. Potrebbe essere danneggiato o usare un layout non supportato.',
  corePdfTooManyPages: 'Il PDF ha più pagine di quante questo strumento possa leggerne.',
  corePdfTooManyItems: 'La pagina del PDF contiene troppi elementi di testo da leggere.',
  corePdfTooMuchText: 'Il PDF contiene troppo testo da leggere.',
  corePdfUnexpected: 'Non è stato possibile elaborare il PDF.',
  corePdfRenderFailed: 'Non è stato possibile renderizzare il PDF.',
  corePdfOcrFailed:
    'Non è stato possibile completare il riconoscimento del testo delle pagine scansionate.',
  coreOcrLowConfidence:
    'Il testo è stato riconosciuto da una pagina scansionata; verificare ogni valore prima di usare la prescrizione.',

  /* ── i18n fase 8: messaggi dinamici di prescription-parse (solo aggiunte) ── */
  // Il parser restituisce questi messaggi come sottocodici `detail`; i valori
  // `{value}`/`{unit}`/`{reason}` sono quelli stampati sul documento.
  coreParseEmptyText: 'Il testo è vuoto; non è stato trovato alcun layout cartaceo eMediplan.',
  coreParseNoLayout:
    'Non è stata trovata alcuna intestazione di colonna per i medicamenti ("Medication", "Morning", ...); il testo non è un layout cartaceo eMediplan stampato.',
  coreParseBadStartDate: 'Impossibile leggere la data di inizio "{value}"; atteso il formato GG.MM.AAAA.',
  coreParseBadEndDate: 'Impossibile leggere la data di fine "{value}"; atteso il formato GG.MM.AAAA.',
  coreParseBadDose:
    'Impossibile leggere la dose "{value}"; atteso un numero o uno tra ½, 1/3, ¼, 2/3, ¾, 1/8.',
  coreParseBadBirthDate:
    'Impossibile leggere la data di nascita "{value}"; atteso il formato GG.MM.AAAA.',
  coreParseMissingFirstName: 'Il blocco paziente non contiene il nome.',
  coreParseMissingLastName: 'Il blocco paziente non contiene il cognome.',
  coreParseMissingBirthDate:
    'Il blocco paziente non contiene la data di nascita ("Born on:").',
  coreParseNoRows:
    "Non è stata trovata alcuna riga di medicamento sotto l'intestazione delle colonne.",
  coreParseMissingIssueDate: 'Il documento non contiene un "Issue date:" leggibile.',
  coreParseIncomplete: 'La prescrizione è incompleta.',
  coreParseNoCrypto:
    'Impossibile generare un id della prescrizione: questo browser non fornisce né crypto.randomUUID né crypto.getRandomValues.',
  coreParseUnreadableText: 'Non è stato possibile leggere il testo eMediplan: {reason}',
  coreParseMissingWeight:
    'La riga stampata di altezza/peso non contiene un peso leggibile; viene omessa invece di essere inventata.',
  coreParseMissingHeight:
    "La riga stampata di altezza/peso non contiene un'altezza leggibile; viene omessa invece di essere inventata.",
  coreParseRenalUnknown:
    'Lo stadio renale stampato "{value}" non corrisponde a uno stadio di chmed16a/README.md:819-848; non è stata inventata alcuna voce di rischio.',
  coreParseDiabetesUnknown:
    'Lo stato di diabete stampato "{value}" non è uno dei tipi previsti (779 = tipo 1, 780 = tipo 2, chmed16a/README.md:911-922); non è stata inventata alcuna voce di rischio.',
  coreParseDiabetesUnmatched:
    'Lo stato di diabete stampato "{value}" non corrisponde a un tipo previsto (779/780, chmed16a/README.md:911-922); non è stata inventata alcuna voce di rischio.',
  coreParseAllergyUnknown:
    'L\'allergia stampata "{value}" non ha corrispondenze negli id allergia del repository (elenco CDSCODE esterno, chmed16a/README.md:809,906); è stata omessa.',
  coreParseUnitUnknown:
    'L\'unità stampata "{value}" non è nel dizionario delle unità; viene mantenuta così com\'è.',
  coreParseUnitLeak:
    'L\'unità stampata "{value}" contiene altro testo dopo l\'unità riconosciuta; viene mantenuta solo "{unit}".',
  coreParseMissingStartDate:
    'Per questa riga di medicamento non è stata trovata una data di inizio stampata ("Von"); "DtFrom" mantiene il segnaposto vuoto obbligatorio.',
  coreParseRouteUndetermined:
    'Non è stato possibile dedurre una via di somministrazione dal testo stampato; "Roa" viene omesso.',
  coreParseAnnotationDesync:
    'La geometria delle righe delle annotazioni di collegamento e le righe di medicamento analizzate non corrispondono uno a uno; gli id prodotto (IdType 4) sono stati scartati e sono state mantenute le identità dal testo stampato.',
  coreParseLanguageUndetected:
    'Il vocabolario stampato non corrisponde a una lingua mappata da questo parser; "Lng" mantiene il segnaposto vuoto obbligatorio (il rilevamento di francese e italiano è rimandato al piano i18n).',
} satisfies Record<MessageKey, string>;
