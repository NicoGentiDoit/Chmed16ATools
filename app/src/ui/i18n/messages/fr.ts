/**
 * French UI dictionary.
 *
 * Complete translation of the English source key set: phases 3-5 swept the three
 * panels and their components, phase 6 the shell, shared-component, guided-task
 * and JSON-viewer keys. No entry is a placeholder copy of `en` any more; only
 * acronyms, spec terms and strings that are genuinely the same in French stay
 * identical. The key set must stay identical to `en` (phase 10 asserts it
 * fail-closed).
 */

import type { MessageKey, Messages } from './en';

export const fr: Messages = {
  appTitle: 'CHMED16A Tools',
  appDescription:
    'Validez, encodez, décodez, générez et scannez des documents CHMED16A entièrement dans votre navigateur.',
  disclaimer:
    'Outil de développement et de test uniquement — pas un dispositif médical certifié, pas destiné à un usage clinique. Vos données ne quittent jamais ce navigateur.',

  tablistLabel: 'Mode outil',
  tabJsonToChmed: 'JSON → CHMED16A',
  tabChmedToJson: 'CHMED16A → JSON',
  tabPdfToChmed: 'PDF → CHMED16A',

  jsonInputLabel: 'Document JSON CHMED16A',
  jsonInputHint:
    "Collez ou saisissez un document de prescription CHMED16A. Rien n'est envoyé à un serveur.",
  validateJson: 'Valider le JSON',
  encodeToChmed: 'Encoder en CHMED16A',

  validationHeading: 'Résultats de validation',
  resultsHeading: 'Résultats de décodage et de validation',
  errorsLabel: 'Erreurs',
  warningsLabel: 'Avertissements',
  noFindings: 'Aucun problème détecté.',
  notValidated: 'Pas encore vérifié.',
  emptyInput: "Saisissez d'abord un document.",
  analysisFailed: "Le document n'a pas pu être analysé.",
  clear: 'Effacer',
  clearInputAccessibleName: "Effacer le document d'entrée",
  clearOutputAccessibleName: 'Effacer le résultat de sortie',

  chmedOutputHeading: 'Chaîne CHMED16A encodée',
  chmedOutputLabel: 'Chaîne CHMED16A',
  chmedOutputHint: 'Résultat en lecture seule. Utilisez Copier ou Télécharger pour le réutiliser.',
  copy: 'Copier',
  copyChmedAccessibleName: 'Copier la chaîne CHMED16A encodée',
  download: 'Télécharger',
  downloadChmedAccessibleName: 'Télécharger la chaîne CHMED16A encodée en tant que fichier .txt',
  downloadPng: 'Télécharger le PNG',
  downloadPngAccessibleName: 'Télécharger le code QR en image PNG',
  copied: 'Copié dans le presse-papiers.',
  copyFailed: 'Presse-papiers indisponible. Sélectionnez le texte et copiez-le manuellement.',
  chmedFilename: 'chmed16a.txt',
  jsonFilename: 'chmed16a.json',
  qrFilename: 'chmed16a-qr.png',

  qrHeading: 'Code QR',
  qrEcLabel: "Niveau de correction d'erreur du code QR",
  qrEcHint: 'Les niveaux plus élevés résistent mieux aux dommages mais contiennent moins de données. Par défaut : M.',
  qrAriaLabel: "Code QR CHMED16A, niveau de correction d'erreur {level}",
  qrInfo: 'Version {version} · {bytes} octets UTF-8',
  qrOverflow:
    "Le document ne tient pas dans un code QR au niveau de correction d'erreur {level} ({bytes} octets UTF-8). Choisissez un niveau inférieur ou raccourcissez le document.",
  qrEmpty: 'Encodez un document pour voir son code QR.',
  qrPngFailed:
    "Le code QR n'a pas pu être exporté en image PNG. Réessayez ou faites une capture d'écran de l'aperçu.",

  chmedInputLabel: 'Document CHMED16A',
  chmedInputHint:
    'Les documents compressés (CHMED16A1…) et non compressés (CHMED16A0…) sont tous deux acceptés.',
  decodeToJson: 'Décoder en JSON',

  scanHeading: 'Scanner un code QR',
  scanFileLabel: 'Fichier image du code QR',
  scanFileHint:
    'PNG, JPEG ou toute image lisible par le navigateur. Le téléversement fonctionne toujours ; la caméra est facultative.',
  scanNoQr: 'Aucun code QR trouvé dans cette image. Essayez une photo plus nette et plus proche.',
  scanImageFailed: "L'image n'a pas pu être lue. Choisissez un fichier PNG ou JPEG.",
  scanSuccess: 'Code QR lu.',
  cameraStart: 'Démarrer la caméra',
  cameraStop: 'Arrêter la caméra',
  cameraPreview: 'Aperçu de la caméra',
  cameraPermissionHint:
    "La caméra ne démarre qu'en appuyant sur Démarrer la caméra et s'arrête lorsque vous quittez cet onglet.",
  cameraUnavailable:
    "Caméra indisponible. Vérifiez l'autorisation du navigateur et qu'une caméra est connectée — ou utilisez le téléversement d'image au lieu de la caméra.",

  jsonOutputHeading: 'JSON décodé',
  jsonOutputLabel: 'Document JSON décodé',
  jsonOutputHint: 'JSON en lecture seule, mis en forme.',
  copyJsonAccessibleName: 'Copier le document JSON décodé',
  downloadJsonAccessibleName: 'Télécharger le document JSON décodé en tant que fichier .json',

  pdfFileLabel: 'Document PDF eMediplan',
  pdfFileHint:
    'Mise en page papier eMediplan imprimée. Les PDF textuels sont lus directement ; les PDF scannés sont reconnus hors ligne, page par page.',
  pdfProcess: 'Traiter le PDF',
  pdfIdle: 'Choisir un fichier PDF pour en extraire l’ordonnance électronique.',
  pdfProcessing:
    'Lecture du PDF. Les documents scannés sont reconnus hors ligne et peuvent prendre un certain temps.',
  pdfSuccess: 'Ordonnance extraite de {pages} page(s).',
  pdfFindingsHeading: 'Résultats de l’extraction',
  pdfSuccessTextLayer: 'Texte lu directement dans la couche texte du PDF ({pages} page(s)).',
  pdfSuccessOcr: 'Texte reconnu sur {pages} page(s) scannée(s) avec OCR hors ligne.',
  pdfSuccessValidated: 'L’ordonnance extraite est valide et a été encodée avec succès.',
  pdfStageExtract: 'Le PDF n’a pas pu être lu.',
  pdfStageOcr: 'Les pages scannées n’ont pas pu être reconnues.',
  pdfStageParse: 'Aucune ordonnance eMediplan n’a été trouvée dans le texte.',
  pdfStageParseValues:
    'La mise en page eMediplan a été reconnue, mais certaines valeurs imprimées n’ont pas pu être lues ; vérifier les erreurs.',
  pdfStageValidate: 'L’ordonnance extraite n’est pas valide.',
  pdfStageEncode: 'L’ordonnance n’a pas pu être encodée.',
  pdfUnexpected: 'Le PDF n’a pas pu être traité.',
  pdfReadFailed: 'Le fichier sélectionné n’a pas pu être lu.',
  pdfFileTooLarge:
    'Le PDF sélectionné dépasse 25 Mo. Choisir un fichier plus petit.',
  pdfJsonOutputHeading: 'JSON de l’ordonnance électronique extraite',
  pdfJsonOutputLabel: 'JSON de l’ordonnance électronique',
  pdfDraftHeading: 'Brouillon du JSON de l’ordonnance électronique (non encodé)',
  pdfDraftHint:
    'Brouillon — l’ordonnance analysée est affichée pour contrôle ; corriger les erreurs listées pour activer la sortie CHMED16A.',
  pdfDraftStatus: 'Brouillon uniquement : l’ordonnance extraite n’est pas valide, aucune sortie CHMED16A n’a donc été produite.',
  pdfQrEmpty: 'Extraire une ordonnance pour voir son code QR.',

  /* ── icon accessible names (for aria-label on button wrappers) ── */
  iconCheckLabel: 'Succès',
  iconAlertLabel: 'Avertissement',
  iconXLabel: 'Erreur',
  iconEyeLabel: 'Afficher',
  iconEyeOffLabel: 'Masquer',
  iconDownloadLabel: 'Télécharger',
  iconCopyLabel: 'Copier',
  iconCameraLabel: 'Caméra',
  iconUploadLabel: 'Téléverser un fichier',
  iconQrLabel: 'Code QR',

  /* ── workbench shell: brand, skip link, home (appended in phase 2) ── */
  workbenchSubtitle: 'Convertir et valider des plans thérapeutiques suisses',
  skipToContent: 'Aller au contenu',
  versionBadge: 'v{version}',
  homeHeading: 'Choisir un flux',
  homeCardJsonDescription:
    'Collez ou saisissez un document JSON CHMED16A, validez-le et encodez-le en une chaîne CHMED16A avec son code QR.',
  homeCardJsonBadge: 'JSON',
  homeCardChmedDescription:
    'Décodez une chaîne CHMED16A compressée ou non compressée, ou scannez son code QR, pour revenir à un JSON lisible.',
  homeCardChmedBadge: 'CHMED16A',
  homeCardPdfDescription:
    'Extrayez une ordonnance électronique d’un PDF eMediplan imprimé. Les pages scannées sont reconnues hors ligne.',
  homeCardPdfBadge: 'PDF',
  openFlowLabel: 'Ouvrir {flow}',

  /* ── phase 4b: three-level findings, distinct PDF output clears (append-only) ── */
  infoLabel: 'Info',
  clearJsonOutputAccessibleName: 'Vider la sortie JSON extraite',
  clearChmedOutputAccessibleName: 'Vider la chaîne CHMED16A encodée',

  /* ── phase 5: JSON input drop zone (append-only) ── */
  jsonInputDragHint: 'Vous pouvez aussi déposer ici un fichier .json ou .txt ; son texte remplace le contenu du champ.',
  dropFileUnsupported: '"{name}" n\'est pas un fichier texte .json ou .txt. Rien n\'a été chargé.',
  dropFileTooLarge: '"{name}" dépasse 1 MiB. Rien n\'a été chargé.',
  dropMultipleFiles: 'Déposez un seul fichier à la fois. "{name}" n\'a pas été chargé.',
  dropReadFailed: 'Le fichier déposé n\'a pas pu être lu. Rien n\'a été chargé.',

  /* ── phase 6: CHMED16A → JSON structured view (append-only) ── */
  jsonViewGroupLabel: 'Vue de sortie',
  jsonViewStructured: 'Structurée',
  jsonViewRaw: 'JSON brut',
  jsonDocumentSection: 'Document',
  jsonSectionItem: '{count} élément',
  jsonSectionItems: '{count} éléments',
  jsonSectionKey: '{count} clé',
  jsonSectionKeys: '{count} clés',
  jsonSectionEmpty: 'vide',
  jsonTypeString: 'chaîne',
  jsonTypeNumber: 'nombre',
  jsonTypeBoolean: 'booléen',
  jsonTypeNull: 'null',
  jsonTypeUnknown: 'valeur',

  /* ── phase 7a: PDF steps + first-page preview (append-only) ── */
  pdfStepIndicatorLabel: 'Étapes de traitement du PDF',
  pdfStepOf: 'Étape {current} sur 3',
  pdfStep1Label: 'Importation',
  pdfStep2Label: 'Contrôle',
  pdfStep3Label: 'Export',
  pdfPreviewHeading: 'Aperçu de la première page',
  pdfPreviewAriaLabel: 'Première page du PDF sélectionné',
  pdfPreviewFailed: 'La première page n’a pas pu être prévisualisée. Le traitement n’est pas affecté.',

  /* ── phase 7b: read-only review table (append-only) ── */
  pdfReviewCaption: 'Contrôle : {section}',
  pdfReviewFieldHeader: 'Champ',
  pdfReviewValueHeader: 'Valeur',
  pdfReviewStatusHeader: 'Statut',
  pdfReviewPositionHeader: 'Pos',
  pdfReviewIdHeader: 'Id / GTIN',
  pdfReviewUnitHeader: 'Unité',
  pdfReviewInstructionsHeader: 'Instructions d’emploi',
  statusRecognized: 'Reconnu',
  statusToVerify: 'À vérifier',
  statusAbsent: 'Non renseigné',
  reviewValuePlaceholder: '—',

  /* ── phase 7c: inline editing of the review table (append-only) ── */
  reviewEditableHint:
    'Modifier une valeur, puis quitter le champ : l’ordonnance est vérifiée à nouveau et la sortie CHMED16A suit le résultat.',
  reviewCellAriaLabel: 'Modifier {field} ({row})',
  reviewMedicamentRow: 'Médicament {position}',
  reviewInvalidEdit: 'L’ordonnance modifiée n’a pas pu être contrôlée, rien n’a donc été encodé.',

  /* ── phase 7d: export recap at step 3 (append-only) ── */
  exportRecapHeading: 'Récapitulatif de l’export',
  recapPatientLabel: 'Patient',
  recapPrescriberLabel: 'Prescripteur / Organisation',
  recapMedicamentsLabel: 'Médicaments',
  recapExtractionLabel: 'Extraction',
  recapEditsLabel: 'Modifications',
  recapPatientBorn: '{name} · né(e) le {date}',
  recapEdited: 'Modifié',
  recapValid: 'Valide ({warnings} avertissements)',
  recapBlocked: 'Bloqué : {errors} erreurs, {warnings} avertissements',

  /* ── phase 8a: guided tasks, required counter, recap shortcuts (append-only) ── */
  taskHeading: 'Actions requises',
  taskAddRequired: 'Ajouter {field}',
  taskGoToField: 'Aller au champ {field}',
  taskFieldFallback: 'champ',
  technicalDetailsLabel: 'Détails techniques',
  reviewRequiredCount: '{done} sur {total} champs obligatoires complétés',
  reviewRequiredBlocked: 'Export toujours bloqué : {n} problèmes bloquants',
  recapFixField: 'Corriger les données du {section}',

  /* ── phase 8b: advisory inline hints under editable fields (append-only) ── */
  advisoryGlnHint: 'Le GLN doit être un nombre à 13 chiffres — le validateur le confirmera à l’enregistrement.',
  advisoryDateFormatHint: 'Utiliser le format YYYY-MM-DD.',
  advisoryRequiredHint: 'Obligatoire — le validateur le liste dans Actions requises.',

  /* ── phase 8c: structured JSON missing-required marks (append-only) ── */
  jsonMissingRequired: 'propriétés obligatoires manquantes',

  /* ── phase 8d: honest section-level labels for unrendered required keys (append-only) ── */
  taskGoToSectionData: 'Aller aux données {section}',
  taskAddSectionData: 'Ajouter les données {section}',

  /* ── i18n phase 2: header language selector (append-only) ── */
  uiLanguageLabel: 'Langue',

  /* ── i18n phase 5: PDF panel + review table labels (append-only) ── */
  pdfReviewSectionHeading: 'données de l’ordonnance',
  pdfReviewSectionSummary: 'données du patient',
  pdfReviewSectionMedicaments: 'médicaments',
  pdfReviewFieldLanguage: 'Langue',
  pdfReviewFieldFirstName: 'Prénom',
  pdfReviewFieldLastName: 'Nom',
  pdfReviewFieldBirthdate: 'Date de naissance',
  pdfReviewFieldGender: 'Sexe (1 = masculin, 2 = féminin)',
  recapFixSectionPatient: 'patient',

  /* ── i18n phase 6: guided-task field nouns, resolved per locale (append-only) ── */
  taskFieldPatient: 'patient',
  taskFieldMedicaments: 'médicament',
  taskFieldFName: 'prénom',
  taskFieldLName: 'nom',
  taskFieldBDt: 'date de naissance',
  taskFieldGln: 'GLN',
  taskFieldName: 'nom',
  taskFieldId: 'identifiant du médicament',

  /* ── i18n phase 7 : messages dynamiques du cœur (ajout seul) ── */
  coreDecodeUnknownYear:
    'ReleaseYear {year} n’est pas défini par ChTransmissionFormat ; seul 16 est pris en charge.',
  coreDecodeBadPrefix:
    'Document CHMED16 attendu : « CHMED16 », une lettre de sous-version et le chiffre de compression 0 ou 1.',
  coreDecodeBadCompression:
    'La compression doit être le chiffre 0 ou 1 juste après la sous-version.',
  coreDecodeBadBase64:
    'La charge utile n’est pas du Base64 standard valide : seuls A-Z, a-z, 0-9, « + », « / » et au plus deux « = » finaux sont admis.',
  coreDecodeBadGzip: 'La charge utile compressée n’a pas pu être décompressée : {reason}',
  coreDecodeBadJsonUtf8:
    'Les données décompressées ne sont pas de l’UTF-8 valide et ne peuvent donc pas être un document JSON.',
  corePdfNotPdf: 'Le fichier sélectionné n’est pas un document PDF.',
  corePdfPassword: 'Le PDF est protégé par un mot de passe.',
  corePdfUnreadable:
    'Le PDF n’a pas pu être lu. Il est peut-être endommagé ou utilise une mise en page non prise en charge.',
  corePdfTooManyPages: 'Le PDF contient plus de pages que cet outil ne peut en lire.',
  corePdfTooManyItems: 'La page du PDF contient trop d’éléments de texte à lire.',
  corePdfTooMuchText: 'Le PDF contient trop de texte à lire.',
  corePdfUnexpected: 'Le PDF n’a pas pu être traité.',
  corePdfRenderFailed: 'Le PDF n’a pas pu être rendu.',
  corePdfOcrFailed:
    'La reconnaissance de texte des pages numérisées n’a pas pu être terminée.',
  coreOcrLowConfidence:
    'Le texte a été reconnu à partir d’une page numérisée ; vérifiez chaque valeur avant d’utiliser l’ordonnance.',

  /* ── i18n phase 8 : messages dynamiques de prescription-parse (ajout seul) ── */
  // Le parseur renvoie ces messages comme sous-codes `detail` ; les valeurs
  // `{value}`/`{unit}`/`{reason}` sont celles imprimées sur le document.
  coreParseEmptyText: 'Le texte est vide ; aucune mise en page papier eMediplan n’a été trouvée.',
  coreParseNoLayout:
    'Aucun en-tête de colonne des médicaments (« Medication », « Morning », ...) n’a été trouvé ; le texte n’est pas une mise en page papier eMediplan imprimée.',
  coreParseBadStartDate:
    'Impossible de lire la date de début « {value} » ; le format attendu est JJ.MM.AAAA.',
  coreParseBadEndDate:
    'Impossible de lire la date de fin « {value} » ; le format attendu est JJ.MM.AAAA.',
  coreParseBadDose:
    'Impossible de lire la dose « {value} » ; une valeur numérique ou l’un de ½, 1/3, ¼, 2/3, ¾, 1/8 est attendue.',
  coreParseBadBirthDate:
    'Impossible de lire la date de naissance « {value} » ; le format attendu est JJ.MM.AAAA.',
  coreParseMissingFirstName: 'Le bloc patient ne contient pas de prénom.',
  coreParseMissingLastName: 'Le bloc patient ne contient pas de nom.',
  coreParseMissingBirthDate:
    'Le bloc patient ne contient pas de date de naissance (« Born on: »).',
  coreParseNoRows: 'Aucune ligne de médicament n’a été trouvée sous l’en-tête des colonnes.',
  coreParseMissingIssueDate:
    'Le document ne contient aucune date d’émission (« Issue date: ») lisible.',
  coreParseIncomplete: 'L’ordonnance est incomplète.',
  coreParseNoCrypto:
    'Impossible de générer un identifiant d’ordonnance : ce navigateur ne fournit ni crypto.randomUUID ni crypto.getRandomValues.',
  coreParseUnreadableText: 'Le texte eMediplan n’a pas pu être lu : {reason}',
  coreParseMissingWeight:
    'La ligne imprimée taille/poids ne contient aucune valeur de poids lisible ; elle est omise au lieu d’être inventée.',
  coreParseMissingHeight:
    'La ligne imprimée taille/poids ne contient aucune valeur de taille lisible ; elle est omise au lieu d’être inventée.',
  coreParseRenalUnknown:
    'Le stade rénal imprimé « {value} » ne correspond à aucun stade de chmed16a/README.md:819-848 ; aucune entrée de risque n’a été inventée.',
  coreParseDiabetesUnknown:
    'Le statut diabétique imprimé « {value} » ne fait pas partie des types spécifiés (779 = type 1, 780 = type 2, chmed16a/README.md:911-922) ; aucune entrée de risque n’a été inventée.',
  coreParseDiabetesUnmatched:
    'Le statut diabétique imprimé « {value} » ne correspond à aucun type spécifié (779/780, chmed16a/README.md:911-922) ; aucune entrée de risque n’a été inventée.',
  coreParseAllergyUnknown:
    'L’allergie imprimée « {value} » n’a aucune correspondance dans les identifiants d’allergie du dépôt (liste CDSCODE externe, chmed16a/README.md:809,906) ; elle a été omise.',
  coreParseUnitUnknown:
    'L’unité imprimée « {value} » ne figure pas dans le dictionnaire des unités ; elle est conservée telle quelle.',
  coreParseUnitLeak:
    'L’unité imprimée « {value} » contient du texte après l’unité reconnue ; seule « {unit} » est conservée.',
  coreParseMissingStartDate:
    'Aucune date de début imprimée (« Von ») n’a été trouvée pour cette ligne de médicament ; « DtFrom » conserve l’espace réservé vide obligatoire.',
  coreParseRouteUndetermined:
    'Aucune voie d’administration n’a pu être déduite du texte imprimé ; « Roa » est omis.',
  coreParseAnnotationDesync:
    'La géométrie des lignes des annotations de lien et les lignes de médicament analysées ne correspondent pas une pour une ; les identifiants produit (IdType 4) ont été abandonnés et les identités issues du texte imprimé conservées.',
  coreParseLanguageUndetected:
    'Le vocabulaire imprimé ne correspond à aucune langue que ce parseur reconnaît ; « Lng » conserve l’espace réservé vide obligatoire (la détection du français et de l’italien est reportée au plan i18n).',
} satisfies Record<MessageKey, string>;
