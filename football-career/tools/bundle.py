"""يجمع اللعبة في ملف HTML واحد (للمشاركة أو للنشر كصفحة واحدة).

الاستعمال:
    python3 football-career/tools/bundle.py out.html          # ملف كامل يفتح في أي متصفح
    python3 football-career/tools/bundle.py out.html --body   # بدون <html>/<head>/<body> (لصفحات Claude)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    out = Path(sys.argv[1])
    body_only = '--body' in sys.argv
    html = (ROOT / 'index.html').read_text(encoding='utf-8')

    css = (ROOT / 'css/style.css').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="css/style.css">', f'<style>\n{css}</style>')
    if body_only:
        # صفحات Claude تحمّل المكتبات من CDN فقط بدل تضمينها
        html = html.replace('<script src="vendor/three.min.js"></script>',
                            '<script src="https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js"></script>')
    for src in re.findall(r'<script src="((?:js|vendor)/[^"]+)"></script>', html):
        js = (ROOT / src).read_text(encoding='utf-8')
        html = html.replace(f'<script src="{src}"></script>', f'<script>\n{js}</script>')

    if body_only:
        title = re.search(r'<title>.*?</title>', html).group(0)
        links = '\n'.join(re.findall(r'<link [^>]*fonts[^>]*>', html))
        style = re.search(r'<style>.*?</style>', html, re.S).group(0)
        body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
        html = f'{title}\n<meta name="claude:viewport-fit-sides" content="cover">\n{links}\n{style}\n{body}'

    out.write_text(html, encoding='utf-8')
    print(f'{out} ({out.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
