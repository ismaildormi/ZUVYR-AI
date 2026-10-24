"""Bundle the source browser playtest into one offline HTML file and a download ZIP.

No external packages or network access are needed. Run after editing index/style/engine/main.
"""
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')
engine = re.sub(r'(?m)^export\s+', '', (root / 'engine.mjs').read_text(encoding='utf-8'))
main = (root / 'main.mjs').read_text(encoding='utf-8')
main, count = re.subn(r'^import .*? from [\'\"]\.\/engine\.mjs[\'\"];\s*', '', main, count=1)
assert count == 1 and not re.search(r'(?m)^(export|import)\s', engine + '\n' + main)
html = html.replace('<link rel="stylesheet" href="./style.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script type="module" src="./main.mjs"></script>',
                    '<script>\n' + engine + '\n' + main + '\n</script>')
assert 'src="./main.mjs"' not in html and 'href="./style.css"' not in html
outfile = root / 'Ultimate-Football-Chase-V2-PLAY.html'
outfile.write_text(html, encoding='utf-8')
with ZipFile(root / 'Ultimate-Football-Chase-V2-Offline.zip', 'w', ZIP_DEFLATED) as archive:
    archive.write(outfile, outfile.name)
print(f'Wrote {outfile.name} and {outfile.stem.replace("-PLAY", "-Offline")}.zip')
