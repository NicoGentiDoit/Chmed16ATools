/**
 * Official CHMED16A examples, embedded verbatim from the local specification.
 *
 * The values below are byte-for-byte copies of:
 * - `chtransmissionformat/README.md:106` (compressed example);
 * - `chtransmissionformat/README.md:112` (uncompressed example);
 * - `chmed16a/README.md:1364-1538` (pretty-printed JSON).
 *
 * Do not reformat: the compressed sample in particular is checked for exact
 * payload extraction. Line numbers refer to the local specification copy read on
 * 2026-10-27 (they were verified against the reported anchors).
 *
 * This module only exports data: no imports, no side effects.
 */

/** Compressed example: `CHMED16A1` + standard Base64 of the gzipped JSON. */
export const OFFICIAL_COMPRESSED = `CHMED16A1H4sIAAAAAAAEAMVU3W7TMBR+lcq3S4SPHdtx7raVAaKFqutAAnoREreJ2jpT4gKj6ptxx4txnCwVSKQSu0GVqvPX7+fIpwdyuXcFSYiSFCjloGKtNQnI2GGRUZAh1SGwBUASyYTqC8oSSnHgVe4HZM7z1UqF6WcqwkhxjCKdhcJkWc650GIlcXZq8sXDvSEJtHGZpTtjXUOSj4cORyuIpWpRu0EekFnVDYzxmwbtZ+l13dTV7g9t5Ij1eZVicfYWMRab9byxmF1urMH8zpbezO3iNTkGj4RRJIHH7Bwj/J2RhUAHGa+2e/fF1PnPH9bu7XqAnHEhZHzGrqeGJ5EXVVbk9T7bfHr20tTfBwRAxCQHen7f/y7guqi2pnGmLm1j7MbUA/Qx1VLz8/aftvvf7L9Pm2ZQAQgBTEX/QwL+dJa6Et8/SQ7kqr0z0DGEFPxbDsh16R48lqktZjdv8FYwnabfyl2KhRfG5giasIBMTj3nWp4JPrmEjJ93J+fxx5PGTY3X1tbSzuHpGDthCPUu3eKM4O2Kujbr29C3QcSd9ex0udibYyKUWvbLZX3Au54EdupFfSD6QD4CCBEIBcsjjpJZUVnv6yJCxlEsYMRk+59z62pj/MLuLBreoe2vZj2KsfOhvMcyp0yhAzLfbbzj4y8tzloh3gQAAA==`;

/** Uncompressed example: `CHMED16A0` + plain JSON text. */
export const OFFICIAL_UNCOMPRESSED = `CHMED16A0{"Auth":"7601003178999","Dt":"2016-09-12T11:46:09+02:00","Id":"26d3dff7-ab05-4737-a49c-5eccd33595f6","MedType":1,"Medicaments":[{"Id":"971867","IdType":3,"Pos":[{"D":[0,0,0,0],"DtFrom":"2016-09-12"}],"Roa":"PO","TkgRsn":"Akne","Unit":"STK"},{"Id":"4461382","IdType":3,"Pos":[{"D":[0,1,0,0],"DtFrom":"2016-02-10"}],"Roa":"PO","TkgRsn":"Blutverdünnung","Unit":"STK"},{"Id":"2355687","IdType":3,"Pos":[{"D":[1,0,1,0],"DtFrom":"2016-02-10"}],"Roa":"PO","TkgRsn":"Bluthochdruck\\/Herz","Unit":"STK"},{"Id":"1426310","IdType":3,"Pos":[{"D":[0,0,1,0],"DtFrom":"2016-02-10"}],"Roa":"PO","TkgRsn":"Cholesterinsenker","Unit":"STK"},{"Id":"809693","IdType":3,"Pos":[{"D":[1,0,0,0],"DtFrom":"2016-02-10"}],"Roa":"PO","TkgRsn":"Bluthochdruck\\/Wasser","Unit":"STK"},{"Id":"1551274","IdType":3,"Pos":[{"D":[1,0,0,0],"DtFrom":"2016-02-10"}],"Roa":"PO","TkgRsn":"Bluthochdruck\\/Wasser","Unit":"STK"}],"Patient":{"BDt":"1981-01-12","City":"Bern","FName":"Maxima","Gender":2,"LName":"Matter","Lng":"DE","Med":{"DLstMen":"","Meas":[{"Type":1,"Unit":2,"Val":"53"},{"Type":2,"Unit":1,"Val":"158"}],"Rc":[{"Id":1,"R":[577]},{"Id":2},{"Id":3,"R":[612]},{"Id":4},{"Id":5},{"Id":6,"R":[555,571]}]},"Phone":"+4158 851 2600","Street":"Untermattweg 8","Zip":"3027"},"Rmk":""}`;

/** Pretty-printed JSON medication object used by both transmission examples. */
export const OFFICIAL_PRETTY_JSON = `{
  "Auth": "7601003178999",
  "Dt": "2016-09-12T11:46:09+02:00",
  "Id": "26d3dff7-ab05-4737-a49c-5eccd33595f6",
  "MedType": 1,
  "Medicaments": [
    {
      "Id": "971867",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            0,
            0,
            0,
            0
          ],
          "DtFrom": "2016-09-12"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Akne",
      "Unit": "STK"
    },
    {
      "Id": "4461382",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            0,
            1,
            0,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Blutverdünnung",
      "Unit": "STK"
    },
    {
      "Id": "2355687",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            1,
            0,
            1,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Bluthochdruck/Herz",
      "Unit": "STK"
    },
    {
      "Id": "1426310",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            0,
            0,
            1,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Cholesterinsenker",
      "Unit": "STK"
    },
    {
      "Id": "809693",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            1,
            0,
            0,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Bluthochdruck/Wasser",
      "Unit": "STK"
    },
    {
      "Id": "1551274",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            1,
            0,
            0,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Bluthochdruck/Wasser",
      "Unit": "STK"
    }
  ],
  "Patient": {
    "BDt": "1981-01-12",
    "City": "Bern",
    "FName": "Maxima",
    "Gender": 2,
    "LName": "Matter",
    "Lng": "DE",
    "Med": {
      "DLstMen": "",
      "Meas": [
        {
          "Type": 1,
          "Unit": 2,
          "Val": "53"
        },
        {
          "Type": 2,
          "Unit": 1,
          "Val": "158"
        }
      ],
      "Rc": [
        {
          "Id": 1,
          "R": [
            577
          ]
        },
        {
          "Id": 2
        },
        {
          "Id": 3,
          "R": [
            612
          ]
        },
        {
          "Id": 4
        },
        {
          "Id": 5
        },
        {
          "Id": 6,
          "R": [
            555,
            571
          ]
        }
      ]
    },
    "Phone": "+4158 851 2600",
    "Street": "Untermattweg 8",
    "Zip": "3027"
  },
  "Rmk": ""
}`;
