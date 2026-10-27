/**
 * Hand-written TypeScript mirror of the CHMED16A JSON object model.
 *
 * Verified against the local specification (abbreviated JSON field names kept
 * exactly as serialized):
 * - `chmed16a/README.md:207-400`  Medication
 * - `chmed16a/README.md:402-573`  Patient
 * - `chmed16a/README.md:574-614`  PatientId
 * - `chmed16a/README.md:615-706`  MedicalData (MP only)
 * - `chmed16a/README.md:707-758`  Measurement (MP only)
 * - `chmed16a/README.md:759-923`  RiskCategory (MP only)
 * - `chmed16a/README.md:925-1086` Medicament
 * - `chmed16a/README.md:1087-1186` Posology
 * - `chmed16a/README.md:1187-1266` TakingTime (MP only)
 * - `chmed16a/README.md:1267-1317` Recommendation (PMC only)
 * - `chmed16a/README.md:1318-1360` PrivateField
 * - `chmed16a/prescription.md:209-894` Rx variant (rev 1-3)
 *
 * Only the 16A enums are modelled. The 23A enums are intentionally *not*
 * imported: e.g. 23A `Gender.Other = 3` is not valid in 16A.
 */

/** Medication type discriminator: 1 = MP, 2 = PMC, 3 = Rx. */
export type MedType = 1 | 2 | 3;

/** 1 = male, 2 = female (16A only). */
export type Gender = 1 | 2;

/** 1 = insurance card number (the only 16A value). */
export type PatientIdType = 1;

/** 1 = weight, 2 = height. */
export type MeasurementType = 1 | 2;

/** 1 = centimetre (height), 2 = kilogram (weight). */
export type MeasurementUnit = 1 | 2;

/** 1 = none, 2 = GTIN, 3 = pharmacode, 4 = product number (not for Rx). */
export type MedicamentIdType = 1 | 2 | 3 | 4;

/** Risk category id (RC id), 1..7. */
export type RiskCategoryId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Boolean-like flag encoded as 0 or 1. */
export type YesNo = 0 | 1;

/** `chmed16a/README.md:1318-1360` */
export interface PrivateField {
  Nm: string;
  Val?: string;
  PFields?: PrivateField[];
}

/** `chmed16a/README.md:574-614` */
export interface PatientId {
  Type: PatientIdType;
  Val: string;
}

/** `chmed16a/README.md:707-758` — `Val` is a string by specification. */
export interface Measurement {
  Type: MeasurementType;
  Val: string;
  Unit: MeasurementUnit;
}

/**
 * `chmed16a/README.md:759-923`.
 *
 * `R` holds _Risk Id_ values. For RC 6 (allergies) these are external CDSCODE
 * codes, therefore `number | string`; for the other categories they are numeric
 * table ids (1..7 is the *category* id, the entries are e.g. 577).
 */
export interface RiskCategory {
  Id: RiskCategoryId;
  R?: Array<number | string>;
}

/** `chmed16a/README.md:1187-1266` — MP only. */
export interface TakingTime {
  Off: number;
  Du?: number;
  DoFrom?: number;
  DoTo?: number;
  A?: number;
  MA?: number;
}

/** `chmed16a/README.md:1087-1186` (MP). */
export interface PosologyMp {
  DtFrom: string;
  DtTo?: string;
  CyDu?: number;
  InRes?: YesNo;
  D?: number[];
  TT?: TakingTime[];
}

/** `chmed16a/README.md:1087-1186` (PMC). */
export interface PosologyPmc {
  DtFrom: string;
  DtTo?: string;
  D?: number[];
}

/** `chmed16a/prescription.md:682-719` (Rx: only `DtTo` and `D`). */
export interface PosologyRx {
  DtTo?: string;
  D?: number[];
}

/** `chmed16a/README.md:615-706` — MP only. */
export interface MedicalData {
  DLstMen?: string;
  Prem?: YesNo;
  ToG?: string;
  Rc?: RiskCategory[];
  Meas?: Measurement[];
  PFields?: PrivateField[];
}

/** `chmed16a/README.md:402-573` (MP). */
export interface PatientMp {
  FName?: string;
  LName?: string;
  BDt?: string;
  Gender?: Gender;
  Street?: string;
  Zip?: string;
  City?: string;
  Lng: string;
  Phone?: string;
  Email?: string;
  Ids?: PatientId[];
  PFields?: PrivateField[];
  Med?: MedicalData;
}

/** `chmed16a/README.md:402-573` (PMC). */
export interface PatientPmc {
  FName: string;
  LName: string;
  BDt: string;
  Gender?: Gender;
  Street?: string;
  Zip?: string;
  City?: string;
  Phone?: string;
  Email?: string;
  Ids?: PatientId[];
  PFields?: PrivateField[];
}

/** `chmed16a/prescription.md:394-523` (Rx). */
export interface PatientRx {
  FName: string;
  LName: string;
  BDt: string;
  Gender?: Gender;
  Street?: string;
  Zip?: string;
  City?: string;
  Phone?: string;
  Email?: string;
  Rcv?: string;
  Ids?: PatientId[];
  PFields?: PrivateField[];
}

/** `chmed16a/README.md:925-1086` (MP). */
export interface MedicamentMp {
  Id: string;
  IdType: MedicamentIdType;
  Pos?: PosologyMp[];
  Unit: string;
  TkgRsn?: string;
  AppInstr?: string;
  /**
   * Required by the table (`chmed16a/README.md:1010-1022`) but omitted by the
   * official example (`chmed16a/README.md:1364-1538`); modelled as optional and
   * never reported so the canonical example stays valid.
   */
  AutoMed?: YesNo;
  PrscbBy?: string;
  Roa?: string;
  PFields?: PrivateField[];
}

/** `chmed16a/README.md:925-1086` (PMC). */
export interface MedicamentPmc {
  Id: string;
  IdType: MedicamentIdType;
  Pos?: PosologyPmc[];
  Unit?: string;
  TkgRsn?: string;
  AppInstr?: string;
  AutoMed?: YesNo;
  PFields?: PrivateField[];
}

/** `chmed16a/prescription.md:563-680` (Rx). */
export interface MedicamentRx {
  Id: string;
  IdType: MedicamentIdType;
  Pos?: PosologyRx[];
  Unit?: string;
  AppInstr?: string;
  Rep?: number;
  Subs?: YesNo;
  NbPack?: number;
  PFields?: PrivateField[];
  /** Since revision 3, format `00000.00`. */
  IndC?: string;
}

/** `chmed16a/README.md:1267-1317` — PMC only. */
export interface Recommendation {
  Id: string;
  PatAgr?: YesNo;
  Rmk?: string;
}

/** `chmed16a/prescription.md:761-804` — Rx since revision 2. */
export interface HealthcarePerson {
  Gln: string;
  FName: string;
  LName: string;
  Zsr?: string;
}

/** `chmed16a/prescription.md:806-894` — Rx since revision 2. */
export interface HealthcareOrganization {
  Name: string;
  NameAffix?: string;
  Street: string;
  Zip: string;
  City: string;
  Country?: string;
  Zsr?: string;
  Phone?: string;
  Email?: string;
}

/** `chmed16a/README.md:207-400` (MP root object). */
export interface MedicationMp {
  MedType: 1;
  Id: string;
  Auth: string;
  Zsr?: string;
  Dt: string;
  Rmk?: string;
  ValBy?: string;
  ValDt?: string;
  PSchema?: string;
  PFields?: PrivateField[];
  Patient: PatientMp;
  Medicaments?: MedicamentMp[];
}

/** `chmed16a/README.md:207-400` (PMC root object). */
export interface MedicationPmc {
  MedType: 2;
  Id: string;
  Auth: string;
  Dt: string;
  ValBy?: string;
  ValDt?: string;
  PSchema?: string;
  PFields?: PrivateField[];
  Patient: PatientPmc;
  Medicaments?: MedicamentPmc[];
  Recoms?: Recommendation[];
}

/**
 * `chmed16a/prescription.md:209-392` (Rx root object).
 *
 * `rev` is required from revision 2 on; when absent revision 1 is assumed
 * (`prescription.md:225-233`). `HcPerson`/`HcOrg` are required from revision 2.
 */
export interface MedicationRx {
  rev?: number;
  MedType: 3;
  Id: string;
  Auth: string;
  Zsr?: string;
  Dt: string;
  Rmk?: string;
  PSchema?: string;
  PFields?: PrivateField[];
  Patient: PatientRx;
  Medicaments?: MedicamentRx[];
  HcPerson?: HealthcarePerson;
  HcOrg?: HealthcareOrganization;
}

/** Any CHMED16A medication object, discriminated by `MedType`. */
export type Medication = MedicationMp | MedicationPmc | MedicationRx;
