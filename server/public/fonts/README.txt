This folder contains the webfont used for the dot-matrix/LED-style display.

Current font in use:
- Doto Rounded SemiBold (WOFF2) → exposed as CSS family name: "Dot Matrix"

Licensing:
- We are using the Doto font under the terms of the license described in OFL.txt in this directory (SIL Open Font License).

How it’s wired:
- server/public/styles.css declares an @font-face with font-family: "Dot Matrix" and src pointing to Doto_Rounded-SemiBold.woff2.
- Templates that want the dot-matrix look can use font-family: 'Dot Matrix', ... or include the .dotlike class where provided.

To swap fonts:
- Replace Doto_Rounded-SemiBold.woff2 with another compatible WOFF2 file.
- Update server/public/styles.css @font-face src if the filename changes.
