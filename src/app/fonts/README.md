# Bundled fonts

Unmodified upright variable WOFF2 files, served by `next/font/local` from the
installation itself. No font CDN or runtime external request is used.
The standalone build copies all three license notices verbatim to
`/_next/static/font-licenses/`; Docker packages the same static output.

| File                             | Official release                                                                                                                   | Weight range | License                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------- |
| InterVariable.woff2              | [Inter 4.1](https://github.com/rsms/inter/releases/tag/v4.1), `web/InterVariable.woff2`                                            | 100–900      | SIL OFL 1.1, Inter-LICENSE.txt        |
| SourceSans3VF-Upright.woff2      | [Source Sans 3.052R](https://github.com/adobe-fonts/source-sans/releases/tag/3.052R), `WOFF2/VF/SourceSans3VF-Upright.ttf.woff2`   | 200–900      | SIL OFL 1.1, SourceSans3-LICENSE.txt  |
| SourceSerif4Variable-Roman.woff2 | [Source Serif 4.005R](https://github.com/adobe-fonts/source-serif/releases/tag/4.005R), `VAR/SourceSerif4Variable-Roman.ttf.woff2` | 200–900      | SIL OFL 1.1, SourceSerif4-LICENSE.txt |

Editorial uses Source Serif 4 for display headings and Inter for body/controls;
Modern uses Inter; Humanist uses Source Sans 3. Italics use browser synthesis.
Email uses named local families with Georgia/Arial fallbacks; email clients may
replace fonts and colours. The web assets are not embedded in email messages.
