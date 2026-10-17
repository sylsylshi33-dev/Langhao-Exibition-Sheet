# Fonts used by the PDF export

`NotoSansSC-Regular-subset.otf` is **Noto Sans SC Regular** (© Google / Adobe,
SIL Open Font License 1.1, see `OFL.txt`), reduced with `pyftsubset` to ASCII,
Latin-1, general and CJK punctuation, full-width forms and every character in
GB2312 (simplified) and Big5 (traditional) — about 16,000 glyphs, 3.8 MB.

It is bundled because a PDF must embed its own fonts and the server has no
Chinese font. Characters outside that set (very rare hanzi, emoji) print as a
blank box in the PDF; the dashboard, CSV and Excel files are unaffected.

`scripts/build-release.sh` copies this folder into the release as
`assets/fonts/`; the server reads it from there at runtime.

To regenerate (needs `pip install fonttools`):

```bash
curl -LO https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf
pyftsubset NotoSansSC-Regular.otf --text-file=chars.txt \
  --output-file=NotoSansSC-Regular-subset.otf --layout-features= --no-hinting --desubroutinize --name-IDs='*'
```
