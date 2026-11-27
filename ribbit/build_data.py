import re, json, sys
src, out = sys.argv[1], sys.argv[2]
t = open(src, encoding='utf8').read()

TOK = re.compile(r'[0-9A-Za-z@₪]+(?:[.\-/,:_][0-9A-Za-z@]+)*|.', re.S)
def fix_ltr(m):
    seg = m.group(1)
    return ''.join(reversed(TOK.findall(seg)))
def clean(line):
    line = re.sub('‪([^‪‫‬]*)‬', fix_ltr, line)
    line = re.sub('[‪-‮‎‏]', '', line)
    line = re.sub('[\uf076\uf0ac\uf099]', '•', line)
    line = re.sub(r'\s+', ' ', line).strip()
    return line

pages = t.split('\f')
BODY_START, BODY_END = 17, 283   # 1-based pdf pages
OFFSET = 16
chapters = []
cur = None
para = []
blocks = None

def flush():
    global para
    if para and cur is not None:
        txt = ' '.join(para)
        txt = re.sub(r'\s+([,.:;?!)])', r'\1', txt)
        txt = re.sub(r'\(\s+', '(', txt)
        kind = 'p'
        if txt.startswith('"') or txt.startswith('“'):
            kind = 'q'
        elif re.match(r'^(כתב|פסק) (ה)?שו"ע', txt) or txt.startswith('כתב השו"ע') or txt.startswith('ופסק השו"ע'):
            kind = 'sa'
        elif txt.startswith('והרמ"א כתב') or txt.startswith('כתב הרמ"א') or txt.startswith('הרמ"א כתב'):
            kind = 'sa'
        cur['blocks'].append({'t': kind, 'x': txt, 'pg': parapg})
    para = []

SIMAN_RE = re.compile(r'^סימן [קר][^\s]*(?:\s*-\s*[קר][^\s]*)?\s*[–-]\s*.+')
EXTRA = ["הלואה על פי 'היתר עיסקא'", 'השקעות ומכשירים פיננסיים']
topic_n = 0
parapg = 1
pending_title = None
for pi in range(BODY_START - 1, BODY_END):
    curpage = pi + 1 - OFFSET
    lines = [clean(l) for l in pages[pi].split('\n')]
    lines = [l for l in lines if l and '____' not in l]
    for i, l in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else ''
        if (SIMAN_RE.match(l) and (nxt.startswith('ובו') or len(l) < 70 and (cur is None or l.split()[1] not in cur['title']))) or l in EXTRA:
            if cur and l.startswith(cur['title'][:12]) and not nxt.startswith('ובו') and l not in EXTRA:
                pass
            else:
                flush()
                cur = {'id': 'c%d' % (len(chapters) + 1), 'title': l, 'sub': '', 'pg': curpage, 'blocks': []}
                chapters.append(cur)
                continue
        if cur is None:
            continue
        if (l.startswith('ובו') or l.startswith('בו ')) and not cur['blocks'] and not cur['sub']:
            cur['sub'] = l; continue
        # continuation of a wrapped siman title (e.g. "...ועד היכן צריך" / "ליזהר ממנו")
        if not cur['blocks'] and not cur['sub'] and not para and len(l) < 40 and not l.startswith('סעיף') and not l.startswith('•'):
            cur['title'] += ' ' + l; continue
        m = re.match(r"^סעיף ([א-ת\"']+)['׳]?\s*:?\s*$", l) or re.match(r"^סעיפים ([^:]+):?$", l)
        if m:
            flush(); cur['blocks'].append({'t': 's', 'x': l.rstrip(':'), 'pg': curpage}); continue
        if l.startswith('•'):
            flush(); topic_n += 1
            cur['blocks'].append({'t': 'h', 'x': l.lstrip('• ').strip(), 'id': 't%d' % topic_n, 'pg': curpage}); continue
        if not para: parapg = curpage
        para.append(l)
        if len(l) < 62 or l.endswith(':'):
            flush()
flush()

for c in chapters:
    c['title'] = re.sub(r'\s+', ' ', c['title']).strip()

# front matter: introduction
intro = []
for pi in [4]:
    ls = [clean(l) for l in pages[pi].split('\n')]
    buf = []
    for l in ls[1:]:
        if not l: continue
        buf.append(l)
        if len(l) < 62:
            intro.append(re.sub(r'\s+([,.:;?!)])', r'\1', ' '.join(buf))); buf = []
    if buf: intro.append(' '.join(buf))

data = {'title': 'סיכום הלכות ריבית', 'sub': 'יו"ד סימנים קנ"ט – קע"ז', 'author': 'שמואל אהרון ברוכיאן',
        'intro': intro, 'chapters': chapters}
s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
open(out, 'w', encoding='utf8').write('window.BOOK=' + s + ';\n')
for c in chapters:
    print(c['id'], c['pg'], c['title'], '|', c['sub'], '| blocks', len(c['blocks']),
          'topics', sum(b['t'] == 'h' for b in c['blocks']), 'seifs', sum(b['t'] == 's' for b in c['blocks']))
print('size', len(s))
